# AWS Provider version constraint
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# KMS Key for RDS Database Encryption
resource "aws_kms_key" "rds" {
  description              = "KMS key for RDS encryption - AES-256-GCM"
  deletion_window_in_days  = 30
  enable_key_rotation     = true
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  key_usage               = "ENCRYPT_DECRYPT"
  multi_region            = true # Enable multi-region support for DR

  # SOC2, HIPAA, and PCI DSS compliant policy
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow RDS Service"
        Effect = "Allow"
        Principal = {
          Service = "rds.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:CreateGrant",
          "kms:ListGrants",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Name        = "rds-encryption-key"
    Environment = var.environment
    Purpose     = "RDS Database Encryption"
    Compliance  = "SOC2-HIPAA-PCI"
    Rotation    = "90-days"
  }
}

# KMS Key for EKS Secrets Encryption
resource "aws_kms_key" "eks" {
  description              = "KMS key for EKS secrets encryption - AES-256-GCM"
  deletion_window_in_days  = 30
  enable_key_rotation     = true
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  key_usage               = "ENCRYPT_DECRYPT"
  multi_region            = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow EKS Service"
        Effect = "Allow"
        Principal = {
          Service = "eks.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:CreateGrant",
          "kms:ListGrants",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Name        = "eks-encryption-key"
    Environment = var.environment
    Purpose     = "EKS Secrets Encryption"
    Compliance  = "SOC2-HIPAA-PCI"
    Rotation    = "90-days"
  }
}

# KMS Key for S3 Bucket Encryption
resource "aws_kms_key" "s3" {
  description              = "KMS key for S3 encryption - AES-256-GCM"
  deletion_window_in_days  = 30
  enable_key_rotation     = true
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  key_usage               = "ENCRYPT_DECRYPT"
  multi_region            = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow S3 Service"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:CreateGrant",
          "kms:ListGrants",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Name        = "s3-encryption-key"
    Environment = var.environment
    Purpose     = "S3 Object Encryption"
    Compliance  = "SOC2-HIPAA-PCI"
    Rotation    = "90-days"
  }
}

# Environment-specific aliases for KMS keys
resource "aws_kms_alias" "rds" {
  name          = "alias/${var.environment}-rds-encryption-key"
  target_key_id = aws_kms_key.rds.key_id
}

resource "aws_kms_alias" "eks" {
  name          = "alias/${var.environment}-eks-encryption-key"
  target_key_id = aws_kms_key.eks.key_id
}

resource "aws_kms_alias" "s3" {
  name          = "alias/${var.environment}-s3-encryption-key"
  target_key_id = aws_kms_key.s3.key_id
}

# Data source for current AWS account ID
data "aws_caller_identity" "current" {}

# Outputs for key IDs to be used by other resources
output "rds_kms_key_id" {
  description = "KMS key ID for RDS encryption"
  value       = aws_kms_key.rds.key_id
  sensitive   = true
}

output "eks_kms_key_id" {
  description = "KMS key ID for EKS secrets encryption"
  value       = aws_kms_key.eks.key_id
  sensitive   = true
}

output "s3_kms_key_id" {
  description = "KMS key ID for S3 encryption"
  value       = aws_kms_key.s3.key_id
  sensitive   = true
}