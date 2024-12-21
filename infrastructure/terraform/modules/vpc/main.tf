# AWS VPC Module Configuration
# Version: Terraform ~> 1.0
# Provider Requirements
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# VPC Module Implementation using AWS VPC Module
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.1"

  # Basic VPC Configuration
  name = var.vpc_name
  cidr = var.vpc_cidr

  # Availability Zones Configuration
  azs = var.azs

  # Subnet Configuration
  private_subnets = var.private_subnets
  public_subnets  = var.public_subnets

  # NAT Gateway Configuration for High Availability
  enable_nat_gateway     = true
  single_nat_gateway     = false
  one_nat_gateway_per_az = true

  # DNS Configuration
  enable_dns_hostnames = true
  enable_dns_support   = true

  # VPN Configuration (disabled as per requirements)
  enable_vpn_gateway = false

  # Default Security Group Configuration
  manage_default_security_group = true
  default_security_group_tags = merge(var.tags, {
    Name = "${var.vpc_name}-default-sg"
  })

  # Subnet Tags for Kubernetes Integration
  private_subnet_tags = merge(var.tags, {
    "kubernetes.io/role/internal-elb" = "1"
    "Type"                           = "private"
  })

  public_subnet_tags = merge(var.tags, {
    "kubernetes.io/role/elb" = "1"
    "Type"                   = "public"
  })

  # VPC Flow Logs Configuration
  enable_flow_log                      = true
  create_flow_log_cloudwatch_log_group = true
  create_flow_log_cloudwatch_iam_role  = true
  flow_log_max_aggregation_interval    = 60

  # General Resource Tags
  tags = merge(var.tags, {
    "Name"        = var.vpc_name
    "Environment" = lookup(var.tags, "Environment", "production")
    "Terraform"   = "true"
  })
}

# Output Definitions
output "vpc_id" {
  description = "The ID of the VPC"
  value       = module.vpc.vpc_id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = module.vpc.private_subnets
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = module.vpc.public_subnets
}

output "nat_public_ips" {
  description = "List of public Elastic IPs created for AWS NAT Gateway"
  value       = module.vpc.nat_public_ips
}

output "vpc_cidr_block" {
  description = "The CIDR block of the VPC"
  value       = module.vpc.vpc_cidr_block
}

output "vpc_main_route_table_id" {
  description = "The ID of the main route table associated with this VPC"
  value       = module.vpc.vpc_main_route_table_id
}

output "private_route_table_ids" {
  description = "List of IDs of private route tables"
  value       = module.vpc.private_route_table_ids
}

output "public_route_table_ids" {
  description = "List of IDs of public route tables"
  value       = module.vpc.public_route_table_ids
}