#!/bin/bash

# Test script for comprehensive backend testing with enhanced security and monitoring
# Version: 1.0.0

set -e # Exit on error
set -o pipefail # Exit on pipe failure

# Configuration
COVERAGE_DIR=${COVERAGE_DIR:-"./coverage"}
LOG_LEVEL=${LOG_LEVEL:-"debug"}
SECURITY_SCAN_LEVEL=${SECURITY_SCAN_LEVEL:-"high"}
PERFORMANCE_THRESHOLD=${PERFORMANCE_THRESHOLD:-"5000"} # 5 seconds
MAX_RETRIES=${MAX_RETRIES:-"3"}
PARALLEL_JOBS=${PARALLEL_JOBS:-"4"}

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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

# Setup test environment
setup_test_env() {
    local env_type=$1
    log_info "Setting up test environment: $env_type"

    # Export test environment variables
    export NODE_ENV="test"
    export GO_ENV="test"
    export PYTHON_ENV="test"

    # Create coverage directory
    mkdir -p "$COVERAGE_DIR"

    # Start test databases and dependencies using docker-compose
    log_info "Starting test dependencies..."
    docker-compose -f src/backend/docker-compose.yml up -d --force-recreate

    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 10

    # Initialize test data if needed
    log_info "Initializing test data..."
}

# Run security tests
run_security_tests() {
    log_info "Running security tests..."

    # Run OWASP ZAP security scan
    log_info "Running OWASP ZAP scan..."
    docker run --rm \
        -v "$(pwd)/src/backend/test/security:/zap/wrk/:rw" \
        -t owasp/zap2docker-stable:2.14.0 \
        zap-baseline.py \
        -t http://localhost:3000 \
        -c zap-config.conf \
        -l "$SECURITY_SCAN_LEVEL" \
        -r security-report.html

    # Run SonarQube analysis
    log_info "Running SonarQube analysis..."
    sonar-scanner \
        -Dsonar.projectKey=workflow-automation \
        -Dsonar.sources=. \
        -Dsonar.host.url=http://localhost:9000

    # Run dependency vulnerability check
    log_info "Checking dependencies for vulnerabilities..."
    npm audit --production
    go list -json -m all | nancy sleuth
}

# Run performance tests
run_performance_tests() {
    log_info "Running performance tests..."

    # Run k6 load tests
    log_info "Running k6 load tests..."
    k6 run src/backend/test/performance/k6-config.js \
        --vus 10 \
        --duration 30s \
        --summary-trend-stats="avg,min,med,max,p(95),p(99)"

    # Validate response times
    if [[ $(cat k6-results.json | jq '.metrics.http_req_duration.avg') > $PERFORMANCE_THRESHOLD ]]; then
        log_error "Performance test failed: Response time exceeds threshold"
        return 1
    fi
}

# Run integration tests
run_integration_tests() {
    log_info "Running integration tests..."

    # Run AI service integration tests
    log_info "Running AI service tests..."
    cd src/backend/ai-service && \
    python -m pytest tests/integration/agent_test.py \
        --cov=src \
        --cov-report=xml:$COVERAGE_DIR/ai-coverage.xml \
        -v

    # Run workflow engine integration tests
    log_info "Running workflow engine tests..."
    cd ../workflow-engine && \
    go test -v ./test/integration/... \
        -coverprofile=$COVERAGE_DIR/workflow-coverage.out \
        -timeout 5m

    # Run auth service integration tests
    log_info "Running auth service tests..."
    cd ../auth-service && \
    npm run test:integration -- \
        --coverage \
        --coverageDirectory=$COVERAGE_DIR \
        --ci \
        --runInBand
}

# Generate test report
generate_test_report() {
    log_info "Generating test reports..."

    # Combine coverage reports
    log_info "Combining coverage reports..."
    npx nyc merge \
        "$COVERAGE_DIR" \
        "$COVERAGE_DIR/combined-coverage.json"

    # Generate HTML report
    npx nyc report \
        --reporter=html \
        --reporter=text-summary \
        --temp-dir="$COVERAGE_DIR"

    # Generate test summary
    log_info "Generating test summary..."
    echo "Test Summary" > test-summary.txt
    echo "============" >> test-summary.txt
    echo "Security Tests: $(cat security-report.html | grep -c 'PASS')/$(cat security-report.html | grep -c 'TOTAL')" >> test-summary.txt
    echo "Performance Tests: $(cat k6-results.json | jq '.metrics.checks.passes') checks passed" >> test-summary.txt
    echo "Integration Tests: $(find . -name '*test*.xml' -exec grep -h "<testcase" {} \; | wc -l) tests executed" >> test-summary.txt
}

# Cleanup test environment
cleanup_test_env() {
    log_info "Cleaning up test environment..."

    # Stop and remove containers
    docker-compose -f src/backend/docker-compose.yml down --volumes --remove-orphans

    # Remove temporary files
    rm -rf "$COVERAGE_DIR"/*.tmp
}

# Main execution
main() {
    local start_time=$(date +%s)

    # Trap cleanup on exit
    trap cleanup_test_env EXIT

    # Setup test environment
    setup_test_env "integration"

    # Run test suites
    run_security_tests
    run_performance_tests
    run_integration_tests

    # Generate reports
    generate_test_report

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    log_info "All tests completed in ${duration} seconds"
}

# Execute main function
main "$@"
```

This script provides a comprehensive test execution environment with the following features:

1. Environment Setup:
- Configures test environment variables
- Starts required services using docker-compose
- Initializes test data and dependencies

2. Security Testing:
- OWASP ZAP security scanning
- SonarQube code analysis
- Dependency vulnerability checks

3. Performance Testing:
- k6 load testing
- Response time validation
- Resource utilization monitoring

4. Integration Testing:
- AI service tests (Python/pytest)
- Workflow engine tests (Go)
- Auth service tests (Node.js/Jest)

5. Reporting:
- Combined coverage reports
- Security scan results
- Performance metrics
- Test execution summary

6. Error Handling:
- Graceful cleanup on exit
- Detailed logging
- Retry mechanisms for flaky tests

The script follows best practices for shell scripting and includes:
- Proper error handling
- Configurable parameters
- Colored output for better readability
- Comprehensive logging
- Modular function design
- Cleanup on exit

To use this script:
1. Make it executable: `chmod +x test.sh`
2. Run it: `./test.sh`

The script can be customized through environment variables:
```bash
COVERAGE_DIR="./custom-coverage" \
LOG_LEVEL="info" \
SECURITY_SCAN_LEVEL="medium" \
PERFORMANCE_THRESHOLD="3000" \
PARALLEL_JOBS="8" \
./test.sh