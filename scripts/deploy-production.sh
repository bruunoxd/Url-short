#!/bin/bash

# URL Shortener Platform Production Deployment Script
# This script automates the deployment of the URL shortener platform to Kubernetes in production

set -euo pipefail

# Configuration
NAMESPACE="url-shortener"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-ghcr.io/organization}"
VERSION="${VERSION:-$(git describe --tags --always)}"
ENVIRONMENT="${ENVIRONMENT:-production}"
KUBECTL_CONTEXT="${KUBECTL_CONTEXT:-production-cluster}"
HELM_RELEASE_NAME="url-shortener"
HELM_CHART_PATH="./k8s/helm/url-shortener"
HELM_VALUES_FILE="./k8s/helm/url-shortener/values-${ENVIRONMENT}.yaml"
HELM_TIMEOUT="10m"
HELM_ATOMIC="true"
BACKUP_DIR="./backups/$(date +%Y%m%d-%H%M%S)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if kubectl is installed
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Check if docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "docker is not installed or not in PATH"
        exit 1
    fi
    
    # Check if helm is installed
    if ! command -v helm &> /dev/null; then
        log_error "helm is not installed or not in PATH"
        exit 1
    fi
    
    # Check if git is installed
    if ! command -v git &> /dev/null; then
        log_error "git is not installed or not in PATH"
        exit 1
    fi
    
    # Set kubectl context if provided
    if [[ -n "$KUBECTL_CONTEXT" ]]; then
        kubectl config use-context "$KUBECTL_CONTEXT"
        log_info "Using kubectl context: $KUBECTL_CONTEXT"
    fi
    
    # Check cluster connectivity
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    # Check if values file exists
    if [[ ! -f "$HELM_VALUES_FILE" ]]; then
        log_warning "Values file $HELM_VALUES_FILE not found, using default values.yaml"
        HELM_VALUES_FILE="$HELM_CHART_PATH/values.yaml"
    fi
    
    log_success "Prerequisites check passed"
}

# Function to build and push Docker images
build_and_push_images() {
    log_info "Building and pushing Docker images with version: $VERSION"
    
    local services=("url-shortener" "analytics" "user-management" "frontend")
    
    for service in "${services[@]}"; do
        log_info "Building $service service..."
        
        if [[ "$service" == "frontend" ]]; then
            docker build -t "${DOCKER_REGISTRY}/url-shortener-${service}:${VERSION}" \
                -f frontend/Dockerfile .
        else
            docker build -t "${DOCKER_REGISTRY}/url-shortener-${service}:${VERSION}" \
                -f "services/${service}/Dockerfile" .
        fi
        
        log_info "Pushing $service image..."
        docker push "${DOCKER_REGISTRY}/url-shortener-${service}:${VERSION}"
        
        # Tag as latest for production
        if [[ "$ENVIRONMENT" == "production" ]]; then
            docker tag "${DOCKER_REGISTRY}/url-shortener-${service}:${VERSION}" \
                "${DOCKER_REGISTRY}/url-shortener-${service}:latest"
            docker push "${DOCKER_REGISTRY}/url-shortener-${service}:latest"
        fi
        
        log_success "$service image built and pushed"
    done
}

