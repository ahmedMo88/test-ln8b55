# AWS CloudFront Distribution Configuration
# Provider version: AWS ~> 5.0
# Purpose: CDN configuration for workflow automation platform

locals {
  common_tags = {
    Project     = "workflow-automation"
    Environment = var.environment
    ManagedBy   = "terraform"
    Service     = "cdn"
  }
}

# Random string for origin custom header verification
resource "random_string" "origin_verify" {
  length  = 32
  special = false
}

# ACM Certificate for CloudFront Distribution
resource "aws_acm_certificate" "cdn_cert" {
  provider          = aws.us-east-1  # CloudFront requires certificates in us-east-1
  domain_name       = var.domain_name
  validation_method = "DNS"

  subject_alternative_names = ["*.${var.domain_name}"]

  lifecycle {
    create_before_destroy = true
  }

  tags = local.common_tags
}

# CloudFront Origin Access Identity
resource "aws_cloudfront_origin_access_identity" "web_distribution" {
  comment = "OAI for ${var.environment} web distribution"
}

# CloudFront Response Headers Policy
resource "aws_cloudfront_response_headers_policy" "security_headers" {
  name = "${var.environment}-security-headers"

  security_headers_config {
    # HSTS Configuration
    strict_transport_security {
      override                   = true
      access_control_max_age_sec = 31536000
      include_subdomains        = true
      preload                   = true
    }

    # Content Security Policy
    content_security_policy {
      override                = true
      content_security_policy = join(";", [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://api.${var.domain_name}",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'"
      ])
    }

    # Additional Security Headers
    frame_options {
      override        = true
      frame_option    = "DENY"
    }

    content_type_options {
      override = true
    }

    referrer_policy {
      override        = true
      referrer_policy = "strict-origin-when-cross-origin"
    }

    xss_protection {
      override   = true
      protection = true
      mode_block = true
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      override = true
      value    = "camera=(), microphone=(), geolocation=(), payment=()"
    }
  }
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "web_distribution" {
  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  price_class         = "PriceClass_100"
  aliases             = [var.domain_name]
  web_acl_id          = aws_wafv2_web_acl.cloudfront_waf.id
  default_root_object = "index.html"
  
  # Origin Configuration
  origin {
    domain_name = aws_s3_bucket.workflow_files.bucket_regional_domain_name
    origin_id   = "S3-${aws_s3_bucket.workflow_files.id}"
    origin_path = "/content"

    # Origin Shield for improved cache hit ratio
    origin_shield {
      enabled              = true
      origin_shield_region = "us-east-1"
    }

    # Custom header for origin verification
    custom_header {
      name  = "X-Origin-Verify"
      value = random_string.origin_verify.result
    }

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.web_distribution.cloudfront_access_identity_path
    }
  }

  # Default Cache Behavior
  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${aws_s3_bucket.workflow_files.id}"
    compress         = true

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400

    # Cache and Origin Request Settings
    cache_policy_id          = aws_cloudfront_cache_policy.default.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.default.id
    
    # Security Headers
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security_headers.id

    # Function Associations
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.url_rewrite.arn
    }
  }

  # Custom Error Responses
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 300
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 300
  }

  # Logging Configuration
  logging_config {
    include_cookies = false
    bucket         = aws_s3_bucket.workflow_logs.bucket_domain_name
    prefix         = "cloudfront/"
  }

  # Geo Restrictions
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # SSL/TLS Configuration
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.cdn_cert.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  # WAF Integration
  web_acl_id = aws_wafv2_web_acl.cloudfront_waf.id

  tags = local.common_tags
}

# CloudFront Cache Policy
resource "aws_cloudfront_cache_policy" "default" {
  name        = "${var.environment}-default-cache-policy"
  min_ttl     = 0
  default_ttl = 3600
  max_ttl     = 86400

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "whitelist"
      headers {
        items = ["Origin", "Access-Control-Request-Headers", "Access-Control-Request-Method"]
      }
    }
    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

# CloudFront Origin Request Policy
resource "aws_cloudfront_origin_request_policy" "default" {
  name = "${var.environment}-default-origin-request-policy"

  cookies_config {
    cookie_behavior = "none"
  }
  headers_config {
    header_behavior = "whitelist"
    headers {
      items = ["Origin", "Access-Control-Request-Headers", "Access-Control-Request-Method"]
    }
  }
  query_strings_config {
    query_string_behavior = "none"
  }
}

# URL Rewrite Function
resource "aws_cloudfront_function" "url_rewrite" {
  name    = "${var.environment}-url-rewrite"
  runtime = "cloudfront-js-1.0"
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      
      // Handle SPA routing
      if (!uri.includes(".")) {
        request.uri = "/index.html";
      }
      
      return request;
    }
  EOT
}

# Outputs
output "cloudfront_distribution_id" {
  description = "The ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.web_distribution.id
}

output "cloudfront_domain_name" {
  description = "The domain name of the CloudFront distribution"
  value       = aws_cloudfront_distribution.web_distribution.domain_name
}