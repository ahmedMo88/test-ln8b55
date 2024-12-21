# S3 Bucket Configuration for Workflow Automation Platform
# Version: 1.0.0
# Provider: AWS ~> 5.0

# Local variables for consistent naming and tagging
locals {
  project_name = "workflow-automation"
  common_tags = merge(var.common_tags, {
    Project            = local.project_name
    Environment        = var.environment
    ManagedBy         = "terraform"
    SecurityLevel     = "high"
    ComplianceRequired = "true"
  })
}

# Main bucket for workflow file attachments
resource "aws_s3_bucket" "workflow_files" {
  bucket = "${local.project_name}-${var.environment}-files"
  force_destroy = false
  object_lock_enabled = true

  tags = local.common_tags
}

# Bucket for execution logs and audit trails
resource "aws_s3_bucket" "workflow_logs" {
  bucket = "${local.project_name}-${var.environment}-logs"
  force_destroy = false
  object_lock_enabled = true

  tags = local.common_tags
}

# Bucket for database backups and system snapshots
resource "aws_s3_bucket" "workflow_backups" {
  bucket = "${local.project_name}-${var.environment}-backups"
  force_destroy = false
  object_lock_enabled = true

  tags = local.common_tags
}

# Versioning configuration for all buckets
resource "aws_s3_bucket_versioning" "workflow_files" {
  bucket = aws_s3_bucket.workflow_files.id
  versioning_configuration {
    status = "Enabled"
    mfa_delete = "Enabled"
  }
}

resource "aws_s3_bucket_versioning" "workflow_logs" {
  bucket = aws_s3_bucket.workflow_logs.id
  versioning_configuration {
    status = "Enabled"
    mfa_delete = "Enabled"
  }
}

resource "aws_s3_bucket_versioning" "workflow_backups" {
  bucket = aws_s3_bucket.workflow_backups.id
  versioning_configuration {
    status = "Enabled"
    mfa_delete = "Enabled"
  }
}

# Server-side encryption configuration
resource "aws_s3_bucket_server_side_encryption_configuration" "workflow_files" {
  bucket = aws_s3_bucket.workflow_files.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = data.aws_kms_key.s3_key.id
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "workflow_logs" {
  bucket = aws_s3_bucket.workflow_logs.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = data.aws_kms_key.s3_key.id
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "workflow_backups" {
  bucket = aws_s3_bucket.workflow_backups.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = data.aws_kms_key.s3_key.id
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

# Lifecycle rules for intelligent tiering and archival
resource "aws_s3_bucket_lifecycle_configuration" "workflow_files" {
  bucket = aws_s3_bucket.workflow_files.id

  rule {
    id     = "intelligent-tiering"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "INTELLIGENT_TIERING"
    }

    noncurrent_version_transition {
      noncurrent_days = 90
      storage_class   = "GLACIER"
    }

    noncurrent_version_expiration {
      noncurrent_days = 365
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "workflow_logs" {
  bucket = aws_s3_bucket.workflow_logs.id

  rule {
    id     = "log-retention"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "INTELLIGENT_TIERING"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "workflow_backups" {
  bucket = aws_s3_bucket.workflow_backups.id

  rule {
    id     = "backup-retention"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "INTELLIGENT_TIERING"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# Cross-region replication for disaster recovery
data "aws_iam_role" "replication" {
  name = "s3-bucket-replication-${var.environment}"
}

resource "aws_s3_bucket_replication_configuration" "workflow_files" {
  bucket = aws_s3_bucket.workflow_files.id
  role   = data.aws_iam_role.replication.arn

  rule {
    id     = "disaster-recovery"
    status = "Enabled"

    destination {
      bucket        = "arn:aws:s3:::${local.project_name}-${var.environment}-files-dr"
      storage_class = "STANDARD_IA"

      encryption_configuration {
        replica_kms_key_id = data.aws_kms_key.s3_key.arn
      }
    }
  }
}

# Output definitions for bucket access
output "workflow_files_bucket" {
  description = "Workflow files bucket details"
  value = {
    id          = aws_s3_bucket.workflow_files.id
    arn         = aws_s3_bucket.workflow_files.arn
    domain_name = aws_s3_bucket.workflow_files.bucket_domain_name
  }
}

output "workflow_logs_bucket" {
  description = "Workflow logs bucket details"
  value = {
    id          = aws_s3_bucket.workflow_logs.id
    arn         = aws_s3_bucket.workflow_logs.arn
    domain_name = aws_s3_bucket.workflow_logs.bucket_domain_name
  }
}

output "workflow_backups_bucket" {
  description = "Workflow backups bucket details"
  value = {
    id          = aws_s3_bucket.workflow_backups.id
    arn         = aws_s3_bucket.workflow_backups.arn
    domain_name = aws_s3_bucket.workflow_backups.bucket_domain_name
  }
}