# VPC ID output - essential for resource associations and network configurations
output "vpc_id" {
  description = "The ID of the created VPC for resource associations and network configurations"
  value       = module.vpc.vpc_id
}

# Private subnet IDs - used for secure resource deployment
output "private_subnets" {
  description = "List of private subnet IDs for secure resource deployment across availability zones"
  value       = module.vpc.private_subnets
}

# Public subnet IDs - used for internet-facing resources
output "public_subnets" {
  description = "List of public subnet IDs for internet-facing resources and load balancers"
  value       = module.vpc.public_subnets
}

# NAT Gateway public IPs - used for egress traffic routing
output "nat_public_ips" {
  description = "List of NAT Gateway public IPs for egress traffic routing and security configurations"
  value       = module.vpc.nat_public_ips
}

# VPC CIDR block - useful for network planning and security group rules
output "vpc_cidr_block" {
  description = "The CIDR block of the VPC for network planning and security configurations"
  value       = module.vpc.vpc_cidr_block
}

# Route table IDs - essential for custom routing configurations
output "vpc_main_route_table_id" {
  description = "The ID of the main route table associated with the VPC"
  value       = module.vpc.vpc_main_route_table_id
}

output "private_route_table_ids" {
  description = "List of IDs of private route tables for subnet associations and route management"
  value       = module.vpc.private_route_table_ids
}

output "public_route_table_ids" {
  description = "List of IDs of public route tables for subnet associations and route management"
  value       = module.vpc.public_route_table_ids
}

# Default security group ID - useful for basic network security configuration
output "default_security_group_id" {
  description = "The ID of the default security group associated with the VPC"
  value       = module.vpc.default_security_group_id
}

# VPC Flow Log configurations - important for network monitoring and security
output "vpc_flow_log_id" {
  description = "The ID of the VPC Flow Log"
  value       = module.vpc.vpc_flow_log_id
}

output "vpc_flow_log_destination_arn" {
  description = "The ARN of the CloudWatch Log Group destination for VPC Flow Logs"
  value       = module.vpc.vpc_flow_log_destination_arn
}