# Function to create namespace and secrets
setup_namespace_and_secrets() {
    log_info "Setting up namespace and secrets..."
    
    # Create namespace if it doesn't exist
    kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
    
    # Label namespace for Istio injection
    kubectl label namespace "$NAMESPACE" istio-injection=enabled --overwrite
    
    # Create secrets (in production, these should be managed by a secret management system)
    if [[ "$ENVIRONMENT" == "production" ]]; then
        log_warning "In production, secrets should be managed by a secure secret management system"
        log_info "Using Vault for secret management..."
        
        # Example of using Vault for secrets (commented out as it's environment-specific)
        # vault kv get -format=json secret/url-shortener/postgres | jq -r .data.data > postgres-secrets.json
        # kubectl create secret generic postgres-secrets \
        #     --from-file=postgres-secrets.json \
        #     --namespace="$NAMESPACE" \
        #     --dry-run=client -o yaml | kubectl apply -f -
        
        # For demo purposes, we'll create random secrets
        log_warning "Creating random secrets for demo purposes"
    fi
    
    # Create secrets (these should be managed by a secret management system in production)
    kubectl create secret generic postgres-secrets \
        --from-literal=username=postgres \
        --from-literal=password="$(openssl rand -base64 32)" \
        --namespace="$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    kubectl create secret generic redis-secrets \
        --from-literal=password="$(openssl rand -base64 32)" \
        --namespace="$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    kubectl create secret generic clickhouse-secrets \
        --from-literal=username=analytics \
        --from-literal=password="$(openssl rand -base64 32)" \
        --namespace="$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    kubectl create secret generic rabbitmq-secrets \
        --from-literal=username=admin \
        --from-literal=password="$(openssl rand -base64 32)" \
        --from-literal=erlang_cookie="$(openssl rand -base64 32)" \
        --namespace="$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    kubectl create secret generic url-shortener-secrets \
        --from-literal=jwt_secret="$(openssl rand -base64 64)" \
        --from-literal=postgres_user=postgres \
        --from-literal=postgres_password="$(kubectl get secret postgres-secrets -n $NAMESPACE -o jsonpath='{.data.password}' | base64 -d)" \
        --from-literal=rabbitmq_user=admin \
        --from-literal=rabbitmq_password="$(kubectl get secret rabbitmq-secrets -n $NAMESPACE -o jsonpath='{.data.password}' | base64 -d)" \
        --namespace="$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    log_success "Namespace and secrets configured"
}

# Function to backup database before deployment
backup_databases() {
    log_info "Backing up databases before deployment..."
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    
    # Get a PostgreSQL pod
    PG_POD=$(kubectl get pods -n "$NAMESPACE" -l app=postgres -o jsonpath='{.items[0].metadata.name}')
    
    if [[ -n "$PG_POD" ]]; then
        log_info "Backing up PostgreSQL database..."
        kubectl exec -n "$NAMESPACE" "$PG_POD" -- pg_dump -U postgres url_shortener > "$BACKUP_DIR/postgres_backup.sql"
    else
        log_warning "No PostgreSQL pod found, skipping PostgreSQL backup"
    fi
    
    # Get a ClickHouse pod
    CH_POD=$(kubectl get pods -n "$NAMESPACE" -l app=clickhouse -o jsonpath='{.items[0].metadata.name}')
    
    if [[ -n "$CH_POD" ]]; then
        log_info "Backing up ClickHouse database..."
        kubectl exec -n "$NAMESPACE" "$CH_POD" -- clickhouse-client --query="SELECT * FROM analytics.click_events FORMAT CSVWithNames" > "$BACKUP_DIR/clickhouse_events.csv"
    else
        log_warning "No ClickHouse pod found, skipping ClickHouse backup"
    fi
    
    log_success "Database backups completed and stored in $BACKUP_DIR"
}

