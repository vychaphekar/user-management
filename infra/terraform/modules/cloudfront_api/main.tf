locals {
  origin_domain = "${var.apigw_api_id}.execute-api.${var.aws_region}.amazonaws.com"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  comment             = "${var.name} HTTP API"
  default_root_object = ""

  origin {
    domain_name = local.origin_domain
    origin_id   = "apigw-http-api"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "apigw-http-api"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods  = ["GET", "HEAD", "OPTIONS"]

    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id

    compress = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # If you don't pass aliases/cert yet, CloudFront uses its default domain + cert.
  aliases = var.aliases

  dynamic "viewer_certificate" {
    for_each = length(var.aliases) > 0 ? [1] : []
    content {
      acm_certificate_arn      = var.acm_cert_arn
      ssl_support_method       = "sni-only"
      minimum_protocol_version = "TLSv1.2_2021"
    }
  }

  dynamic "viewer_certificate" {
    for_each = length(var.aliases) == 0 ? [1] : []
    content {
      cloudfront_default_certificate = true
    }
  }

  # Attach WAF (CLOUDFRONT scope)
  web_acl_id = var.web_acl_arn
}
