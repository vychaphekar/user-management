terraform {
  required_version = ">= 1.6.0"
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region
}

# This stack assumes the shared environment is already deployed and you know:
# - apigw_api_id
# - certificate_arn
# - route53_zone_id
# - tenant_table_name
# - profile_table_name

module "tenant_domain" {
  source            = "../modules/tenant_domain"
  tenant_slug       = var.tenant_slug
  api_parent_domain = var.api_parent_domain
  certificate_arn   = var.certificate_arn
  apigw_api_id      = var.apigw_api_id
  apigw_stage_name  = "$default"
  route53_zone_id   = var.route53_zone_id
}

module "tenant_registry" {
  source             = "../modules/tenant_registry_item"
  tenant_table_name  = var.tenant_table_name
  tenant_slug        = var.tenant_slug
  tenant_id          = var.tenant_id
  isolation_mode     = var.isolation_mode
  status             = "ACTIVE"
  profile_table_name = var.profile_table_name

  cognito_user_pool_id  = var.cognito_user_pool_id
  cognito_issuer        = var.cognito_issuer
  cognito_app_client_id = var.cognito_app_client_id
}
