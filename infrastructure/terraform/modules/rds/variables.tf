# Terraform AWS RDS Module Variables
# Version: ~> 1.6.0

# Core Instance Configuration
variable "name" {
  description = "Name prefix for RDS instance and related resources"
  type        = string
  default     = "workflow-automation"

  validation {
    condition     = length(var.name) <= 40
    error_message = "Name must be 40 characters or less"
  }
}

variable "environment" {
  description = "Environment name for resource tagging and naming"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

# Network Configuration
variable "vpc_id" {
  description = "ID of the VPC where RDS will be deployed"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs for RDS subnet group, must be in different AZs for HA"
  type        = list(string)

  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "At least two subnet IDs are required for HA deployment"
  }
}

# Instance Specifications
variable "instance_class" {
  description = "RDS instance type based on compute and memory requirements"
  type        = string
  default     = "db.t3.xlarge"

  validation {
    condition     = can(regex("^db\\.[a-z0-9]+\\.[a-z0-9]+$", var.instance_class))
    error_message = "Instance class must be a valid RDS instance type"
  }
}

# Storage Configuration
variable "allocated_storage" {
  description = "Initial storage allocation in GB, must be between 20 and max_allocated_storage"
  type        = number
  default     = 100

  validation {
    condition     = var.allocated_storage >= 20 && var.allocated_storage <= var.max_allocated_storage
    error_message = "Allocated storage must be between 20 and max_allocated_storage"
  }
}

variable "max_allocated_storage" {
  description = "Maximum storage limit for autoscaling in GB"
  type        = number
  default     = 500

  validation {
    condition     = var.max_allocated_storage >= var.allocated_storage
    error_message = "Max allocated storage must be greater than or equal to allocated storage"
  }
}

# Backup and Recovery Configuration
variable "backup_retention_period" {
  description = "Number of days to retain automated backups, 0-35 days"
  type        = number
  default     = 30

  validation {
    condition     = var.backup_retention_period >= 0 && var.backup_retention_period <= 35
    error_message = "Backup retention period must be between 0 and 35 days"
  }
}

# Monitoring and Performance
variable "performance_insights_enabled" {
  description = "Enable Performance Insights for enhanced monitoring and diagnostics"
  type        = bool
  default     = true
}

variable "monitoring_interval" {
  description = "Enhanced monitoring interval in seconds (0, 1, 5, 10, 15, 30, 60)"
  type        = number
  default     = 60

  validation {
    condition     = contains([0, 1, 5, 10, 15, 30, 60], var.monitoring_interval)
    error_message = "Monitoring interval must be one of: 0, 1, 5, 10, 15, 30, 60"
  }
}

# Security Configuration
variable "deletion_protection" {
  description = "Enable deletion protection to prevent accidental database deletion"
  type        = bool
  default     = true
}

variable "allowed_cidr_blocks" {
  description = "List of CIDR blocks allowed to access RDS instance"
  type        = list(string)
  sensitive   = true

  validation {
    condition     = alltrue([for cidr in var.allowed_cidr_blocks : can(cidrhost(cidr, 0))])
    error_message = "All elements must be valid CIDR blocks"
  }
}

# Resource Tagging
variable "tags" {
  description = "Additional tags for RDS resources"
  type        = map(string)
  default     = {}
}