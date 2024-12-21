#!/usr/bin/env bash

# Deploy Monitoring Stack Script
# Version: 1.0.0
# Purpose: Deploy and configure comprehensive monitoring infrastructure for workflow automation platform

set -euo pipefail

# Global variables from specification
readonly MONITORING_NAMESPACE="monitoring"
readonly GRAFANA_VERSION="9.5.0"
readonly PROMETHEUS_VERSION="2.47.0"
readonly JAEGER_VERSION="1.47.0"
readonly LOKI_VERSION="2.9.0"
readonly RETRY_ATTEMPTS=3
readonly TIMEOUT_SECONDS=300
readonly BACKUP_RETENTION_DAYS=30

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Error handling
handle_error() {
    log_error "An error occurred on line $1"
    exit 1
}

trap 'handle_error $LINENO' ERR

# Validate prerequisites
check_prerequisites() {
    local prerequisites=("kubectl" "helm")
    
    for cmd in "${prerequisites[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            log_error "$cmd is required but not installed"
            exit 1
        fi
    done

    # Verify cluster access
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot access Kubernetes cluster"
        exit 1
    }
}

# Create monitoring namespace with proper configuration
create_monitoring_namespace() {
    log_info "Creating monitoring namespace and configuring resources..."
    
    if ! kubectl get namespace "$MONITORING_NAMESPACE" &> /dev/null; then
        kubectl create namespace "$MONITORING_NAMESPACE"
        
        # Apply resource quotas
        cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ResourceQuota
metadata:
  name: monitoring-quota
  namespace: $MONITORING_NAMESPACE
spec:
  hard:
    requests.cpu: "8"
    requests.memory: 16Gi
    limits.cpu: "16"
    limits.memory: 32Gi
    pods: "50"
EOF

        # Apply network policies
        cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: monitoring-network-policy
  namespace: $MONITORING_NAMESPACE
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: default
  egress:
  - to:
    - namespaceSelector: {}
EOF
    fi

    # Label namespace
    kubectl label namespace "$MONITORING_NAMESPACE" \
        monitoring=true \
        environment=production \
        --overwrite
}

# Deploy Prometheus with HA configuration
deploy_prometheus() {
    log_info "Deploying Prometheus v${PROMETHEUS_VERSION}..."
    
    # Add Prometheus helm repo
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo update

    # Create Prometheus values file
    cat > prometheus-values.yaml <<EOF
prometheus:
  prometheusSpec:
    replicas: 2
    retention: 15d
    resources:
      requests:
        cpu: 1
        memory: 2Gi
      limits:
        cpu: 2
        memory: 4Gi
    storageSpec:
      volumeClaimTemplate:
        spec:
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 50Gi
    securityContext:
      fsGroup: 2000
      runAsNonRoot: true
      runAsUser: 1000
    additionalScrapeConfigs:
      - job_name: workflow-engine
        metrics_path: /metrics
        kubernetes_sd_configs:
          - role: pod
EOF

    # Deploy Prometheus
    helm upgrade --install prometheus prometheus-community/prometheus \
        --namespace "$MONITORING_NAMESPACE" \
        --version "$PROMETHEUS_VERSION" \
        --values prometheus-values.yaml \
        --timeout "${TIMEOUT_SECONDS}s" \
        --wait

    # Apply custom rules
    kubectl apply -f ../monitoring/prometheus/rules/ -n "$MONITORING_NAMESPACE"
}

