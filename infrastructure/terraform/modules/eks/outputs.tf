# EKS Cluster Outputs
# Version: 1.0.0
# Compatible with:
# - terraform-aws-modules/eks/aws ~> 19.0
# - terraform >= 1.0.0

# Core cluster identifier output
output "cluster_id" {
  description = "The EKS cluster identifier"
  value       = module.eks.cluster_id
}

# Cluster endpoint for API server access
output "cluster_endpoint" {
  description = "The endpoint URL for the EKS cluster API server"
  value       = module.eks.cluster_endpoint
}

# Security group IDs for network access control
output "cluster_security_group_id" {
  description = "Security group ID attached to the EKS cluster control plane"
  value       = module.eks.cluster_security_group_id
}

output "node_security_group_id" {
  description = "Security group ID attached to the EKS worker nodes"
  value       = module.eks.node_security_group_id
}

# Additional cluster information outputs
output "cluster_version" {
  description = "The Kubernetes version of the EKS cluster"
  value       = module.eks.cluster_version
}

output "cluster_arn" {
  description = "The Amazon Resource Name (ARN) of the EKS cluster"
  value       = module.eks.cluster_arn
}

output "cluster_certificate_authority_data" {
  description = "Base64 encoded certificate data required to communicate with the cluster"
  value       = module.eks.cluster_certificate_authority_data
  sensitive   = true
}

# IAM outputs for cluster access
output "cluster_iam_role_arn" {
  description = "IAM role ARN of the EKS cluster"
  value       = module.eks.cluster_iam_role_arn
}

output "cluster_iam_role_name" {
  description = "IAM role name of the EKS cluster"
  value       = module.eks.cluster_iam_role_name
}

# OIDC provider outputs for IRSA
output "oidc_provider" {
  description = "The OpenID Connect identity provider (issuer URL without leading 'https://')"
  value       = module.eks.oidc_provider
}

output "oidc_provider_arn" {
  description = "The ARN of the OIDC Provider"
  value       = module.eks.oidc_provider_arn
}

# Node group outputs
output "eks_managed_node_groups" {
  description = "Map of attribute maps for all EKS managed node groups created"
  value       = module.eks.eks_managed_node_groups
}

output "eks_managed_node_groups_autoscaling_group_names" {
  description = "List of the autoscaling group names created by EKS managed node groups"
  value       = module.eks.eks_managed_node_groups_autoscaling_group_names
}

# CloudWatch logging outputs
output "cloudwatch_log_group_name" {
  description = "Name of cloudwatch log group created for EKS cluster logging"
  value       = aws_cloudwatch_log_group.eks.name
}

output "cloudwatch_log_group_arn" {
  description = "ARN of cloudwatch log group created for EKS cluster logging"
  value       = aws_cloudwatch_log_group.eks.arn
}

# KMS encryption outputs
output "kms_key_arn" {
  description = "The Amazon Resource Name (ARN) of the KMS key used for cluster encryption"
  value       = aws_kms_key.eks.arn
}

output "kms_key_id" {
  description = "The globally unique identifier for the KMS key used for cluster encryption"
  value       = aws_kms_key.eks.key_id
}