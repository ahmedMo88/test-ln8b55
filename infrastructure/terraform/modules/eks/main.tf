# AWS EKS Cluster Module Configuration
# Version: 1.0.0
# Provider versions:
# - hashicorp/aws ~> 5.0
# - terraform-aws-modules/eks/aws ~> 19.0

terraform {
  required_version = ">= 1.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Current AWS region data source
data "aws_region" "current" {}

# KMS key for EKS cluster encryption
resource "aws_kms_key" "eks" {
  description             = "KMS key for EKS cluster encryption"
  deletion_window_in_days = 7
  enable_key_rotation    = true

  tags = {
    Name        = "${var.cluster_name}-eks-encryption-key"
    Environment = "production"
    ManagedBy   = "terraform"
  }
}

resource "aws_kms_alias" "eks" {
  name          = "alias/${var.cluster_name}-eks-encryption-key"
  target_key_id = aws_kms_key.eks.key_id
}

# EKS Cluster Module
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"

  # Cluster Configuration
  cluster_name    = var.cluster_name
  cluster_version = "1.28"
  vpc_id          = var.vpc_id
  subnet_ids      = var.subnet_ids

  # Cluster Access Configuration
  cluster_endpoint_private_access = true
  cluster_endpoint_public_access  = true
  cluster_endpoint_public_access_cidrs = var.cluster_endpoint_public_access_cidrs

  # Enable IRSA for pod-level IAM roles
  enable_irsa = true

  # Cluster Encryption Configuration
  cluster_encryption_config = {
    provider_key_arn = aws_kms_key.eks.arn
    resources        = ["secrets"]
  }

  # Cluster Add-ons with latest versions
  cluster_addons = {
    coredns = {
      most_recent = true
      configuration_values = jsonencode({
        computeType = "Fargate"
        nodeSelector = {
          "kubernetes.io/os" = "linux"
        }
      })
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent = true
      configuration_values = jsonencode({
        env = {
          ENABLE_PREFIX_DELEGATION = "true"
          WARM_PREFIX_TARGET      = "1"
        }
      })
    }
    aws-ebs-csi-driver = {
      most_recent = true
    }
  }

  # Managed Node Groups Configuration
  eks_managed_node_groups = {
    general = {
      min_size     = 2
      max_size     = 10
      desired_size = 3

      instance_types = ["t3.large", "t3a.large"]
      capacity_type  = "SPOT"

      labels = {
        role = "general"
        Environment = "production"
      }

      taints = []

      update_config = {
        max_unavailable_percentage = 33
      }

      # Enhanced node security
      block_device_mappings = {
        xvda = {
          device_name = "/dev/xvda"
          ebs = {
            volume_size           = 100
            volume_type          = "gp3"
            iops                 = 3000
            encrypted           = true
            kms_key_id          = aws_kms_key.eks.arn
            delete_on_termination = true
          }
        }
      }
    }
  }

  # Node Security Group Rules
  node_security_group_additional_rules = {
    ingress_self_all = {
      description = "Node to node all ports/protocols"
      protocol    = "-1"
      from_port   = 0
      to_port     = 0
      type        = "ingress"
      self        = true
    }
    egress_all = {
      description      = "Node all egress"
      protocol         = "-1"
      from_port        = 0
      to_port          = 0
      type            = "egress"
      cidr_blocks      = ["0.0.0.0/0"]
      ipv6_cidr_blocks = ["::/0"]
    }
  }

  # Cluster Security Group Rules
  cluster_security_group_additional_rules = {
    egress_nodes_ephemeral_ports_tcp = {
      description                = "To node 1025-65535"
      protocol                  = "tcp"
      from_port                = 1025
      to_port                  = 65535
      type                     = "egress"
      source_node_security_group = true
    }
  }

  # Tags for all resources
  tags = {
    Environment = "production"
    ManagedBy   = "terraform"
    Owner       = "platform-team"
    Project     = var.cluster_name
  }
}

# CloudWatch Log Group for EKS Control Plane Logging
resource "aws_cloudwatch_log_group" "eks" {
  name              = "/aws/eks/${var.cluster_name}/cluster"
  retention_in_days = 90

  tags = {
    Name        = "${var.cluster_name}-eks-logs"
    Environment = "production"
    ManagedBy   = "terraform"
  }
}

# IAM Role for EKS CloudWatch Metrics
resource "aws_iam_role" "cloudwatch_metrics" {
  name = "${var.cluster_name}-eks-cloudwatch-metrics"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "eks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.cluster_name}-eks-cloudwatch-metrics-role"
    Environment = "production"
    ManagedBy   = "terraform"
  }
}

# IAM Policy for CloudWatch Metrics
resource "aws_iam_role_policy" "cloudwatch_metrics" {
  name = "${var.cluster_name}-eks-cloudwatch-metrics"
  role = aws_iam_role.cloudwatch_metrics.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "cloudwatch:PutMetricData"
        ]
        Effect   = "Allow"
        Resource = "*"
      }
    ]
  })
}