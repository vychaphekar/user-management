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

module "cognito" {
  source     = "../../modules/cognito"
  name       = var.name
  aws_region = var.aws_region

  domain_prefix     = "${var.name}-shared"
  mfa_configuration = "OFF"

  create_custom_tenant_attribute = true
  user_profiles_table_name       = module.dynamodb.profile_table_name

  ui_callback_urls = var.ui_callback_urls
  ui_logout_urls   = var.ui_logout_urls
}

module "ecs" {
  source                           = "../../modules/ecs"
  name                             = var.name
  vpc_id                           = module.network.vpc_id
  private_subnet_ids               = module.network.private_subnet_ids
  aws_region                       = var.aws_region
  ecr_image                        = var.ecr_image
  apigw_vpc_link_security_group_id = module.network.apigw_vpc_link_security_group_id

  env_vars = {
    AWS_REGION         = var.aws_region
    TENANT_TABLE_NAME  = module.dynamodb.tenant_table_name
    PROFILE_TABLE_NAME = module.dynamodb.profile_table_name

    INVITE_TABLE_NAME = module.dynamodb.invite_table_name
    INVITE_JWT_SECRET = var.invite_jwt_secret
    INVITE_TTL_HOURS  = tostring(var.invite_ttl_hours)
    SES_FROM_EMAIL    = var.ses_from_email

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

module "waf_cf" {
  source = "../../modules/waf_cloudfront"
  name   = var.name
}

module "cloudfront_api" {
  source       = "../../modules/cloudfront_api"
  name         = var.name
  aws_region   = var.aws_region
  apigw_api_id = module.apigw.api_id
  web_acl_arn  = module.waf_cf.web_acl_arn
}

# Example tenant (optional) - uses delegated domain base
module "example_tenant_domain" {
  source            = "../../modules/tenant_domain"
  tenant_slug       = "example"
  api_parent_domain = var.api_parent_domain
  certificate_arn   = var.certificate_arn
  apigw_api_id      = module.apigw.api_id
  apigw_stage_name  = "$default"
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
