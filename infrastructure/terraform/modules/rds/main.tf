# AWS RDS PostgreSQL Module
# Version: ~> 5.0
# Purpose: Defines a highly available, encrypted PostgreSQL RDS instance with monitoring

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

# KMS key for RDS encryption with automatic rotation
resource "aws_kms_key" "rds" {
  description             = "KMS key for RDS encryption - ${var.name}-${var.environment}"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  multi_region           = true
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.name}-${var.environment}-rds-key"
      Environment = var.environment
    }
  )
}

# KMS key alias for easier identification
resource "aws_kms_alias" "rds" {
  name          = "alias/${var.name}-${var.environment}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

# Random password generation for RDS instance
resource "random_password" "master" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# Store the master password in AWS Secrets Manager
resource "aws_secretsmanager_secret" "rds_password" {
  name                    = "${var.name}-${var.environment}-rds-master-password"
  description             = "Master password for RDS instance ${var.name}-${var.environment}"
  kms_key_id             = aws_kms_key.rds.arn
  recovery_window_in_days = 30
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.name}-${var.environment}-rds-password"
      Environment = var.environment
    }
  )
}

resource "aws_secretsmanager_secret_version" "rds_password" {
  secret_id     = aws_secretsmanager_secret.rds_password.id
  secret_string = random_password.master.result
}

# Enhanced monitoring IAM role
resource "aws_iam_role" "rds_monitoring" {
  name = "${var.name}-${var.environment}-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(
    var.tags,
    {
      Name        = "${var.name}-${var.environment}-rds-monitoring-role"
      Environment = var.environment
    }
  )
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# DB parameter group for PostgreSQL 15
resource "aws_db_parameter_group" "this" {
  name        = "${var.name}-${var.environment}-pg15"
  family      = "postgres15"
  description = "Custom parameter group for ${var.name}-${var.environment} PostgreSQL 15"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "log_statement"
    value = "all"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements,pg_hint_plan"
  }

  parameter {
    name  = "pg_stat_statements.track"
    value = "all"
  }

  tags = merge(
    var.tags,
    {
      Name        = "${var.name}-${var.environment}-pg15"
      Environment = var.environment
    }
  )
}

# DB subnet group for multi-AZ deployment
resource "aws_db_subnet_group" "this" {
  name        = "${var.name}-${var.environment}"
  description = "Subnet group for ${var.name}-${var.environment} RDS instance"
  subnet_ids  = var.subnet_ids

  tags = merge(
    var.tags,
    {
      Name        = "${var.name}-${var.environment}"
      Environment = var.environment
    }
  )
}

# Security group for RDS access
resource "aws_security_group" "rds" {
  name        = "${var.name}-${var.environment}-rds"
  description = "Security group for ${var.name}-${var.environment} RDS instance"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    cidr_blocks     = var.allowed_cidr_blocks
    description     = "PostgreSQL access from allowed networks"
  }

  egress {
    from_port       = 0
    to_port         = 0
    protocol        = "-1"
    cidr_blocks     = ["0.0.0.0/0"]
    description     = "Allow all outbound traffic"
  }

  tags = merge(
    var.tags,
    {
      Name        = "${var.name}-${var.environment}-rds-sg"
      Environment = var.environment
    }
  )
}

# Main RDS instance
resource "aws_db_instance" "this" {
  identifier     = "${var.name}-${var.environment}"
  engine         = "postgres"
  engine_version = "15.0"
  
  instance_class               = var.instance_class
  allocated_storage           = var.allocated_storage
  max_allocated_storage       = var.max_allocated_storage
  storage_type                = "gp3"
  storage_encrypted           = true
  kms_key_id                  = aws_kms_key.rds.arn
  
  db_name                     = replace("${var.name}_${var.environment}", "-", "_")
  username                    = "master_${var.environment}"
  password                    = random_password.master.result
  port                        = 5432
  
  multi_az                    = true
  db_subnet_group_name        = aws_db_subnet_group.this.name
  vpc_security_group_ids      = [aws_security_group.rds.id]
  parameter_group_name        = aws_db_parameter_group.this.name
  
  backup_retention_period     = var.backup_retention_period
  backup_window              = "03:00-04:00"
  maintenance_window         = "Mon:04:00-Mon:05:00"
  copy_tags_to_snapshot      = true
  
  performance_insights_enabled          = var.performance_insights_enabled
  performance_insights_retention_period = 7
  monitoring_interval                   = var.monitoring_interval
  monitoring_role_arn                   = aws_iam_role.rds_monitoring.arn
  
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  
  deletion_protection          = var.deletion_protection
  skip_final_snapshot         = false
  final_snapshot_identifier   = "${var.name}-${var.environment}-final-${formatdate("YYYYMMDD-hhmmss", timestamp())}"
  
  auto_minor_version_upgrade  = true
  apply_immediately           = false

  tags = merge(
    var.tags,
    {
      Name        = "${var.name}-${var.environment}"
      Environment = var.environment
    }
  )
}

# CloudWatch alarms for RDS monitoring
resource "aws_cloudwatch_metric_alarm" "cpu_utilization" {
  alarm_name          = "${var.name}-${var.environment}-rds-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name        = "CPUUtilization"
  namespace          = "AWS/RDS"
  period             = "300"
  statistic          = "Average"
  threshold          = "80"
  alarm_description  = "This metric monitors RDS CPU utilization"
  alarm_actions      = []  # Add SNS topic ARN for notifications

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.this.id
  }

  tags = merge(
    var.tags,
    {
      Name        = "${var.name}-${var.environment}-rds-cpu-alarm"
      Environment = var.environment
    }
  )
}

# Outputs
output "endpoint" {
  description = "The connection endpoint for the RDS instance"
  value       = aws_db_instance.this.endpoint
}

output "password_secret_arn" {
  description = "ARN of the Secrets Manager secret containing the database password"
  value       = aws_secretsmanager_secret.rds_password.arn
}

output "security_group_id" {
  description = "ID of the security group attached to the RDS instance"
  value       = aws_security_group.rds.id
}

output "instance_id" {
  description = "ID of the RDS instance"
  value       = aws_db_instance.this.id
}