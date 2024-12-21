#!/bin/bash

# migrate.sh - Enterprise-grade database migration script
# Version: 1.0.0
# Dependencies:
# - psql v15.0
# - golang-migrate v4.16.2
# - openssl v3.0.0

set -euo pipefail
IFS=$'\n\t'

# Load environment variables
if [[ -f .env ]]; then
    source .env
else
    echo "Error: .env file not found"
    exit 1
fi

# Global constants
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly MIGRATION_DIR="/migrations"
readonly BACKUP_DIR="/backups"
readonly LOG_DIR="/logs"
readonly LOCK_FILE="/tmp/migration.lock"
readonly SERVICES=("workflow-engine" "auth-service" "integration-service")
readonly TIMESTAMP=$(date +%Y%m%d_%H%M%S)
readonly LOG_FILE="${LOG_DIR}/migration_${TIMESTAMP}.log"

# Logging functions
log_info() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [INFO] $*" | tee -a "$LOG_FILE"
}

log_error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [ERROR] $*" | tee -a "$LOG_FILE"
}

log_audit() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [AUDIT] $*" | tee -a "$LOG_FILE"
}

# Check prerequisites and setup
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check required tools
    local required_tools=("psql" "migrate" "openssl")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "Required tool not found: $tool"
            return 1
        fi
    done

    # Verify tool versions
    if ! psql --version | grep -q "15.0"; then
        log_error "PostgreSQL 15.0 is required"
        return 1
    fi

    # Check environment variables
    local required_vars=("DATABASE_URL" "BACKUP_ENCRYPTION_KEY" "BACKUP_RETENTION_DAYS")
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            log_error "Required environment variable not set: $var"
            return 1
        fi
    done

    # Create required directories
    local dirs=("$MIGRATION_DIR" "$BACKUP_DIR" "$LOG_DIR")
    for dir in "${dirs[@]}"; do
        if [[ ! -d "$dir" ]]; then
            mkdir -p "$dir"
            chmod 750 "$dir"
        fi
    done

    # Check database connection
    if ! PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c '\q' &> /dev/null; then
        log_error "Database connection failed"
        return 1
    }

    # Check lock file
    if [[ -f "$LOCK_FILE" ]]; then
        local lock_pid
        lock_pid=$(cat "$LOCK_FILE")
        if kill -0 "$lock_pid" 2>/dev/null; then
            log_error "Migration already in progress (PID: $lock_pid)"
            return 1
        else
            rm -f "$LOCK_FILE"
        fi
    fi

    log_info "Prerequisites check completed successfully"
    return 0
}

# Create encrypted database backup
backup_database() {
    log_info "Starting database backup..."
    local backup_file="${BACKUP_DIR}/backup_${TIMESTAMP}.sql.gz.enc"
    local checksum_file="${backup_file}.sha256"

    # Create backup with progress monitoring
    PGPASSWORD="$DB_PASSWORD" pg_dump \
        -h "$DB_HOST" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --format=custom \
        --compress=9 \
        --no-owner \
        --no-privileges \
        2>> "$LOG_FILE" | \
        gzip -9 | \
        openssl enc -aes-256-gcm \
        -salt \
        -pass pass:"$BACKUP_ENCRYPTION_KEY" \
        -out "$backup_file"

    if [[ $? -ne 0 ]]; then
        log_error "Backup creation failed"
        return 1
    fi

    # Generate and store checksum
    sha256sum "$backup_file" > "$checksum_file"

    # Implement backup retention
    find "$BACKUP_DIR" -name "backup_*.sql.gz.enc" -mtime +"$BACKUP_RETENTION_DAYS" -delete
    find "$BACKUP_DIR" -name "backup_*.sql.gz.enc.sha256" -mtime +"$BACKUP_RETENTION_DAYS" -delete

    log_audit "Backup created successfully: $backup_file"
    return 0
}

# Monitor migration progress
monitor_migration() {
    local service_name="$1"
    local start_time
    start_time=$(date +%s)

    # Start monitoring in background
    (
        while true; do
            local current_time
            current_time=$(date +%s)
            local duration=$((current_time - start_time))

            # Get database metrics
            local db_connections
            db_connections=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM pg_stat_activity")

            # Log metrics
            log_info "Migration progress - Service: $service_name, Duration: ${duration}s, DB Connections: $db_connections"
            sleep 5
        done
    ) &
    local monitor_pid=$!

    # Return monitor PID for cleanup
    echo "$monitor_pid"
}

# Execute migrations for a service
run_migrations() {
    local service_name="$1"
    local service_dir="${SCRIPT_DIR}/../${service_name}"
    local migration_path="${service_dir}${MIGRATION_DIR}"

    log_info "Starting migrations for $service_name..."

    # Acquire migration lock
    echo $$ > "$LOCK_FILE"
    trap 'rm -f "$LOCK_FILE"' EXIT

    # Start monitoring
    local monitor_pid
    monitor_pid=$(monitor_migration "$service_name")

    # Begin transaction
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "BEGIN" &>> "$LOG_FILE"

    # Execute migrations with retry logic
    local retry_count=0
    local max_retries=3
    local success=false

    while [[ $retry_count -lt $max_retries && $success == false ]]; do
        if migrate -path "$migration_path" -database "$DATABASE_URL" up; then
            success=true
        else
            ((retry_count++))
            log_error "Migration attempt $retry_count failed for $service_name"
            sleep $((retry_count * 5))
        fi
    done

    # Stop monitoring
    kill "$monitor_pid" 2>/dev/null || true

    if [[ $success == true ]]; then
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "COMMIT" &>> "$LOG_FILE"
        log_audit "Migrations completed successfully for $service_name"
        return 0
    else
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "ROLLBACK" &>> "$LOG_FILE"
        log_error "Migration failed for $service_name after $max_retries attempts"
        return 1
    fi
}

# Main execution
main() {
    log_info "Starting database migration process..."

    # Check prerequisites
    if ! check_prerequisites; then
        log_error "Prerequisites check failed"
        exit 1
    fi

    # Create backup
    if ! backup_database; then
        log_error "Backup failed, aborting migration"
        exit 1
    fi

    # Execute migrations for each service
    local failed_services=()
    for service in "${SERVICES[@]}"; do
        if ! run_migrations "$service"; then
            failed_services+=("$service")
        fi
    done

    # Report results
    if [[ ${#failed_services[@]} -eq 0 ]]; then
        log_info "All migrations completed successfully"
        exit 0
    else
        log_error "Migrations failed for services: ${failed_services[*]}"
        exit 1
    fi
}

# Execute main function
main "$@"