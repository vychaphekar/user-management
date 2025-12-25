terraform {
  required_version = ">= 1.6.0"
}

provider "aws" {
  region = var.aws_region
}

module "network" {
  source   = "../../modules/network"
  name     = var.name
  vpc_cidr = var.vpc_cidr
}

module "dynamodb" {
  source = "../../modules/dynamodb"
  name   = var.name
}

# Create delegated zone in THIS nonprod account
module "delegated_zone" {
  source       = "../../modules/delegated_zone"
  subzone_name = var.subzone_name
}

# Issue cert inside delegated zone: api.dev.evanyaconsulting.com + *.api.dev...
module "route53_acm" {
  source            = "../../modules/route53_acm"
  zone_id           = module.delegated_zone.zone_id
  api_parent_domain = var.api_parent_domain
}

module "cognito" {
  source     = "../../modules/cognito"
  name       = var.name
  aws_region = var.aws_region

  domain_prefix                  = "${var.name}-shared"
  mfa_configuration              = "ON"
  create_custom_tenant_attribute = true
  user_profiles_table_name       = module.dynamodb.profile_table_name

  ui_callback_urls = var.ui_callback_urls
  ui_logout_urls   = var.ui_logout_urls
}

module "ecs" {
  source             = "../../modules/ecs"
  name               = var.name
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
  aws_region         = var.aws_region
  ecr_image          = var.ecr_image

  env_vars = {
    AWS_REGION               = var.aws_region
    TENANT_TABLE_NAME        = module.dynamodb.tenant_table_name
    PROFILE_TABLE_NAME       = module.dynamodb.profile_table_name
    DEFAULT_USER_POOL_ID     = module.cognito.user_pool_id
    DEFAULT_USER_POOL_ISSUER = module.cognito.issuer
    DEFAULT_APP_CLIENT_ID    = module.cognito.app_client_id
    PORT                     = "3000"
  }
}

module "apigw" {
  source             = "../../modules/apigw_http"
  name               = var.name
  private_subnet_ids = module.network.private_subnet_ids
  nlb_listener_arn   = module.ecs.nlb_listener_arn

  security_group_ids = [module.network.apigw_vpc_link_security_group_id]
}

locals {
  apigw_stage_arn = "arn:aws:apigateway:${var.aws_region}::/apis/${module.apigw.api_id}/stages/$default"
}

module "waf" {
  source          = "../../modules/waf"
  name            = var.name
  apigw_stage_arn = local.apigw_stage_arn
}

# Example tenant (optional) - uses delegated domain base
module "example_tenant_domain" {
  source            = "../../modules/tenant_domain"
  tenant_slug       = "example"
  api_parent_domain = var.api_parent_domain
  certificate_arn   = module.route53_acm.certificate_arn
  apigw_api_id      = module.apigw.api_id
  apigw_stage_name  = "$default"
  route53_zone_id   = module.delegated_zone.zone_id
}

module "example_tenant_registry" {
  source             = "../../modules/tenant_registry_item"
  tenant_table_name  = module.dynamodb.tenant_table_name
  tenant_slug        = "example"
  tenant_id          = "00000000-0000-0000-0000-000000000001"
  isolation_mode     = "LOGICAL"
  status             = "ACTIVE"
  profile_table_name = module.dynamodb.profile_table_name

  cognito_user_pool_id  = module.cognito.user_pool_id
  cognito_app_client_id = module.cognito.app_client_id
  cognito_issuer        = module.cognito.issuer
}
