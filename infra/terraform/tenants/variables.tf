variable "aws_region" {
  type    = string
  default = "us-east-1"
}
variable "tenant_slug" { type = string }
variable "tenant_id" { type = string }
variable "isolation_mode" {
  type    = string
  default = "LOGICAL"
}

variable "api_parent_domain" {
  type    = string
  default = "api.evanyaconsulting.com"
}
variable "certificate_arn" { type = string }
variable "apigw_api_id" { type = string }
variable "route53_zone_id" { type = string }

variable "tenant_table_name" { type = string }
variable "profile_table_name" { type = string }

# Optional dedicated pool overrides (only if isolation_mode includes dedicated pool)
variable "cognito_user_pool_id" {
  type    = string
  default = ""
}
variable "cognito_issuer" {
  type    = string
  default = ""
}
variable "cognito_app_client_id" {
  type    = string
  default = ""
}
