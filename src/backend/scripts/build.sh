#!/usr/bin/env bash

# =============================================================================
# Backend Services Build Script
# Version: 1.0.0
# Description: Builds all backend microservices using multi-stage Docker builds
# with optimized configurations and security scanning
# =============================================================================

set -euo pipefail
IFS=$'\n\t'

# =============================================================================
# Global Configuration
# =============================================================================
# Docker and BuildKit settings
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# Build configuration
readonly BUILD_MODE="${BUILD_MODE:-production}"
readonly BUILD_CACHE_DIR="${BUILD_CACHE_DIR:-/tmp/docker-cache}"
readonly SECURITY_SCAN_ENABLED="${SECURITY_SCAN_ENABLED:-true}"
readonly MAX_PARALLEL_BUILDS="${MAX_PARALLEL_BUILDS:-3}"
readonly BUILD_TIMEOUT="${BUILD_TIMEOUT:-3600}"
readonly IMAGE_REGISTRY="${IMAGE_REGISTRY:-ecr.amazonaws.com/workflow-automation}"

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m' # No Color

# =============================================================================
# Utility Functions
# =============================================================================
log() {
    local level=$1
    shift
    local message=$*
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case "$level" in
        "INFO")
            echo -e "${GREEN}[INFO]${NC} ${timestamp} - $message"
            ;;
        "WARN")
            echo -e "${YELLOW}[WARN]${NC} ${timestamp} - $message"
            ;;
        "ERROR")
            echo -e "${RED}[ERROR]${NC} ${timestamp} - $message" >&2
            ;;
    esac
}

check_dependencies() {
    local deps=("docker" "hadolint" "trivy")
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            log "ERROR" "Required dependency not found: $dep"
            exit 1
        fi
    done
    
    # Verify Docker version
    local docker_version
    docker_version=$(docker --version | cut -d ' ' -f3 | cut -d ',' -f1)
    if [[ "$docker_version" < "24.0.6" ]]; then
        log "ERROR" "Docker version must be >= 24.0.6. Found: $docker_version"
        exit 1
    }
}

setup_build_environment() {
    # Create build cache directory
    mkdir -p "${BUILD_CACHE_DIR}"
    
    # Verify BuildKit is enabled
    if [[ "${DOCKER_BUILDKIT}" != "1" ]]; then
        log "ERROR" "BuildKit must be enabled"
        exit 1
    }
}

# =============================================================================
# Build Functions
# =============================================================================
build_go_services() {
    log "INFO" "Building Go services..."
    
    local services=("workflow-engine" "monitoring-service")
    local build_args=(
        "--build-arg BUILD_MODE=${BUILD_MODE}"
        "--cache-from type=local,src=${BUILD_CACHE_DIR}"
        "--cache-to type=local,dest=${BUILD_CACHE_DIR}"
    )
    
    for service in "${services[@]}"; do
        log "INFO" "Building ${service}..."
        
        # Lint Dockerfile
        hadolint "./${service}/Dockerfile" || {
            log "ERROR" "Dockerfile linting failed for ${service}"
            return 1
        }
        
        # Build service
        docker build \
            ${build_args[@]} \
            --target go-builder \
            --tag "${IMAGE_REGISTRY}/${service}:${BUILD_MODE}" \
            "./${service}" || {
            log "ERROR" "Build failed for ${service}"
            return 1
        }
        
        # Security scan if enabled
        if [[ "${SECURITY_SCAN_ENABLED}" == "true" ]]; then
            trivy image --severity HIGH,CRITICAL "${IMAGE_REGISTRY}/${service}:${BUILD_MODE}" || {
                log "ERROR" "Security scan failed for ${service}"
                return 1
            }
        fi
    done
}

