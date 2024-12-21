# AWS ElastiCache Redis Configuration for Workflow Automation Platform
# Provider version: hashicorp/aws ~> 5.0

# Security group for Redis cluster
resource "aws_security_group" "redis_security_group" {
  name        = "${var.environment}-redis-security-group"
  description = "Security group for Redis cluster"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "Redis from VPC"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.environment}-redis-security-group"
    Environment = var.environment
    Project     = "workflow-automation"
    Terraform   = "true"
    Service     = "cache"
  }
}

# Redis subnet group
resource "aws_elasticache_subnet_group" "redis_subnet_group" {
  name        = "${var.environment}-redis-subnet-group"
  subnet_ids  = module.vpc.private_subnets
  description = "Private subnet group for Redis cluster with enhanced security"

  tags = {
    Name        = "${var.environment}-redis-subnet-group"
    Environment = var.environment
    Project     = "workflow-automation"
    Terraform   = "true"
    Service     = "cache"
  }
}

# Redis parameter group with optimized settings
resource "aws_elasticache_parameter_group" "redis_params" {
  family      = "redis7.x"
  name        = "${var.environment}-redis-params"
  description = "Optimized Redis parameters for workflow automation"

  # Memory management
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  # Event notification for cache operations
  parameter {
    name  = "notify-keyspace-events"
    value = "Ex"
  }

  # Connection management
  parameter {
    name  = "timeout"
    value = "300"
  }

  parameter {
    name  = "tcp-keepalive"
    value = "300"
  }

  # Performance optimization
  parameter {
    name  = "maxmemory-samples"
    value = "10"
  }

  parameter {
    name  = "activedefrag"
    value = "yes"
  }

  parameter {
    name  = "lazyfree-lazy-eviction"
    value = "yes"
  }

  tags = {
    Environment = var.environment
    Project     = "workflow-automation"
    Terraform   = "true"
    Service     = "cache"
  }
}

# Redis replication group (cluster)
resource "aws_elasticache_replication_group" "redis_cluster" {
  replication_group_id          = "${var.environment}-redis-cluster"
  description                   = "High-availability Redis cluster for workflow automation"
  node_type                     = "cache.t4g.medium"
  port                         = 6379
  parameter_group_name         = aws_elasticache_parameter_group.redis_params.name
  subnet_group_name            = aws_elasticache_subnet_group.redis_subnet_group.name
  security_group_ids           = [aws_security_group.redis_security_group.id]
  
  # High availability configuration
  automatic_failover_enabled   = true
  multi_az_enabled            = true
  num_cache_clusters          = 2
  
  # Engine configuration
  engine                      = "redis"
  engine_version             = "7.2"
  
  # Security configuration
  at_rest_encryption_enabled  = true
  transit_encryption_enabled  = true
  auth_token_enabled         = true
  
  # Maintenance and backup
  maintenance_window         = "sun:05:00-sun:09:00"
  snapshot_window           = "03:00-05:00"
  snapshot_retention_limit  = 7
  auto_minor_version_upgrade = true
  apply_immediately         = false

  tags = {
    Name             = "${var.environment}-redis-cluster"
    Environment      = var.environment
    Project          = "workflow-automation"
    Terraform        = "true"
    Service          = "cache"
    Encryption       = "true"
    HighAvailability = "true"
  }
}

# Outputs for other modules to consume
output "redis_endpoint" {
  description = "Primary endpoint for Redis cluster"
  value       = aws_elasticache_replication_group.redis_cluster.primary_endpoint_address
}

output "redis_port" {
  description = "Redis port number"
  value       = aws_elasticache_replication_group.redis_cluster.port
}

output "redis_connection_info" {
  description = "Redis connection information including reader and configuration endpoints"
  value = {
    reader_endpoint        = aws_elasticache_replication_group.redis_cluster.reader_endpoint_address
    configuration_endpoint = aws_elasticache_replication_group.redis_cluster.configuration_endpoint_address
  }
  sensitive = true
}