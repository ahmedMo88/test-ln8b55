# AWS Provider configuration
# Version: ~> 5.0
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# KMS key for EKS cluster encryption
resource "aws_kms_key" "eks" {
  description             = "KMS key for EKS cluster encryption"
  deletion_window_in_days = 7
  enable_key_rotation    = true

  tags = {
    Name        = "${var.cluster_name}-eks-encryption-key"
    Environment = var.environment
  }
}

# EKS Cluster configuration using terraform-aws-modules/eks/aws
# Version: ~> 19.0
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"

  # Cluster configuration
  cluster_name    = var.cluster_name
  cluster_version = var.eks_version
  
  # Network configuration
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids

  # Cluster access configuration
  cluster_endpoint_private_access = true
  cluster_endpoint_public_access = true
  cluster_endpoint_public_access_cidrs = var.allowed_cidr_blocks

  # Security configuration
  enable_irsa = true
  cluster_encryption_config = {
    provider_key_arn = aws_kms_key.eks.arn
    resources        = ["secrets"]
  }

  # Cluster add-ons with automatic updates
  cluster_addons = {
    coredns = {
      most_recent = true
      configuration_values = jsonencode({
        computeType = "Fargate"
        nodeSelector = { "kubernetes.io/os" = "linux" }
      })
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent = true
      configuration_values = jsonencode({
        enableNetworkPolicy = "true"
      })
    }
    aws-load-balancer-controller = {
      most_recent = true
    }
    metrics-server = {
      most_recent = true
    }
    cluster-autoscaler = {
      most_recent = true
    }
  }

  # Managed node groups configuration
  eks_managed_node_groups = {
    # Critical workload node group
    critical = {
      min_size     = 2
      max_size     = 5
      desired_size = 3

      instance_types = ["t3.large"]
      capacity_type  = "ON_DEMAND"

      labels = {
        workload = "critical"
        Environment = var.environment
      }

      taints = {
        dedicated = {
          key    = "dedicated"
          value  = "critical"
          effect = "NO_SCHEDULE"
        }
      }

      block_device_mappings = {
        xvda = {
          device_name = "/dev/xvda"
          ebs = {
            volume_size = 100
            volume_type = "gp3"
            encrypted   = true
          }
        }
      }
    }

    # General purpose node group
    general = {
      min_size     = 2
      max_size     = 10
      desired_size = 3

      instance_types = ["t3.large"]
      capacity_type  = "ON_DEMAND"

      labels = {
        workload = "general"
        Environment = var.environment
      }

      block_device_mappings = {
        xvda = {
          device_name = "/dev/xvda"
          ebs = {
            volume_size = 100
            volume_type = "gp3"
            encrypted   = true
          }
        }
      }
    }

    # Spot instances node group for cost optimization
    spot = {
      min_size     = 1
      max_size     = 5
      desired_size = 2

      instance_types = ["t3.large", "t3a.large"]
      capacity_type  = "SPOT"

      labels = {
        workload = "batch"
        Environment = var.environment
      }

      block_device_mappings = {
        xvda = {
          device_name = "/dev/xvda"
          ebs = {
            volume_size = 100
            volume_type = "gp3"
            encrypted   = true
          }
        }
      }
    }
  }

  # Monitoring and logging configuration
  cloudwatch_log_group_retention_in_days = 90
  cluster_enabled_log_types = [
    "api",
    "audit",
    "authenticator",
    "controllerManager",
    "scheduler"
  ]

  # Tags
  tags = merge(var.tags, {
    "kubernetes.io/cluster/${var.cluster_name}" = "owned"
    "Environment" = var.environment
  })
}

# Output definitions for cluster access
output "cluster_id" {
  description = "The ID of the EKS cluster"
  value       = module.eks.cluster_id
}

output "cluster_endpoint" {
  description = "The endpoint URL of the EKS cluster"
  value       = module.eks.cluster_endpoint
}

output "cluster_security_group_id" {
  description = "Security group ID attached to the EKS cluster"
  value       = module.eks.cluster_security_group_id
}

output "node_security_group_id" {
  description = "Security group ID attached to the EKS nodes"
  value       = module.eks.node_security_group_id
}

# IRSA role for cluster autoscaler
module "cluster_autoscaler_irsa_role" {
  source = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"

  role_name                        = "cluster-autoscaler"
  attach_cluster_autoscaler_policy = true
  cluster_autoscaler_cluster_ids   = [module.eks.cluster_id]

  oidc_providers = {
    ex = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:cluster-autoscaler"]
    }
  }
}

# Security group rules for cluster communication
resource "aws_security_group_rule" "cluster_ingress" {
  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = var.allowed_cidr_blocks
  security_group_id = module.eks.cluster_security_group_id
  description       = "Allow inbound HTTPS traffic from allowed CIDRs"
}