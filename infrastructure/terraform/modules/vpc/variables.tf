# VPC Module Variables
# Version: Terraform ~> 1.0

# Name of the VPC - must be unique within the AWS account and region
variable "vpc_name" {
  description = "Name of the VPC - must be unique within the AWS account and region"
  type        = string

  validation {
    condition     = length(var.vpc_name) > 0 && length(var.vpc_name) <= 255
    error_message = "VPC name must be between 1 and 255 characters"
  }
}

# CIDR block for the VPC - must be /16 to /28 as per AWS requirements
variable "vpc_cidr" {
  description = "CIDR block for the VPC - must be /16 to /28 as per AWS requirements"
  type        = string

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0)) && tonumber(split("/", var.vpc_cidr)[1]) >= 16 && tonumber(split("/", var.vpc_cidr)[1]) <= 28
    error_message = "VPC CIDR must be a valid IPv4 CIDR block between /16 and /28"
  }
}

# List of availability zones for VPC subnets - minimum of 2 AZs required for high availability
variable "azs" {
  description = "List of availability zones for VPC subnets - minimum of 2 AZs required for high availability"
  type        = list(string)

  validation {
    condition     = length(var.azs) >= 2
    error_message = "At least 2 availability zones must be specified for high availability"
  }
}

# List of private subnet CIDR blocks - must be within VPC CIDR and not overlap
variable "private_subnets" {
  description = "List of private subnet CIDR blocks - must be within VPC CIDR and not overlap"
  type        = list(string)

  validation {
    condition     = length(var.private_subnets) >= length(var.azs)
    error_message = "Number of private subnets must match or exceed number of availability zones"
  }
}

# List of public subnet CIDR blocks - must be within VPC CIDR and not overlap with private subnets
variable "public_subnets" {
  description = "List of public subnet CIDR blocks - must be within VPC CIDR and not overlap with private subnets"
  type        = list(string)

  validation {
    condition     = length(var.public_subnets) >= length(var.azs)
    error_message = "Number of public subnets must match or exceed number of availability zones"
  }
}

# Tags to be applied to all VPC resources for resource management and cost allocation
variable "tags" {
  description = "Tags to be applied to all VPC resources for resource management and cost allocation"
  type        = map(string)
  default     = {}

  validation {
    condition     = can(var.tags)
    error_message = "Tags must be a valid map of string key-value pairs"
  }
}