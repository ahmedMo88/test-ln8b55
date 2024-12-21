#!/usr/bin/env bash

# Production Deployment Script for Workflow Platform
# Version: 1.0
# Dependencies:
# - kubectl v1.28
# - aws-cli v2.0
# - helm v3.0

set -euo pipefail
IFS=$'\n\t'

# Global Configuration
readonly CLUSTER_NAME="workflow-platform-cluster"
readonly NAMESPACE="workflow-platform"
readonly AWS_REGION="us-west-2"
readonly DEPLOYMENT_TIMEOUT="600"
readonly MAX_RETRY_ATTEMPTS="3"
readonly HEALTH_CHECK_INTERVAL="30"

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m'

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
trap 'handle_error $? $LINENO $BASH_LINENO "$BASH_COMMAND" $(printf "::%s" ${FUNCNAME[@]:-})' ERR

handle_error() {
    local exit_code=$1
    local line_no=$2
    local bash_lineno=$3
    local last_command=$4
    local func_trace=$5

    log_error "Error occurred in deployment script"
    log_error "Exit code: $exit_code"
    log_error "Line number: $line_no"
    log_error "Command: $last_command"
    log_error "Function trace: $func_trace"

    cleanup_failed_deployment
    exit "$exit_code"
}

# Cluster authentication
authenticate_cluster() {
    log_info "Authenticating with EKS cluster: $CLUSTER_NAME"
    
    # Verify AWS credentials
    if ! aws sts get-caller-identity &>/dev/null; then
        log_error "AWS credentials not configured or invalid"
        exit 1
    }

    # Update kubeconfig for EKS cluster
    aws eks update-kubeconfig \
        --region "$AWS_REGION" \
        --name "$CLUSTER_NAME" \
        --alias "$CLUSTER_NAME"

    # Verify cluster connectivity
    if ! kubectl cluster-info &>/dev/null; then
        log_error "Failed to connect to cluster"
        exit 1
    }

    log_info "Successfully authenticated with cluster"
}

# Deployment validation
validate_manifests() {
    local manifests=("$@")
    
    for manifest in "${manifests[@]}"; do
        log_info "Validating manifest: $manifest"
        
        if ! kubectl apply --dry-run=client -f "$manifest" &>/dev/null; then
            log_error "Manifest validation failed: $manifest"
            return 1
        fi
    done
    
    log_info "All manifests validated successfully"
}

# Deploy service with health checks
deploy_service() {
    local service_name=$1
    local manifest_path=$2
    local retries=0

    log_info "Deploying service: $service_name"

    # Apply the deployment
    kubectl apply -f "$manifest_path"

    # Wait for deployment rollout
    if ! kubectl rollout status deployment/"$service_name" \
        --namespace="$NAMESPACE" \
        --timeout="${DEPLOYMENT_TIMEOUT}s"; then
        log_error "Deployment rollout failed for $service_name"
        return 1
    }

    # Verify deployment health
    while [ $retries -lt "$MAX_RETRY_ATTEMPTS" ]; do
        if check_deployment_health "$service_name"; then
            log_info "Service $service_name deployed successfully"
            return 0
        fi
        
        retries=$((retries + 1))
        log_warn "Retry $retries/$MAX_RETRY_ATTEMPTS for $service_name health check"
        sleep "$HEALTH_CHECK_INTERVAL"
    done

    log_error "Service $service_name failed health checks"
    return 1
}

# Health check implementation
check_deployment_health() {
    local service_name=$1
    
    # Check pod status
    local ready_pods
    ready_pods=$(kubectl get deployment "$service_name" \
        --namespace="$NAMESPACE" \
        -o jsonpath='{.status.readyReplicas}')

    if [ "$ready_pods" -eq 0 ]; then
        return 1
    }

    # Check endpoint health
    local service_port
    case "$service_name" in
        "ai-service")
            service_port=8000
            ;;
        "api-gateway")
            service_port=3000
            ;;
        "workflow-engine")
            service_port=3003
            ;;
        *)
            log_error "Unknown service: $service_name"
            return 1
            ;;
    esac

    # Perform HTTP health check
    if ! kubectl run -i --rm --restart=Never curl-test \
        --image=curlimages/curl:7.85.0 \
        --namespace="$NAMESPACE" \
        -- curl -s -o /dev/null -w '%{http_code}' \
        "http://$service_name:$service_port/health" | grep -q "200"; then
        return 1
    fi

    return 0
}

# Cleanup failed deployment
cleanup_failed_deployment() {
    log_warn "Initiating cleanup of failed deployment"
    
    # Scale down deployments
    kubectl scale deployment --all --replicas=0 --namespace="$NAMESPACE"
    
    # Remove failed resources
    kubectl delete deployment --all --namespace="$NAMESPACE"
    
    log_info "Cleanup completed"
}

# Main deployment orchestration
main() {
    log_info "Starting deployment process"

    # Authenticate with cluster
    authenticate_cluster

    # Create namespace if it doesn't exist
    kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

    # List of services to deploy
    local services=(
        "ai-service:k8s/ai-service.yaml"
        "api-gateway:k8s/api-gateway.yaml"
        "workflow-engine:k8s/workflow-engine.yaml"
    )

    # Validate all manifests first
    local manifests=()
    for service in "${services[@]}"; do
        manifests+=("${service#*:}")
    done

    if ! validate_manifests "${manifests[@]}"; then
        log_error "Manifest validation failed"
        exit 1
    }

    # Deploy services
    for service in "${services[@]}"; do
        IFS=':' read -r service_name manifest_path <<< "$service"
        
        if ! deploy_service "$service_name" "$manifest_path"; then
            log_error "Deployment failed for $service_name"
            cleanup_failed_deployment
            exit 1
        fi
    done

    log_info "All services deployed successfully"
}

# Script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi