# AWS Route53 Configuration for Workflow Automation Platform
# Provider version: AWS ~> 5.0
# Purpose: DNS management and routing configuration

# Local variables for consistent tagging and naming
locals {
  common_tags = {
    Project     = "workflow-automation"
    Environment = var.environment
    ManagedBy   = "terraform"
    Component   = "dns"
    Service     = "workflow-automation"
  }
}

# Primary hosted zone for the domain
resource "aws_route53_zone" "primary" {
  name    = var.domain_name
  comment = "Primary hosted zone for ${var.environment} environment workflow automation platform"

  # Force destroy protection for production environments
  force_destroy = var.environment != "prod"

  # VPC associations if private hosted zone is needed
  dynamic "vpc" {
    for_each = var.environment == "prod" ? [] : [1]
    content {
      vpc_id = var.vpc_id
    }
  }

  tags = merge(local.common_tags, {
    Name = "${var.environment}-primary-zone"
  })
}

# A record for the main web application pointing to CloudFront
resource "aws_route53_record" "web_app" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.web_distribution.domain_name
    zone_id               = aws_cloudfront_distribution.web_distribution.hosted_zone_id
    evaluate_target_health = true
  }
}

# AAAA record for IPv6 support
resource "aws_route53_record" "web_app_ipv6" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.web_distribution.domain_name
    zone_id               = aws_cloudfront_distribution.web_distribution.hosted_zone_id
    evaluate_target_health = true
  }
}

# Health check for the web application
resource "aws_route53_health_check" "web_app" {
  fqdn              = var.domain_name
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  failure_threshold = "3"
  request_interval  = "30"

  regions = [
    "us-east-1",
    "us-west-2",
    "eu-west-1"
  ]

  enable_sni = true
  
  # Search string matching for health validation
  search_string = "healthy"
  
  tags = merge(local.common_tags, {
    Name = "${var.environment}-web-app-health-check"
  })
}

# DNS validation records for ACM certificate
resource "aws_route53_record" "acm_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cdn_cert.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = aws_route53_zone.primary.zone_id
}

# TXT record for domain verification
resource "aws_route53_record" "domain_verification" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = var.domain_name
  type    = "TXT"
  ttl     = 300
  records = ["v=spf1 include:_spf.google.com ~all"]
}

# MX records for email routing
resource "aws_route53_record" "mail" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = var.domain_name
  type    = "MX"
  ttl     = 300
  records = [
    "1 ASPMX.L.GOOGLE.COM",
    "5 ALT1.ASPMX.L.GOOGLE.COM",
    "5 ALT2.ASPMX.L.GOOGLE.COM",
    "10 ALT3.ASPMX.L.GOOGLE.COM",
    "10 ALT4.ASPMX.L.GOOGLE.COM"
  ]
}

# DMARC record for email security
resource "aws_route53_record" "dmarc" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "_dmarc.${var.domain_name}"
  type    = "TXT"
  ttl     = 300
  records = ["v=DMARC1; p=quarantine; rua=mailto:dmarc@${var.domain_name}"]
}

# Outputs for cross-stack references
output "route53_zone_id" {
  description = "ID of the Route53 hosted zone"
  value       = aws_route53_zone.primary.zone_id
}

output "route53_name_servers" {
  description = "List of name servers for the hosted zone"
  value       = aws_route53_zone.primary.name_servers
}

output "domain_validation_options" {
  description = "Domain validation options for ACM certificate"
  value       = aws_acm_certificate.cdn_cert.domain_validation_options
  sensitive   = true
}