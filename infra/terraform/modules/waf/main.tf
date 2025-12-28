resource "aws_wafv2_web_acl" "this" {
  name  = "${var.name}-web-acl"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  # REQUIRED
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name}-web-acl"
    sampled_requests_enabled   = true
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 10

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    # REQUIRED (per rule)
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name}-common"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 20

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    # REQUIRED (per rule)
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name}-bad-inputs"
      sampled_requests_enabled   = true
    }
  }
}

# IMPORTANT: Without this association, the Web ACL is NOT attached to API Gateway.
resource "aws_wafv2_web_acl_association" "apigw" {
  resource_arn = var.apigw_stage_arn
  web_acl_arn  = aws_wafv2_web_acl.this.arn
}