# Deploy Grafana with dashboards and datasources
deploy_grafana() {
    log_info "Deploying Grafana v${GRAFANA_VERSION}..."
    
    # Add Grafana helm repo
    helm repo add grafana https://grafana.github.io/helm-charts
    helm repo update

    # Create Grafana values file
    cat > grafana-values.yaml <<EOF
replicas: 2
persistence:
  enabled: true
  size: 10Gi
adminPassword: "${GRAFANA_ADMIN_PASSWORD}"
datasources:
  datasources.yaml:
    apiVersion: 1
    datasources:
    - name: Prometheus
      type: prometheus
      url: http://prometheus-server
      access: proxy
      isDefault: true
    - name: Loki
      type: loki
      url: http://loki:3100
    - name: Jaeger
      type: jaeger
      url: http://jaeger-query:16686
dashboardProviders:
  dashboardproviders.yaml:
    apiVersion: 1
    providers:
    - name: 'default'
      orgId: 1
      folder: ''
      type: file
      disableDeletion: true
      editable: false
      options:
        path: /var/lib/grafana/dashboards
EOF

    # Deploy Grafana
    helm upgrade --install grafana grafana/grafana \
        --namespace "$MONITORING_NAMESPACE" \
        --version "$GRAFANA_VERSION" \
        --values grafana-values.yaml \
        --timeout "${TIMEOUT_SECONDS}s" \
        --wait

    # Import dashboards
    kubectl cp ../monitoring/grafana/dashboards/ \
        "$MONITORING_NAMESPACE/$(kubectl get pods -n "$MONITORING_NAMESPACE" -l app.kubernetes.io/name=grafana -o jsonpath='{.items[0].metadata.name}'):/var/lib/grafana/"
}

# Deploy Jaeger with proper storage and sampling
deploy_jaeger() {
    log_info "Deploying Jaeger v${JAEGER_VERSION}..."
    
    # Install Jaeger operator
    kubectl apply -f https://github.com/jaegertracing/jaeger-operator/releases/download/v${JAEGER_VERSION}/jaeger-operator.yaml \
        -n "$MONITORING_NAMESPACE"

    # Wait for operator to be ready
    kubectl rollout status deployment/jaeger-operator \
        -n "$MONITORING_NAMESPACE" \
        --timeout="${TIMEOUT_SECONDS}s"

    # Deploy Jaeger instance
    kubectl apply -f ../monitoring/jaeger/jaeger.yml -n "$MONITORING_NAMESPACE"
}

# Deploy Loki with retention and storage configuration
deploy_loki() {
    log_info "Deploying Loki v${LOKI_VERSION}..."
    
    # Add Loki helm repo
    helm repo add grafana https://grafana.github.io/helm-charts
    helm repo update

    # Create Loki values file
    cat > loki-values.yaml <<EOF
replicas: 2
persistence:
  enabled: true
  size: 50Gi
config:
  auth_enabled: true
  storage_config:
    filesystem:
      directory: /data/loki/chunks
  limits_config:
    retention_period: 168h
    ingestion_rate_mb: 10
    ingestion_burst_size_mb: 20
  table_manager:
    retention_deletes_enabled: true
    retention_period: 168h
EOF

    # Deploy Loki
    helm upgrade --install loki grafana/loki \
        --namespace "$MONITORING_NAMESPACE" \
        --version "$LOKI_VERSION" \
        --values loki-values.yaml \
        --timeout "${TIMEOUT_SECONDS}s" \
        --wait
}

# Verify all deployments and integrations
verify_deployments() {
    log_info "Verifying monitoring stack deployment..."
    
    local components=("prometheus-server" "grafana" "jaeger-query" "loki")
    
    for component in "${components[@]}"; do
        if ! kubectl rollout status deployment/"$component" -n "$MONITORING_NAMESPACE" --timeout=60s &> /dev/null; then
            log_error "Deployment verification failed for $component"
            return 1
        fi
    done

    # Verify Prometheus metrics collection
    if ! kubectl port-forward svc/prometheus-server 9090:9090 -n "$MONITORING_NAMESPACE" &> /dev/null & then
        log_error "Failed to verify Prometheus metrics collection"
        return 1
    fi

    # Verify Grafana access
    if ! kubectl port-forward svc/grafana 3000:3000 -n "$MONITORING_NAMESPACE" &> /dev/null & then
        log_error "Failed to verify Grafana access"
        return 1
    fi

    log_info "All components verified successfully"
    return 0
}

# Main deployment function
main() {
    log_info "Starting monitoring stack deployment..."
    
    # Check prerequisites
    check_prerequisites

    # Create and configure namespace
    create_monitoring_namespace

    # Deploy monitoring components
    deploy_prometheus
    deploy_grafana
    deploy_jaeger
    deploy_loki

    # Verify deployments
    if verify_deployments; then
        log_info "Monitoring stack deployed successfully"
    else
        log_error "Monitoring stack deployment verification failed"
        exit 1
    fi
}

# Execute main function
main "$@"