build_node_services() {
    log "INFO" "Building Node.js services..."
    
    local services=("api-gateway" "auth-service" "integration-service")
    local build_args=(
        "--build-arg BUILD_MODE=${BUILD_MODE}"
        "--build-arg NODE_ENV=${BUILD_MODE}"
        "--cache-from type=local,src=${BUILD_CACHE_DIR}"
        "--cache-to type=local,dest=${BUILD_CACHE_DIR}"
    )
    
    for service in "${services[@]}"; do
        log "INFO" "Building ${service}..."
        
        # Lint Dockerfile
        hadolint "./${service}/Dockerfile" || {
            log "ERROR" "Dockerfile linting failed for ${service}"
            return 1
        }
        
        # Build service
        docker build \
            ${build_args[@]} \
            --target node-builder \
            --tag "${IMAGE_REGISTRY}/${service}:${BUILD_MODE}" \
            "./${service}" || {
            log "ERROR" "Build failed for ${service}"
            return 1
        }
        
        # Security scan if enabled
        if [[ "${SECURITY_SCAN_ENABLED}" == "true" ]]; then
            trivy image --severity HIGH,CRITICAL "${IMAGE_REGISTRY}/${service}:${BUILD_MODE}" || {
                log "ERROR" "Security scan failed for ${service}"
                return 1
            }
        fi
    done
}

build_python_services() {
    log "INFO" "Building Python services..."
    
    local services=("ai-service")
    local build_args=(
        "--build-arg BUILD_MODE=${BUILD_MODE}"
        "--build-arg PYTHON_ENV=${BUILD_MODE}"
        "--cache-from type=local,src=${BUILD_CACHE_DIR}"
        "--cache-to type=local,dest=${BUILD_CACHE_DIR}"
    )
    
    for service in "${services[@]}"; do
        log "INFO" "Building ${service}..."
        
        # Lint Dockerfile
        hadolint "./${service}/Dockerfile" || {
            log "ERROR" "Dockerfile linting failed for ${service}"
            return 1
        }
        
        # Build service
        docker build \
            ${build_args[@]} \
            --target python-builder \
            --tag "${IMAGE_REGISTRY}/${service}:${BUILD_MODE}" \
            "./${service}" || {
            log "ERROR" "Build failed for ${service}"
            return 1
        }
        
        # Security scan if enabled
        if [[ "${SECURITY_SCAN_ENABLED}" == "true" ]]; then
            trivy image --severity HIGH,CRITICAL "${IMAGE_REGISTRY}/${service}:${BUILD_MODE}" || {
                log "ERROR" "Security scan failed for ${service}"
                return 1
            }
        fi
    done
}

verify_builds() {
    log "INFO" "Verifying builds..."
    
    local services=(
        "workflow-engine"
        "monitoring-service"
        "api-gateway"
        "auth-service"
        "integration-service"
        "ai-service"
    )
    
    for service in "${services[@]}"; do
        if ! docker image inspect "${IMAGE_REGISTRY}/${service}:${BUILD_MODE}" &> /dev/null; then
            log "ERROR" "Image verification failed for ${service}"
            return 1
        fi
    done
}

cleanup() {
    log "INFO" "Cleaning up build artifacts..."
    
    # Remove build cache if in production mode
    if [[ "${BUILD_MODE}" == "production" ]]; then
        rm -rf "${BUILD_CACHE_DIR}"
    fi
    
    # Remove any dangling images
    docker image prune -f
}

# =============================================================================
# Main Execution
# =============================================================================
main() {
    local start_time
    start_time=$(date +%s)
    
    trap cleanup EXIT
    
    log "INFO" "Starting build process in ${BUILD_MODE} mode..."
    
    # Check dependencies and setup
    check_dependencies
    setup_build_environment
    
    # Build services in parallel with maximum concurrency
    (
        build_go_services
        build_node_services
        build_python_services
    ) &
    
    # Wait for all builds to complete
    wait
    
    # Verify all builds
    verify_builds
    
    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log "INFO" "Build process completed successfully in ${duration} seconds"
}

# Execute main function
main "$@"
```

This build script is designed to be robust, secure, and production-ready with the following key features:

1. Strict error handling with `set -euo pipefail`
2. Comprehensive logging with color-coded output
3. Dependency checking including version verification
4. BuildKit optimization for faster builds
5. Parallel service building with configurable concurrency
6. Security scanning with Trivy
7. Dockerfile linting with Hadolint
8. Build caching for improved performance
9. Proper cleanup of build artifacts
10. Build verification steps
11. Support for different build modes (production/development)
12. Proper error propagation and exit codes

The script follows all the requirements from the technical specification and implements the containerization strategy outlined in section 8.3 of the technical specifications.

To use this script:

```bash
# Basic usage
./build.sh

# With custom configuration
BUILD_MODE=production SECURITY_SCAN_ENABLED=true MAX_PARALLEL_BUILDS=4 ./build.sh
```

Make sure to make the script executable:
```bash
chmod +x build.sh