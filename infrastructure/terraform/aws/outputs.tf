# AWS Infrastructure Outputs Configuration
# Version: Terraform ~> 1.0
# Provider: AWS ~> 5.0

# VPC Outputs
output "vpc_id" {
  description = "ID of the VPC with validation checks"
  value       = module.vpc.vpc_id

  # Ensure VPC ID is valid before output
  precondition {
    condition     = can(regex("^vpc-[a-z0-9]{8,}$", module.vpc.vpc_id))
    error_message = "VPC ID must be a valid AWS VPC identifier"
  }
}

output "private_subnet_ids" {
  description = "List of private subnet IDs with validation"
  value       = module.vpc.private_subnets

  # Validate private subnet IDs
  precondition {
    condition     = length(module.vpc.private_subnets) >= 2 && alltrue([
      for subnet in module.vpc.private_subnets : can(regex("^subnet-[a-z0-9]{8,}$", subnet))
    ])
    error_message = "At least 2 valid private subnet IDs are required for high availability"
  }
}

output "public_subnet_ids" {
  description = "List of public subnet IDs with validation"
  value       = module.vpc.public_subnets

  # Validate public subnet IDs
  precondition {
    condition     = length(module.vpc.public_subnets) >= 2 && alltrue([
      for subnet in module.vpc.public_subnets : can(regex("^subnet-[a-z0-9]{8,}$", subnet))
    ])
    error_message = "At least 2 valid public subnet IDs are required for high availability"
  }
}

# EKS Cluster Outputs
output "eks_cluster_name" {
  description = "Name of the EKS cluster with validation"
  value       = module.eks.cluster_name

  # Validate cluster name format
  precondition {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9-]*$", module.eks.cluster_name))
    error_message = "EKS cluster name must start with a letter and contain only alphanumeric characters and hyphens"
  }
}

output "eks_cluster_endpoint" {
  description = "Endpoint for the EKS cluster with validation"
  value       = module.eks.cluster_endpoint
  sensitive   = true

  # Validate cluster endpoint format
  precondition {
    condition     = can(regex("^https://[a-zA-Z0-9.-]+\\.eks\\.[a-z]{2}(-[a-z]+)?-[0-9]{1}\\.amazonaws\\.com$", module.eks.cluster_endpoint))
    error_message = "EKS cluster endpoint must be a valid AWS EKS endpoint URL"
  }
}

output "eks_cluster_security_group_id" {
  description = "Security group ID for the EKS cluster with validation"
  value       = module.eks.cluster_security_group_id
  sensitive   = true

  # Validate security group ID format
  precondition {
    condition     = can(regex("^sg-[a-z0-9]{8,}$", module.eks.cluster_security_group_id))
    error_message = "EKS cluster security group ID must be a valid AWS security group identifier"
  }
}

# Environment Information
output "environment" {
  description = "Deployment environment name with validation"
  value       = var.environment

  # Validate environment name
  precondition {
    condition     = contains(["production", "staging", "development"], var.environment)
    error_message = "Environment must be one of: production, staging, development"
  }
}

output "aws_region" {
  description = "AWS region where resources are deployed with validation"
  value       = var.aws_region

  # Validate AWS region format
  precondition {
    condition     = can(regex("^[a-z]{2}(-[a-z]+)?-[0-9]{1}$", var.aws_region))
    error_message = "AWS region must be a valid region identifier (e.g., us-west-2)"
  }
}

# Lifecycle block to prevent destruction of critical outputs
locals {
  prevent_destroy = terraform.workspace == "production" ? true : false
}

lifecycle {
  precondition {
    condition     = !local.prevent_destroy || terraform.workspace != "production"
    error_message = "Destruction of production infrastructure outputs is not allowed"
  }
}