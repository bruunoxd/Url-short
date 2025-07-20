#!/bin/bash

# URL Shortener Platform Deployment Script
# This script automates the deployment of the URL shortener platform to Kubernetes

set -euo pipefail

# Configuration
NAMESPACE="url-shortener"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-localhost:5000}"
VERSION="${VERSION:-latest}"
ENVIRONMENT="${ENVIRONMENT:-dev}"
KUBECTL_CONTEXT="${KUBECTL_CONTEXT:-}"

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
    
    log_success "Prerequisites check passed"
}

# Function to build and push Docker images
build_and_push_images() {
    log_info "Building and pushing Docker images..."
    
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
        
        log_success "$service image built and pushed"
    done
}

# Function to create namespace and secrets
setup_namespace_and_secrets() {
    log_info "Setting up namespace and secrets..."
    
    # Create namespace if it doesn't exist
    kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
    
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

# Function to deploy infrastructure components
deploy_infrastructure() {
    log_info "Deploying infrastructure components..."
    
    # Apply persistent volumes
    kubectl apply -f k8s/base/persistent-volumes.yaml
    
    # Deploy databases
    kubectl apply -f k8s/base/database-deployments.yaml
    
    # Wait for databases to be ready
    log_info "Waiting for databases to be ready..."
    kubectl wait --for=condition=available --timeout=300s deployment/postgres -n "$NAMESPACE"
    kubectl wait --for=condition=available --timeout=300s deployment/redis -n "$NAMESPACE"
    kubectl wait --for=condition=available --timeout=300s deployment/clickhouse -n "$NAMESPACE"
    kubectl wait --for=condition=available --timeout=300s deployment/rabbitmq -n "$NAMESPACE"
    
    log_success "Infrastructure components deployed"
}

# Function to deploy application services
deploy_services() {
    log_info "Deploying application services..."
    
    # Update image tags in deployment files
    local services=("url-shortener" "analytics" "user-management" "frontend")
    
    for service in "${services[@]}"; do
        # Create temporary deployment file with updated image
        local deployment_file="k8s/base/${service}-deployment.yaml"
        local temp_file="/tmp/${service}-deployment-${VERSION}.yaml"
        
        sed "s|image: url-shortener-${service}:latest|image: ${DOCKER_REGISTRY}/url-shortener-${service}:${VERSION}|g" \
            "$deployment_file" > "$temp_file"
        
        # Apply the deployment
        kubectl apply -f "$temp_file"
        
        # Clean up temp file
        rm "$temp_file"
        
        log_info "Deployed $service service"
    done
    
    # Apply services
    kubectl apply -f k8s/base/url-shortener-service.yaml
    kubectl apply -f k8s/base/analytics-service.yaml
    kubectl apply -f k8s/base/user-management-service.yaml
    kubectl apply -f k8s/base/frontend-service.yaml
    
    # Apply HPA
    kubectl apply -f k8s/base/url-shortener-hpa.yaml
    kubectl apply -f k8s/base/analytics-hpa.yaml
    kubectl apply -f k8s/base/user-management-hpa.yaml
    kubectl apply -f k8s/base/frontend-hpa.yaml
    
    log_success "Application services deployed"
}

# Function to deploy service mesh configuration
deploy_service_mesh() {
    log_info "Deploying service mesh configuration..."
    
    # Check if Istio is installed
    if ! kubectl get namespace istio-system &> /dev/null; then
        log_warning "Istio is not installed. Installing Istio..."
        curl -L https://istio.io/downloadIstio | sh -
        export PATH="$PWD/istio-*/bin:$PATH"
        istioctl install --set values.defaultRevision=default -y
        kubectl label namespace "$NAMESPACE" istio-injection=enabled --overwrite
    fi
    
    # Apply Istio configurations
    kubectl apply -f k8s/base/istio-gateway.yaml
    kubectl apply -f k8s/base/istio-virtual-services.yaml
    kubectl apply -f k8s/base/istio-service-mesh.yaml
    
    log_success "Service mesh configuration deployed"
}

# Function to deploy monitoring stack
deploy_monitoring() {
    log_info "Deploying monitoring stack..."
    
    # Create monitoring namespace if it doesn't exist
    kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
    
    # Add Helm repositories if they don't exist
    if ! helm repo list | grep -q "prometheus-community"; then
        helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    fi
    
    if ! helm repo list | grep -q "grafana"; then
        helm repo add grafana https://grafana.github.io/helm-charts
    fi
    
    helm repo update
    
    # Deploy Prometheus Operator with custom values
    log_info "Deploying Prometheus Operator..."
    helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
        --namespace monitoring \
        -f k8s/monitoring/prometheus/prometheus-values.yaml \
        --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
        --set prometheus.prometheusSpec.podMonitorSelectorNilUsesHelmValues=false
    
    # Deploy Loki for log aggregation
    log_info "Deploying Loki for log aggregation..."
    helm upgrade --install loki grafana/loki-stack \
        --namespace monitoring \
        --set promtail.enabled=true \
        --set loki.persistence.enabled=true \
        --set loki.persistence.size=10Gi
    
    # Apply custom Prometheus rules
    log_info "Applying custom alerting rules..."
    kubectl apply -f k8s/monitoring/alerting/url-shortener-alerts.yaml
    
    # Create Grafana dashboards
    log_info "Creating Grafana dashboards..."
    kubectl create configmap url-shortener-dashboards \
        --from-file=k8s/monitoring/dashboards/ \
        -n monitoring \
        --dry-run=client -o yaml | kubectl apply -f -
    
    # Create ServiceMonitor for URL Shortener services
    log_info "Creating ServiceMonitor for URL Shortener services..."
    cat <<EOF | kubectl apply -f -
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: url-shortener-services
  namespace: monitoring
  labels:
    release: prometheus
spec:
  selector:
    matchLabels:
      app: url-shortener
  namespaceSelector:
    matchNames:
      - ${NAMESPACE}
  endpoints:
  - port: http
    path: /metrics
    interval: 15s
EOF
    
    log_success "Monitoring stack deployed"
    
    log_info "Monitoring URLs:"
    echo "Grafana: http://localhost:3000 (kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80)"
    echo "Prometheus: http://localhost:9090 (kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090)"
    echo "Alertmanager: http://localhost:9093 (kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-alertmanager 9093:9093)"
    echo "Loki: http://localhost:3100 (kubectl port-forward -n monitoring svc/loki 3100:3100)"
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
    
    log_success "Deployment verification completed"
}

# Function to display deployment information
display_info() {
    log_info "Deployment Information:"
    echo "========================"
    echo "Namespace: $NAMESPACE"
    echo "Version: $VERSION"
    echo "Environment: $ENVIRONMENT"
    echo "Registry: $DOCKER_REGISTRY"
    echo ""
    
    log_info "Service URLs:"
    if kubectl get gateway url-shortener-gateway -n "$NAMESPACE" &> /dev/null; then
        echo "Frontend: https://url-shortener.example.com"
        echo "API: https://api.url-shortener.example.com"
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
}

# Function to cleanup deployment
cleanup() {
    log_info "Cleaning up deployment..."
    
    # Delete all resources in the namespace
    kubectl delete namespace "$NAMESPACE" --ignore-not-found=true
    
    log_success "Cleanup completed"
}

# Main deployment function
main() {
    local action="${1:-deploy}"
    
    case "$action" in
        "deploy")
            log_info "Starting deployment of URL Shortener Platform..."
            check_prerequisites
            build_and_push_images
            setup_namespace_and_secrets
            deploy_infrastructure
            deploy_services
            deploy_service_mesh
            run_migrations
            
            # Deploy monitoring if in production environment
            if [[ "$ENVIRONMENT" == "production" ]]; then
                deploy_monitoring
            fi
            
            verify_deployment
            display_info
            log_success "Deployment completed successfully!"
            ;;
        "cleanup")
            cleanup
            ;;
        "verify")
            verify_deployment
            ;;
        "info")
            display_info
            ;;
        "monitoring")
            log_info "Deploying monitoring stack only..."
            check_prerequisites
            deploy_monitoring
            log_success "Monitoring deployment completed!"
            ;;
        "backup")
            log_info "Running database backup..."
            bash scripts/backup-databases.sh
            log_success "Backup completed!"
            ;;
        *)
            echo "Usage: $0 [deploy|cleanup|verify|info|monitoring|backup]"
            echo "  deploy     - Deploy the entire platform (default)"
            echo "  cleanup    - Remove all deployed resources"
            echo "  verify     - Verify the current deployment"
            echo "  info       - Display deployment information"
            echo "  monitoring - Deploy monitoring stack only"
            echo "  backup     - Run database backup"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"