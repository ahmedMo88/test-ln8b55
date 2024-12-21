# RDS Instance Connection Information
output "endpoint" {
  description = "RDS instance endpoint for application connection"
  value       = aws_db_instance.this.endpoint
}

output "address" {
  description = "RDS instance hostname"
  value       = aws_db_instance.this.address
}

output "port" {
  description = "RDS instance port number"
  value       = aws_db_instance.this.port
}

output "id" {
  description = "RDS instance identifier"
  value       = aws_db_instance.this.id
}

# Network Configuration
output "security_group_id" {
  description = "ID of the security group attached to RDS"
  value       = aws_security_group.rds.id
}

output "subnet_group_name" {
  description = "Name of the DB subnet group"
  value       = aws_db_subnet_group.this.name
}

# Additional Outputs for Platform Configuration
output "database_name" {
  description = "Name of the default database"
  value       = aws_db_instance.this.db_name
}

output "master_username" {
  description = "Master username for database access"
  value       = aws_db_instance.this.username
}

output "password_secret_arn" {
  description = "ARN of the Secrets Manager secret containing the database password"
  value       = aws_secretsmanager_secret.rds_password.arn
  sensitive   = true
}

output "kms_key_id" {
  description = "ID of the KMS key used for encryption"
  value       = aws_kms_key.rds.id
}

output "kms_key_arn" {
  description = "ARN of the KMS key used for encryption"
  value       = aws_kms_key.rds.arn
}

# Monitoring Information
output "enhanced_monitoring_iam_role_arn" {
  description = "ARN of the enhanced monitoring IAM role"
  value       = aws_iam_role.rds_monitoring.arn
}

output "performance_insights_enabled" {
  description = "Whether Performance Insights is enabled"
  value       = aws_db_instance.this.performance_insights_enabled
}

# High Availability Configuration
output "availability_zone" {
  description = "Availability zone of the RDS instance"
  value       = aws_db_instance.this.availability_zone
}

output "multi_az" {
  description = "Whether the RDS instance is multi-AZ"
  value       = aws_db_instance.this.multi_az
}

# Backup Configuration
output "backup_retention_period" {
  description = "Backup retention period in days"
  value       = aws_db_instance.this.backup_retention_period
}

output "backup_window" {
  description = "Preferred backup window"
  value       = aws_db_instance.this.backup_window
}

output "maintenance_window" {
  description = "Preferred maintenance window"
  value       = aws_db_instance.this.maintenance_window
}