# Function to deploy with Helm
deploy_with_helm() {
    log_info "Deploying with Helm..."
    
    # Add Bitnami repo if not already added
    helm repo add bitnami https://charts.bitnami.com/bitnami
    helm repo update
    
    # Create a temporary values file with image versions
    local temp_values="/tmp/url-shortener-values-${VERSION}.yaml"
    
    # Copy the original values file
    cp "$HELM_VALUES_FILE" "$temp_values"
    
    # Update image versions in the values file
    yq e ".urlShortener.image.repository = \"${DOCKER_REGISTRY}/url-shortener-url-shortener\"" -i "$temp_values"
    yq e ".urlShortener.image.tag = \"${VERSION}\"" -i "$temp_values"
    
    yq e ".analytics.image.repository = \"${DOCKER_REGISTRY}/url-shortener-analytics\"" -i "$temp_values"
    yq e ".analytics.image.tag = \"${VERSION}\"" -i "$temp_values"
    
    yq e ".userManagement.image.repository = \"${DOCKER_REGISTRY}/url-shortener-user-management\"" -i "$temp_values"
    yq e ".userManagement.image.tag = \"${VERSION}\"" -i "$temp_values"
    
    yq e ".frontend.image.repository = \"${DOCKER_REGISTRY}/url-shortener-frontend\"" -i "$temp_values"
    yq e ".frontend.image.tag = \"${VERSION}\"" -i "$temp_values"
    
    # Deploy with Helm
    if helm status "$HELM_RELEASE_NAME" -n "$NAMESPACE" &> /dev/null; then
        log_info "Upgrading existing Helm release..."
        helm upgrade "$HELM_RELEASE_NAME" "$HELM_CHART_PATH" \
            --namespace "$NAMESPACE" \
            --values "$temp_values" \
            --timeout "$HELM_TIMEOUT" \
            --atomic="$HELM_ATOMIC" \
            --wait
    else
        log_info "Installing new Helm release..."
        helm install "$HELM_RELEASE_NAME" "$HELM_CHART_PATH" \
            --namespace "$NAMESPACE" \
            --values "$temp_values" \
            --timeout "$HELM_TIMEOUT" \
            --atomic="$HELM_ATOMIC" \
            --wait
    fi
    
    # Clean up temp file
    rm "$temp_values"
    
    log_success "Helm deployment completed"
}

# Function to run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    # Create a job to run migrations
    cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration-${VERSION}
  namespace: ${NAMESPACE}
spec:
  template:
    spec:
      containers:
      - name: migration
        image: ${DOCKER_REGISTRY}/url-shortener-url-shortener:${VERSION}
        command: ["node", "packages/shared-db/dist/migrations/migrate.js"]
        env:
        - name: POSTGRES_HOST
          value: "postgres"
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: postgres-secrets
              key: username
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secrets
              key: password
        - name: CLICKHOUSE_HOST
          value: "clickhouse"
        - name: CLICKHOUSE_USER
          valueFrom:
            secretKeyRef:
              name: clickhouse-secrets
              key: username
        - name: CLICKHOUSE_PASSWORD
          valueFrom:
            secretKeyRef:
              name: clickhouse-secrets
              key: password
      restartPolicy: OnFailure
  backoffLimit: 3
EOF
    
    # Wait for migration job to complete
    kubectl wait --for=condition=complete --timeout=300s job/db-migration-${VERSION} -n "$NAMESPACE"
    
    log_success "Database migrations completed"
}

# Function to verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    # Check if all pods are running
    local services=("url-shortener" "analytics" "user-management" "frontend" "postgres" "redis" "clickhouse" "rabbitmq")
    
    for service in "${services[@]}"; do
        if kubectl wait --for=condition=available --timeout=60s deployment/"$service" -n "$NAMESPACE"; then
            log_success "$service is running"
        else
            log_error "$service failed to start"
            kubectl describe deployment "$service" -n "$NAMESPACE"
            kubectl logs -l app="$service" -n "$NAMESPACE" --tail=50
            return 1
        fi
    done
    
    # Check HPA status
    kubectl get hpa -n "$NAMESPACE"
    
    # Check service endpoints
    kubectl get endpoints -n "$NAMESPACE"
    
    # Check Istio resources
    if kubectl get namespace istio-system &> /dev/null; then
        log_info "Checking Istio resources..."
        kubectl get gateway -n "$NAMESPACE"
        kubectl get virtualservice -n "$NAMESPACE"
        kubectl get destinationrule -n "$NAMESPACE"
    fi
    
    log_success "Deployment verification completed"
}

