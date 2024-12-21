#!/usr/bin/env bash

# Workflow Automation Platform - EKS Cluster Initialization Script
# Version: 1.0.0
# This script initializes and configures an EKS cluster with required services,
# add-ons, and security configurations for the workflow automation platform.

set -euo pipefail
IFS=$'\n\t'

# Default configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly LOG_FILE="/var/log/cluster-init.log"
readonly TIMEOUT=${TIMEOUT:-300}
readonly MAX_RETRIES=${MAX_RETRIES:-3}
readonly LOG_LEVEL=${LOG_LEVEL:-INFO}

# Import configuration from Terraform outputs
CLUSTER_NAME=${CLUSTER_NAME:-"workflow-automation"}
AWS_REGION=${AWS_REGION:-"us-west-2"}
ENVIRONMENT=${ENVIRONMENT:-"prod"}

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m'

# Logging functions
setup_logging() {
    local log_dir="/var/log/cluster-init"
    mkdir -p "${log_dir}"
    
    # Configure log rotation
    cat > /etc/logrotate.d/cluster-init << EOF
${log_dir}/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 root root
}
EOF

    # Initialize logging
    exec 1> >(tee -a "${LOG_FILE}")
    exec 2> >(tee -a "${LOG_FILE}" >&2)
}

log() {
    local level=$1
    shift
    local message=$*
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}"
}

# Validation functions
validate_prerequisites() {
    log "INFO" "Validating prerequisites..."

    # Check AWS CLI version
    if ! aws --version >/dev/null 2>&1; then
        log "ERROR" "AWS CLI not installed"
        return 1
    fi

    # Check kubectl version
    if ! kubectl version --client --short >/dev/null 2>&1; then
        log "ERROR" "kubectl not installed"
        return 1
    fi

    # Check Helm version
    if ! helm version --short >/dev/null 2>&1; then
        log "ERROR" "Helm not installed"
        return 1
    }

    # Verify AWS credentials
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        log "ERROR" "Invalid AWS credentials"
        return 1
    }

    log "INFO" "Prerequisites validation completed successfully"
    return 0
}

# Security configuration
configure_security() {
    log "INFO" "Configuring cluster security..."

    # Configure RBAC
    kubectl apply -f - <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: workflow-automation-role
rules:
- apiGroups: [""]
  resources: ["pods", "services", "configmaps", "secrets"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
EOF

    # Configure network policies
    kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
EOF

    # Enable pod security policies
    kubectl apply -f - <<EOF
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: restricted
spec:
  privileged: false
  seLinux:
    rule: RunAsAny
  runAsUser:
    rule: MustRunAsNonRoot
  fsGroup:
    rule: RunAsAny
  volumes:
  - 'configMap'
  - 'emptyDir'
  - 'projected'
  - 'secret'
  - 'downwardAPI'
EOF

    log "INFO" "Security configuration completed"
}

# Core services deployment
deploy_core_services() {
    log "INFO" "Deploying core services..."

    # Add Helm repositories
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
    helm repo add jetstack https://charts.jetstack.io
    helm repo update

    # Deploy NGINX Ingress Controller
    helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
        --namespace ingress-nginx \
        --create-namespace \
        --set controller.replicaCount=3 \
        --set controller.metrics.enabled=true \
        --set controller.podSecurityContext.runAsUser=101 \
        --set controller.containerSecurityContext.allowPrivilegeEscalation=false

    # Deploy cert-manager
    helm upgrade --install cert-manager jetstack/cert-manager \
        --namespace cert-manager \
        --create-namespace \
        --set installCRDs=true \
        --set global.leaderElection.namespace=cert-manager

    # Deploy API Gateway
    helm upgrade --install api-gateway ./infrastructure/helm/api-gateway \
        --namespace workflow-system \
        --create-namespace \
        --values ./infrastructure/helm/api-gateway/values.yaml

    # Deploy Workflow Engine
    helm upgrade --install workflow-engine ./infrastructure/helm/workflow-engine \
        --namespace workflow-system \
        --values ./infrastructure/helm/workflow-engine/values.yaml

    log "INFO" "Core services deployment completed"
}

# Health check function
health_check() {
    log "INFO" "Performing health checks..."

    # Check node status
    if ! kubectl get nodes | grep -q "Ready"; then
        log "ERROR" "Node health check failed"
        return 1
    }

    # Check core services
    local services=("api-gateway" "workflow-engine" "ingress-nginx-controller")
    for service in "${services[@]}"; do
        if ! kubectl get pods -l app="${service}" -n workflow-system 2>/dev/null | grep -q "Running"; then
            log "ERROR" "Service ${service} health check failed"
            return 1
        fi
    }

    # Check metrics collection
    if ! kubectl get servicemonitor -n monitoring 2>/dev/null; then
        log "WARNING" "Metrics collection not configured"
    }

    log "INFO" "Health checks completed successfully"
    return 0
}

# Main execution
main() {
    log "INFO" "Starting cluster initialization for ${CLUSTER_NAME} in ${AWS_REGION}"

    # Setup logging
    setup_logging

    # Validate prerequisites
    if ! validate_prerequisites; then
        log "ERROR" "Prerequisites validation failed"
        exit 1
    }

    # Update kubeconfig
    aws eks update-kubeconfig --name "${CLUSTER_NAME}" --region "${AWS_REGION}"

    # Configure security
    if ! configure_security; then
        log "ERROR" "Security configuration failed"
        exit 1
    }

    # Deploy core services
    if ! deploy_core_services; then
        log "ERROR" "Core services deployment failed"
        exit 1
    }

    # Perform health checks
    if ! health_check; then
        log "ERROR" "Health checks failed"
        exit 1
    }

    log "INFO" "Cluster initialization completed successfully"
}

# Script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    trap 'log "ERROR" "Script failed on line $LINENO"' ERR
    main "$@"
fi