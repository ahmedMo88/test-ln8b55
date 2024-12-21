# Terraform AWS EKS Module Variables
# Version compatibility: terraform >= 1.0.0

# Core cluster configuration
variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
  validation {
    condition     = length(var.cluster_name) > 0 && can(regex("^[a-zA-Z][a-zA-Z0-9-]*$", var.cluster_name))
    error_message = "Cluster name must start with a letter and contain only alphanumeric characters and hyphens"
  }
}

variable "cluster_version" {
  description = "Kubernetes version for the EKS cluster"
  type        = string
  default     = "1.28"
  validation {
    condition     = can(regex("^1\\.(2[7-8])$", var.cluster_version))
    error_message = "Cluster version must be 1.27 or 1.28"
  }
}

# Networking configuration
variable "vpc_id" {
  description = "ID of the VPC where EKS cluster will be deployed"
  type        = string
  validation {
    condition     = can(regex("^vpc-[a-z0-9]{8,}$", var.vpc_id))
    error_message = "VPC ID must be a valid AWS VPC identifier"
  }
}

variable "subnet_ids" {
  description = "List of subnet IDs for EKS node groups deployment across multiple availability zones"
  type        = list(string)
  validation {
    condition     = length(var.subnet_ids) >= 2 && can(regex("^subnet-[a-z0-9]{8,}$", var.subnet_ids[0]))
    error_message = "At least 2 valid subnet IDs are required for high availability"
  }
}

# Node groups configuration
variable "node_groups" {
  description = "Configuration for EKS managed node groups including scaling, instance types, and node configurations"
  type = map(object({
    min_size       = number
    max_size       = number
    desired_size   = number
    instance_types = list(string)
    capacity_type  = string
    disk_size      = number
    labels         = map(string)
    taints = list(object({
      key    = string
      value  = string
      effect = string
    }))
  }))

  default = {
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

  validation {
    condition     = alltrue([for k, v in var.node_groups : v.min_size <= v.desired_size && v.desired_size <= v.max_size])
    error_message = "For each node group, min_size must be <= desired_size <= max_size"
  }

  validation {
    condition     = alltrue([for k, v in var.node_groups : contains(["ON_DEMAND", "SPOT"], v.capacity_type)])
    error_message = "Node group capacity_type must be either ON_DEMAND or SPOT"
  }
}

# Cluster endpoint access configuration
variable "cluster_endpoint_private_access" {
  description = "Enable private API server endpoint access for enhanced security"
  type        = bool
  default     = true
}

variable "cluster_endpoint_public_access" {
  description = "Enable public API server endpoint access with security group restrictions"
  type        = bool
  default     = true
}

variable "cluster_endpoint_public_access_cidrs" {
  description = "List of CIDR blocks allowed to access the public API server endpoint"
  type        = list(string)
  default     = ["0.0.0.0/0"]
  validation {
    condition     = length(var.cluster_endpoint_public_access_cidrs) > 0
    error_message = "At least one CIDR block must be specified for public access"
  }
}

# Security configuration
variable "enable_irsa" {
  description = "Enable IAM roles for service accounts for fine-grained pod-level permissions"
  type        = bool
  default     = true
}

# Cluster add-ons configuration
variable "cluster_addons" {
  description = "Configuration for EKS cluster add-ons including version management and custom configurations"
  type = map(object({
    version              = optional(string)
    most_recent         = bool
    configuration_values = optional(string)
  }))

  default = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent = true
      configuration_values = "{\"env\": {\"ENABLE_PREFIX_DELEGATION\": \"true\"}}"
    }
  }

  validation {
    condition     = alltrue([for k, v in var.cluster_addons : contains(["coredns", "kube-proxy", "vpc-cni"], k)])
    error_message = "Only supported add-ons are: coredns, kube-proxy, vpc-cni"
  }
}

# Encryption configuration
variable "cluster_encryption_config" {
  description = "Configuration for EKS cluster encryption using KMS"
  type = object({
    enable      = bool
    kms_key_arn = optional(string)
  })
  default = {
    enable = true
  }
}