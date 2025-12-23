locals {
  tenant_domain = "${var.tenant_slug}.${var.api_parent_domain}"
}

resource "aws_apigatewayv2_domain_name" "tenant" {
  domain_name = local.tenant_domain
  domain_name_configuration {
    certificate_arn = var.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

resource "aws_apigatewayv2_api_mapping" "mapping" {
  api_id      = var.apigw_api_id
  domain_name = aws_apigatewayv2_domain_name.tenant.id
  stage       = var.apigw_stage_name
}

resource "aws_route53_record" "alias" {
  zone_id = var.route53_zone_id
  name    = local.tenant_domain
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.tenant.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.tenant.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}
