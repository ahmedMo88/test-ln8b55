# Main Terraform Configuration for Workflow Automation Platform
# Version: 1.6.0
# Provider Requirements: AWS ~> 5.0, Random ~> 3.5

terraform {
  required_version = ">= 1.6.0"

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

  # Enhanced S3 Backend Configuration with DR and Security
  backend "s3" {
    bucket = "workflow-automation-terraform-state"
    key    = "terraform.tfstate"
    region = "us-west-2"
    
    # Security Features
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
    kms_key_id     = "arn:aws:kms:us-west-2:ACCOUNT_ID:key/KEY_ID"
    
    # State File Versioning and Replication
    versioning = true
    replication_configuration {
      role = "arn:aws:iam::ACCOUNT_ID:role/terraform-state-replication"
      rules {
        status = "Enabled"
        destination {
          bucket = "workflow-automation-terraform-state-dr"
          region = "us-east-1"
        }
      }
    }
  }
}

# AWS Provider Configuration with Enhanced Security Tags
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(var.compliance_tags, {
      Project            = "workflow-automation"
      Environment        = var.environment
      ManagedBy         = "terraform"
      SecurityLevel     = "high"
      ComplianceScope   = "SOC2-HIPAA"
      DataClassification = "sensitive"
    })
  }
}

# Random Provider for Resource Naming
provider "random" {}

# Data Source for Available Availability Zones with Enhanced Filtering
data "aws_availability_zones" "available" {
  state = "available"

  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

# VPC Module for Enhanced Network Infrastructure
module "vpc" {
  source = "../modules/vpc"

  vpc_name = "workflow-automation-${var.environment}"
  vpc_cidr = "10.0.0.0/16"
  azs      = slice(data.aws_availability_zones.available.names, 0, 3)

  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  tags = merge(var.compliance_tags, {
    Environment = var.environment
    NetworkTier = "secure"
  })
}

# EKS Module for Container Orchestration
module "eks" {
  source = "../modules/eks"

  cluster_name    = "workflow-automation-${var.environment}"
  cluster_version = "1.28"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnet_ids

  # Enhanced Security Configuration
  cluster_endpoint_private_access = true
  cluster_endpoint_public_access = true
  cluster_endpoint_public_access_cidrs = ["0.0.0.0/0"] # Should be restricted in production

  # Node Groups Configuration
  node_groups = {
    general = {
      min_size       = 2
      max_size       = 10
      desired_size   = 3
      instance_types = ["t3.large"]
      capacity_type  = "ON_DEMAND"
      disk_size      = 100
      labels = {
        role = "general"
      }
      taints = []
    }
    spot = {
      min_size       = 1
      max_size       = 5
      desired_size   = 2
      instance_types = ["t3.large", "t3a.large"]
      capacity_type  = "SPOT"
      disk_size      = 100
      labels = {
        role = "spot"
      }
      taints = []
    }
  }

  # Enable IRSA for Pod-level IAM roles
  enable_irsa = true

  # Cluster Add-ons Configuration
  cluster_addons = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent = true
      configuration_values = jsonencode({
        env = {
          ENABLE_PREFIX_DELEGATION = "true"
        }
      })
    }
  }

  # Encryption Configuration
  cluster_encryption_config = {
    enable = true
  }
}

# Output Definitions
output "project_name" {
  description = "The name of the project"
  value       = "workflow-automation"
}

output "environment" {
  description = "The deployment environment"
  value       = var.environment
}

output "security_group_ids" {
  description = "Security group IDs for the infrastructure"
  value = {
    vpc     = module.vpc.security_group_ids
    cluster = module.eks.cluster_security_group_ids
  }
  sensitive = true
}