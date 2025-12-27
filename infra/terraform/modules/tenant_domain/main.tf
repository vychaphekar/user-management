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

