#!/usr/bin/env bash

# Enterprise-grade PostgreSQL Database Backup Script
# Version: 1.0.0
# Purpose: Automated database backups with encryption, compression and cross-region replication
# Compliance: SOC2, HIPAA, PCI-DSS

set -euo pipefail
IFS=$'\n\t'

# Import environment variables
source /etc/environment

# Global Constants
readonly BACKUP_BUCKET="${BACKUP_BUCKET:-workflow-automation-backups-${AWS_REGION}}"
readonly DR_BACKUP_BUCKET="${DR_BACKUP_BUCKET:-workflow-automation-backups-${DR_REGION}}"
readonly BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-90}"
readonly DB_NAME="${DB_NAME:-workflow_automation}"
readonly TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
readonly LOG_DIR="${LOG_DIR:-/var/log/backup}"
readonly TEMP_DIR="${TEMP_DIR:-/tmp/backup-${TIMESTAMP}}"
readonly MAX_RETRIES="${MAX_RETRIES:-3}"
readonly COMPRESSION_LEVEL="${COMPRESSION_LEVEL:-9}"

# Logging Configuration
setup_logging() {
    mkdir -p "${LOG_DIR}"
    exec 1> >(tee -a "${LOG_DIR}/backup-${TIMESTAMP}.log")
    exec 2> >(tee -a "${LOG_DIR}/backup-${TIMESTAMP}.error.log")
}

# Logging function with ISO8601 timestamps
log() {
    local level="$1"
    shift
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [${level}] $*"
}

# Error handling function
error_handler() {
    local exit_code=$?
    log "ERROR" "An error occurred on line $1"
    cleanup
    exit "${exit_code}"
}

# Set error trap
trap 'error_handler ${LINENO}' ERR

# Cleanup function
cleanup() {
    log "INFO" "Performing cleanup..."
    if [[ -d "${TEMP_DIR}" ]]; then
        rm -rf "${TEMP_DIR}"
    fi
}

# Verify prerequisites
verify_prerequisites() {
    local required_commands=("aws" "pg_dump" "gzip")
    
    for cmd in "${required_commands[@]}"; do
        if ! command -v "${cmd}" >/dev/null 2>&1; then
            log "ERROR" "Required command not found: ${cmd}"
            exit 1
        fi
    done
    
    # Verify AWS credentials
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        log "ERROR" "AWS credentials not configured properly"
        exit 1
    }
}

# Create RDS snapshot
create_snapshot() {
    local db_identifier="$1"
    local snapshot_type="$2"
    local snapshot_identifier="${db_identifier}-${snapshot_type}-${TIMESTAMP}"
    
    log "INFO" "Creating RDS snapshot: ${snapshot_identifier}"
    
    aws rds create-db-snapshot \
        --db-instance-identifier "${db_identifier}" \
        --db-snapshot-identifier "${snapshot_identifier}" \
        --tags Key=BackupType,Value="${snapshot_type}" \
              Key=Timestamp,Value="${TIMESTAMP}" \
              Key=RetentionDays,Value="${BACKUP_RETENTION_DAYS}" \
        --region "${AWS_REGION}"
    
    # Wait for snapshot completion
    aws rds wait db-snapshot-available \
        --db-snapshot-identifier "${snapshot_identifier}" \
        --region "${AWS_REGION}"
    
    log "INFO" "Snapshot created successfully: ${snapshot_identifier}"
    echo "${snapshot_identifier}"
}