# Function to run smoke tests
run_smoke_tests() {
    log_info "Running smoke tests..."
    
    # Create a job to run smoke tests
    cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: smoke-tests-${VERSION}
  namespace: ${NAMESPACE}
spec:
  template:
    spec:
      containers:
      - name: smoke-tests
        image: ${DOCKER_REGISTRY}/url-shortener-url-shortener:${VERSION}
        command: ["node", "scripts/run-smoke-tests.js"]
        env:
        - name: API_BASE_URL
          value: "http://url-shortener"
        - name: FRONTEND_URL
          value: "http://frontend"
      restartPolicy: OnFailure
  backoffLimit: 1
EOF
    
    # Wait for smoke tests job to complete
    if kubectl wait --for=condition=complete --timeout=300s job/smoke-tests-${VERSION} -n "$NAMESPACE"; then
        log_success "Smoke tests passed"
    else
        log_error "Smoke tests failed"
        kubectl logs job/smoke-tests-${VERSION} -n "$NAMESPACE"
        
        if [[ "$ENVIRONMENT" == "production" ]]; then
            log_warning "Smoke tests failed in production, consider rolling back"
            # Uncomment to automatically rollback on smoke test failure
            # helm rollback "$HELM_RELEASE_NAME" -n "$NAMESPACE"
        fi
        
        return 1
    fi
}

# Function to display deployment information
display_info() {
    log_info "Deployment Information:"
    echo "========================"
    echo "Namespace: $NAMESPACE"
    echo "Version: $VERSION"
    echo "Environment: $ENVIRONMENT"
    echo "Registry: $DOCKER_REGISTRY"
    echo "Helm Release: $HELM_RELEASE_NAME"
    echo ""
    
    log_info "Service URLs:"
    if kubectl get gateway url-shortener-gateway -n "$NAMESPACE" &> /dev/null; then
        echo "Frontend: https://short.example.com"
        echo "API: https://api.short.example.com"
    else
        echo "Use port-forward to access services locally:"
        echo "kubectl port-forward svc/frontend 3000:80 -n $NAMESPACE"
        echo "kubectl port-forward svc/url-shortener 3001:80 -n $NAMESPACE"
    fi
    
    echo ""
    log_info "Useful commands:"
    echo "kubectl get pods -n $NAMESPACE"
    echo "kubectl logs -f deployment/url-shortener -n $NAMESPACE"
    echo "kubectl describe hpa -n $NAMESPACE"
    echo "helm status $HELM_RELEASE_NAME -n $NAMESPACE"
    
    echo ""
    log_info "Monitoring:"
    echo "Grafana: https://grafana.example.com"
    echo "Prometheus: https://prometheus.example.com"
    echo "Jaeger: https://jaeger.example.com"
}

# Function to rollback deployment
rollback_deployment() {
    log_info "Rolling back deployment..."
    
    # Rollback Helm release
    helm rollback "$HELM_RELEASE_NAME" -n "$NAMESPACE"
    
    log_success "Rollback completed"
}

# Main deployment function
main() {
    local action="${1:-deploy}"
    
    case "$action" in
        "deploy")
            log_info "Starting deployment of URL Shortener Platform to $ENVIRONMENT..."
            check_prerequisites
            
            if [[ "$ENVIRONMENT" == "production" ]]; then
                log_warning "Deploying to PRODUCTION environment!"
                read -p "Are you sure you want to continue? (y/n) " -n 1 -r
                echo
                if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                    log_info "Deployment cancelled"
                    exit 0
                fi
                
                # Backup databases before production deployment
                backup_databases
            fi
            
            build_and_push_images
            setup_namespace_and_secrets
            deploy_with_helm
            run_migrations
            verify_deployment
            run_smoke_tests
            display_info
            log_success "Deployment to $ENVIRONMENT completed successfully!"
            ;;
        "rollback")
            log_warning "Rolling back deployment in $ENVIRONMENT!"
            read -p "Are you sure you want to rollback? (y/n) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log_info "Rollback cancelled"
                exit 0
            fi
            
            rollback_deployment
            verify_deployment
            ;;
        "verify")
            verify_deployment
            ;;
        "info")
            display_info
            ;;
        *)
            echo "Usage: $0 [deploy|rollback|verify|info]"
            echo "  deploy   - Deploy the entire platform (default)"
            echo "  rollback - Rollback to the previous version"
            echo "  verify   - Verify the current deployment"
            echo "  info     - Display deployment information"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"