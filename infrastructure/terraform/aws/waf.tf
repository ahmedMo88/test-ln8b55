# AWS Provider version: ~> 5.0
# Purpose: WAF configuration for workflow automation platform edge security

locals {
  common_tags = {
    Project       = "workflow-automation"
    Environment   = var.environment
    ManagedBy     = "terraform"
    SecurityLevel = "high"
    Component     = "waf"
  }
}

# KMS key for WAF log encryption
resource "aws_kms_key" "waf_logs" {
  description             = "KMS key for WAF logs encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  
  tags = local.common_tags
}

resource "aws_kms_alias" "waf_logs" {
  name          = "alias/waf-logs-${var.environment}"
  target_key_id = aws_kms_key.waf_logs.key_id
}

# WAF Web ACL for CloudFront
resource "aws_wafv2_web_acl" "cloudfront_waf" {
  name        = "workflow-automation-${var.environment}"
  description = "WAF rules for workflow automation platform with rate limiting and managed rules"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # Rate limiting rule
  rule {
    name     = "RateLimit"
    priority = 1

    override_action {
      none {}
    }

    statement {
      rate_based_statement {
        limit              = var.waf_rate_limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "RateLimitRule"
      sampled_requests_enabled  = true
    }
  }

  # AWS Managed Rules - Common Rule Set
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "AWSManagedRulesCommonRuleSetMetric"
      sampled_requests_enabled  = true
    }
  }

  # AWS Managed Rules - Known Bad Inputs
  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "AWSManagedRulesKnownBadInputsRuleSetMetric"
      sampled_requests_enabled  = true
    }
  }

  # SQL Injection Prevention
  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 4

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "AWSManagedRulesSQLiRuleSetMetric"
      sampled_requests_enabled  = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name               = "WorkflowAutomationWAF"
    sampled_requests_enabled  = true
  }

  tags = local.common_tags
}

# CloudWatch Log Group for WAF Logs
resource "aws_cloudwatch_log_group" "waf_log_group" {
  name              = "/aws/waf/workflow-automation-${var.environment}"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.waf_logs.arn
  
  tags = local.common_tags
}

# WAF Logging Configuration
resource "aws_wafv2_web_acl_logging_configuration" "cloudfront_waf_logging" {
  log_destination_configs = [aws_cloudwatch_log_group.waf_log_group.arn]
  resource_arn           = aws_wafv2_web_acl.cloudfront_waf.arn

  redacted_fields {
    single_header {
      name = "authorization"
    }
  }

  redacted_fields {
    single_header {
      name = "cookie"
    }
  }
}

# Outputs for cross-stack references
output "web_acl_id" {
  description = "ID of the WAF Web ACL for CloudFront association"
  value       = aws_wafv2_web_acl.cloudfront_waf.id
}

output "web_acl_arn" {
  description = "ARN of the WAF Web ACL for logging configuration"
  value       = aws_wafv2_web_acl.cloudfront_waf.arn
}