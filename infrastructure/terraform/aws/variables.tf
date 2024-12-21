# AWS Region Configuration
variable "aws_region" {
  description = "AWS region for infrastructure deployment. Must be a valid AWS region code."
  type        = string
  default     = "us-west-2"

  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-\\d{1}$", var.aws_region))
    error_message = "AWS region must be in format: us-west-2, eu-central-1, etc."
  }
}

# Environment Configuration
variable "environment" {
  description = "Deployment environment name (dev, staging, prod) with strict validation"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

# VPC Configuration
variable "vpc_cidr" {
  description = "CIDR block for VPC with proper network range validation"
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0)) && can(regex("^10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}/16$", var.vpc_cidr))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block in the 10.x.x.x/16 range"
  }
}

# EKS Cluster Configuration
variable "cluster_name" {
  description = "Name of the EKS cluster with naming convention validation"
  type        = string
  default     = "workflow-automation"

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.cluster_name)) && length(var.cluster_name) <= 40
    error_message = "Cluster name must consist of lowercase alphanumeric characters and hyphens, max length 40"
  }
}

variable "eks_version" {
  description = "Kubernetes version for EKS cluster with version constraint validation"
  type        = string
  default     = "1.28"

  validation {
    condition     = can(regex("^1\\.\\d{2}$", var.eks_version)) && tonumber(split(".", var.eks_version)[1]) >= 28
    error_message = "EKS version must be 1.28 or higher"
  }
}

variable "node_instance_types" {
  description = "List of EC2 instance types for EKS node groups"
  type        = list(string)
  default     = ["t3.large", "t3.xlarge"]

  validation {
    condition     = alltrue([for t in var.node_instance_types : can(regex("^[a-z][0-9][a-z]?\\.(nano|micro|small|medium|large|xlarge|2xlarge|4xlarge|8xlarge|12xlarge|16xlarge|24xlarge)$", t))])
    error_message = "Instance types must be valid AWS EC2 instance types"
  }
}

# Database Configuration
variable "db_instance_class" {
  description = "RDS instance class for PostgreSQL database"
  type        = string
  default     = "db.t3.large"

  validation {
    condition     = can(regex("^db\\.[a-z0-9]+\\.(micro|small|medium|large|xlarge|[2-9]?[0-9]?xlarge)$", var.db_instance_class))
    error_message = "DB instance class must be a valid RDS instance type"
  }
}

# Security Configuration
variable "allowed_cidr_blocks" {
  description = "List of CIDR blocks allowed to access the infrastructure"
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for cidr in var.allowed_cidr_blocks : can(cidrhost(cidr, 0))])
    error_message = "All CIDR blocks must be valid IPv4 CIDR notation"
  }
}

variable "enable_encryption" {
  description = "Enable encryption for sensitive data and EBS volumes"
  type        = bool
  default     = true
}

# Monitoring Configuration
variable "enable_monitoring" {
  description = "Enable CloudWatch monitoring and logging"
  type        = bool
  default     = true
}

# Backup Configuration
variable "backup_retention_days" {
  description = "Number of days to retain backups"
  type        = number
  default     = 30

  validation {
    condition     = var.backup_retention_days >= 7 && var.backup_retention_days <= 35
    error_message = "Backup retention must be between 7 and 35 days"
  }
}

# Tags Configuration
variable "tags" {
  description = "Common tags to be applied to all resources"
  type        = map(string)
  default = {
    ManagedBy = "terraform"
    Project   = "workflow-automation"
  }

  validation {
    condition     = length(var.tags) > 0
    error_message = "At least one tag must be specified"
  }
}

# High Availability Configuration
variable "multi_az" {
  description = "Enable Multi-AZ deployment for high availability"
  type        = bool
  default     = true
}

variable "availability_zones" {
  description = "List of availability zones to use for multi-AZ deployment"
  type        = list(string)
  default     = ["us-west-2a", "us-west-2b", "us-west-2c"]

  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "At least two availability zones must be specified for high availability"
  }
}