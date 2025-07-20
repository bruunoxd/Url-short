#!/bin/bash
set -e

# Configuration
ENVIRONMENT=${ENVIRONMENT:-"dev"}
NAMESPACE="url-shortener-${ENVIRONMENT}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Installing monitoring stack for URL Shortener Platform${NC}"
echo -e "Environment: ${GREEN}${ENVIRONMENT}${NC}"
echo -e "Namespace: ${GREEN}${NAMESPACE}${NC}"

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}kubectl is not installed. Please install it first.${NC}"
    exit 1
fi

# Check if helm is installed
if ! command -v helm &> /dev/null; then
    echo -e "${RED}helm is not installed. Please install it first.${NC}"
    exit 1
fi

# Create monitoring namespace if it doesn't exist
if ! kubectl get namespace monitoring &> /dev/null; then
    echo -e "${YELLOW}Creating monitoring namespace...${NC}"
    kubectl create namespace monitoring
fi

# Add Prometheus Helm repository
echo -e "${YELLOW}Adding Prometheus Helm repository...${NC}"
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install Prometheus Operator
echo -e "${YELLOW}Installing Prometheus Operator...${NC}"
helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
  --set prometheus.prometheusSpec.podMonitorSelectorNilUsesHelmValues=false

# Add Grafana Helm repository
echo -e "${YELLOW}Adding Grafana Helm repository...${NC}"
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Install Loki for log aggregation
echo -e "${YELLOW}Installing Loki for log aggregation...${NC}"
helm upgrade --install loki grafana/loki-stack \
  --namespace monitoring \
  --set promtail.enabled=true \
  --set loki.persistence.enabled=true \
  --set loki.persistence.size=10Gi

# Create ServiceMonitor for URL Shortener services
echo -e "${YELLOW}Creating ServiceMonitor for URL Shortener services...${NC}"
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

# Create Grafana dashboards
echo -e "${YELLOW}Creating Grafana dashboards...${NC}"
kubectl create configmap url-shortener-dashboards -n monitoring --from-file=k8s/monitoring/dashboards/ || true

echo -e "${GREEN}Monitoring stack installation completed!${NC}"
echo -e "${YELLOW}To access Grafana:${NC}"
echo -e "  kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80"
echo -e "  Then open http://localhost:3000 in your browser"
echo -e "  Default credentials: admin / prom-operator"

echo -e "${YELLOW}To access Prometheus:${NC}"
echo -e "  kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090"
echo -e "  Then open http://localhost:9090 in your browser"