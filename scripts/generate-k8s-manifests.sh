#!/bin/bash

# URL Shortener Platform - Generate Kubernetes Manifests
# This script generates Kubernetes manifests from the Helm chart for GitOps workflows

set -euo pipefail

# Configuration
ENVIRONMENT="${ENVIRONMENT:-dev}"
OUTPUT_DIR="./k8s/generated/${ENVIRONMENT}"
HELM_CHART_PATH="./k8s/helm/url-shortener"
HELM_VALUES_FILE="./k8s/helm/url-shortener/values-${ENVIRONMENT}.yaml"
RELEASE_NAME="url-shortener"
NAMESPACE="url-shortener"

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
    
    # Check if helm is installed
    if ! command -v helm &> /dev/null; then
        log_error "helm is not installed or not in PATH"
        exit 1
    fi
    
    # Check if values file exists
    if [[ ! -f "$HELM_VALUES_FILE" ]]; then
        log_warning "Values file $HELM_VALUES_FILE not found, using default values.yaml"
        HELM_VALUES_FILE="$HELM_CHART_PATH/values.yaml"
    fi
    
    log_success "Prerequisites check passed"
}

# Function to generate Kubernetes manifests
generate_manifests() {
    log_info "Generating Kubernetes manifests for environment: $ENVIRONMENT"
    
    # Create output directory
    mkdir -p "$OUTPUT_DIR"
    
    # Generate manifests using Helm template
    helm template "$RELEASE_NAME" "$HELM_CHART_PATH" \
        --namespace "$NAMESPACE" \
        --values "$HELM_VALUES_FILE" \
        --output-dir "$OUTPUT_DIR"
    
    log_success "Manifests generated successfully in $OUTPUT_DIR"
    
    # Add kustomization.yaml
    cat > "$OUTPUT_DIR/kustomization.yaml" <<EOF
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: $NAMESPACE

resources:
- url-shortener/templates/namespace.yaml
- url-shortener/templates/configmaps.yaml
- url-shortener/templates/secrets.yaml
- url-shortener/templates/services.yaml
- url-shortener/templates/deployments.yaml
- url-shortener/templates/hpa.yaml
- url-shortener/templates/ingress.yaml
- url-shortener/templates/istio.yaml
- url-shortener/templates/monitoring.yaml
EOF
    
    log_success "Kustomization file created"
}

# Function to validate generated manifests
validate_manifests() {
    log_info "Validating generated manifests..."
    
    # Check if kubectl is installed
    if ! command -v kubectl &> /dev/null; then
        log_warning "kubectl is not installed, skipping validation"
        return
    fi
    
    # Validate manifests using kubectl
    find "$OUTPUT_DIR" -name "*.yaml" -print0 | while IFS= read -r -d '' file; do
        log_info "Validating $file"
        if ! kubectl apply --dry-run=client -f "$file" &> /dev/null; then
            log_error "Validation failed for $file"
            kubectl apply --dry-run=client -f "$file"
            exit 1
        fi
    done
    
    log_success "All manifests validated successfully"
}

# Main function
main() {
    log_info "Starting manifest generation for URL Shortener Platform..."
    check_prerequisites
    generate_manifests
    validate_manifests
    log_success "Manifest generation completed successfully!"
}

# Run main function
main