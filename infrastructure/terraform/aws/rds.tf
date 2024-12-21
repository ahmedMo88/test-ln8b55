# AWS RDS Configuration for Workflow Automation Platform
# Version: ~> 5.0 (AWS Provider)
# Version: ~> 6.1 (RDS Module)

# Random password generation for RDS instance
resource "random_password" "rds" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# AWS Secrets Manager secret for RDS credentials
resource "aws_secretsmanager_secret" "rds_credentials" {
  name        = "${var.environment}-workflow-automation-rds-credentials"
  description = "RDS credentials for workflow automation platform"
  
  tags = {
    Environment = var.environment
    Project     = "workflow-automation"
    Terraform   = "true"
  }
}

resource "aws_secretsmanager_secret_version" "rds_credentials" {
  secret_id = aws_secretsmanager_secret.rds_credentials.id
  secret_string = jsonencode({
    username = "workflow_admin"
    password = random_password.rds.result
    dbname   = "workflow_automation"
    host     = module.rds.db_instance_address
    port     = 5432
  })
}

# Security group for RDS instance
resource "aws_security_group" "rds" {
  name_prefix = "${var.environment}-rds-"
  description = "Security group for RDS PostgreSQL instance"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "PostgreSQL access from VPC"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.environment}-rds-sg"
    Environment = var.environment
    Project     = "workflow-automation"
    Terraform   = "true"
  }
}

# RDS Parameter Group
resource "aws_db_parameter_group" "postgres" {
  name_prefix = "${var.environment}-workflow-automation-"
  family      = "postgres15"
  description = "Custom parameter group for workflow automation PostgreSQL"

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements,auto_explain"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  parameter {
    name  = "auto_explain.log_min_duration"
    value = "1000"
  }

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  tags = {
    Environment = var.environment
    Project     = "workflow-automation"
    Terraform   = "true"
  }
}

# RDS Subnet Group
resource "aws_db_subnet_group" "rds" {
  name_prefix = "${var.environment}-workflow-automation-"
  description = "Subnet group for workflow automation RDS instance"
  subnet_ids  = module.vpc.private_subnet_ids

  tags = {
    Environment = var.environment
    Project     = "workflow-automation"
    Terraform   = "true"
  }
}

# RDS Instance using AWS RDS Module
module "rds" {
  source  = "terraform-aws-modules/rds/aws"
  version = "~> 6.1"

  identifier = "workflow-automation-${var.environment}"

  # Engine configuration
  engine               = "postgres"
  engine_version       = "15.0"
  family              = "postgres15"
  major_engine_version = "15"
  instance_class       = var.db_instance_class

  # Storage configuration
  allocated_storage     = 100
  max_allocated_storage = 1000
  storage_encrypted     = true
  storage_type         = "gp3"

  # Database configuration
  db_name  = "workflow_automation"
  username = "workflow_admin"
  password = random_password.rds.result
  port     = 5432

  # Network configuration
  multi_az               = var.multi_az
  subnet_ids             = module.vpc.private_subnet_ids
  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.rds.name

  # Maintenance configuration
  maintenance_window          = "Mon:00:00-Mon:03:00"
  backup_window              = "03:00-06:00"
  backup_retention_period    = var.backup_retention_days
  delete_automated_backups   = false
  deletion_protection        = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.environment}-workflow-automation-final-${formatdate("YYYY-MM-DD", timestamp())}"

  # Monitoring configuration
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  create_cloudwatch_log_group     = true
  performance_insights_enabled    = true
  performance_insights_retention_period = 7
  monitoring_interval             = 10
  create_monitoring_role         = true
  monitoring_role_name          = "rds-monitoring-role-${var.environment}"

  # Parameter group
  parameter_group_name = aws_db_parameter_group.postgres.name
  
  tags = {
    Environment        = var.environment
    Project           = "workflow-automation"
    Terraform         = "true"
    SecurityLevel     = "high"
    DataClassification = "confidential"
    BackupRetention   = var.backup_retention_days
  }
}

# Outputs
output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = module.rds.db_instance_endpoint
}

output "rds_arn" {
  description = "RDS instance ARN"
  value       = module.rds.db_instance_arn
}

output "rds_secret_arn" {
  description = "ARN of the secret containing RDS credentials"
  value       = aws_secretsmanager_secret.rds_credentials.arn
}

output "rds_security_group_id" {
  description = "ID of the RDS security group"
  value       = aws_security_group.rds.id
}