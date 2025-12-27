variable "tenant_slug" { type = string }
variable "api_parent_domain" { type = string } # api.evanyaconsulting.com
variable "certificate_arn" { type = string }
variable "apigw_api_id" { type = string }
variable "apigw_stage_name" {
  type    = string
  default = "$default"
}
