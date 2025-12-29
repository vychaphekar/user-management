resource "aws_wafv2_web_acl" "this" {
  name  = "${var.name}-cf-web-acl"
  scope = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # REQUIRED
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name}-cf-web-acl"
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

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesCommonRuleSet"
      sampled_requests_enabled   = true
    }
  }
}