# Perform logical backup with encryption and compression
perform_logical_backup() {
    local db_host="$1"
    local db_name="$2"
    local backup_type="$3"
    local backup_file="${TEMP_DIR}/${db_name}_${backup_type}_${TIMESTAMP}.sql.gz.enc"
    
    mkdir -p "${TEMP_DIR}"
    chmod 700 "${TEMP_DIR}"
    
    log "INFO" "Starting logical backup for ${db_name}"
    
    # Stream backup with compression and encryption
    PGPASSWORD="${DB_PASSWORD}" pg_dump \
        -h "${db_host}" \
        -U "${DB_USER}" \
        -d "${db_name}" \
        -F c \
        --no-owner \
        --no-acl \
        | gzip -${COMPRESSION_LEVEL} \
        | aws kms encrypt \
            --key-id "${KMS_KEY_ID}" \
            --encryption-context Database="${db_name}",Timestamp="${TIMESTAMP}" \
            --region "${AWS_REGION}" \
            --output text \
            --query CiphertextBlob \
        > "${backup_file}"
    
    # Verify backup integrity
    if [[ ! -s "${backup_file}" ]]; then
        log "ERROR" "Backup file is empty or failed to create"
        return 1
    }
    
    # Calculate and store checksum
    sha256sum "${backup_file}" > "${backup_file}.sha256"
    
    log "INFO" "Logical backup completed successfully"
    echo "${backup_file}"
}

# Replicate backup to DR region
replicate_backup() {
    local source_file="$1"
    local dr_region="$2"
    
    log "INFO" "Replicating backup to DR region: ${dr_region}"
    
    # Upload to primary region
    aws s3 cp "${source_file}" "s3://${BACKUP_BUCKET}/" \
        --region "${AWS_REGION}" \
        --sse aws:kms \
        --sse-kms-key-id "${KMS_KEY_ID}"
    
    # Replicate to DR region
    aws s3 cp "s3://${BACKUP_BUCKET}/$(basename ${source_file})" \
        "s3://${DR_BACKUP_BUCKET}/" \
        --region "${dr_region}" \
        --source-region "${AWS_REGION}"
    
    # Verify replication
    local primary_etag=$(aws s3api head-object \
        --bucket "${BACKUP_BUCKET}" \
        --key "$(basename ${source_file})" \
        --region "${AWS_REGION}" \
        --query ETag --output text)
    
    local dr_etag=$(aws s3api head-object \
        --bucket "${DR_BACKUP_BUCKET}" \
        --key "$(basename ${source_file})" \
        --region "${dr_region}" \
        --query ETag --output text)
    
    if [[ "${primary_etag}" != "${dr_etag}" ]]; then
        log "ERROR" "Replication verification failed"
        return 1
    }
    
    log "INFO" "Backup replication completed successfully"
    return 0
}

# Cleanup old backups
cleanup_old_backups() {
    local retention_days="$1"
    local include_dr="$2"
    
    log "INFO" "Cleaning up backups older than ${retention_days} days"
    
    # Delete old backups from primary region
    aws s3 rm "s3://${BACKUP_BUCKET}/" \
        --recursive \
        --region "${AWS_REGION}" \
        --exclude "*" \
        --include "*.sql.gz.enc" \
        --include "*.sha256" \
        --older-than "${retention_days}D"
    
    if [[ "${include_dr}" == "true" ]]; then
        # Delete old backups from DR region
        aws s3 rm "s3://${DR_BACKUP_BUCKET}/" \
            --recursive \
            --region "${DR_REGION}" \
            --exclude "*" \
            --include "*.sql.gz.enc" \
            --include "*.sha256" \
            --older-than "${retention_days}D"
    fi
    
    log "INFO" "Cleanup completed successfully"
}

# Main execution
main() {
    local exit_code=0
    
    setup_logging
    log "INFO" "Starting database backup process"
    
    verify_prerequisites
    
    # Create snapshot backup
    local snapshot_id
    snapshot_id=$(create_snapshot "${DB_IDENTIFIER}" "automated")
    
    # Perform logical backup
    local backup_file
    backup_file=$(perform_logical_backup "${DB_HOST}" "${DB_NAME}" "full")
    
    # Replicate to DR region
    replicate_backup "${backup_file}" "${DR_REGION}"
    
    # Cleanup old backups
    cleanup_old_backups "${BACKUP_RETENTION_DAYS}" "true"
    
    # Final cleanup
    cleanup
    
    log "INFO" "Backup process completed successfully"
    return "${exit_code}"
}

# Execute main function
main "$@"