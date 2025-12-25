variable "name" {
  type = string
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "ecr_image" {
  type = string
}

# DNS config
variable "root_zone_name" {
  type        = string
  default     = "evanyaconsulting.com"
  description = "Root public zone name (prod/shared account owns this zone)"
}

variable "subzone_name" {
  type        = string
  description = "Nonprod: dev.evanyaconsulting.com / qa... / innovation...  Prod: evanyaconsulting.com"
}

variable "api_parent_domain" {
  type        = string
  description = "Prod: api.evanyaconsulting.com  Nonprod: api.dev.evanyaconsulting.com"
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR for the VPC (e.g. 10.10.0.0/16)"
}

variable "ui_callback_urls" {
  type        = list(string)
  description = "Cognito app client callback URLs"
}

variable "ui_logout_urls" {
  type        = list(string)
  description = "Cognito app client logout URLs"
}

