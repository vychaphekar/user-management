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

variable "certificate_arn" {
  type        = string
  description = "ACM certificate ARN for api_parent_domain (and optionally wildcard). Must be in same region as API Gateway custom domain."
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

variable "ses_from_email" {
  type = string
}

variable "invite_ttl_hours" {
  type    = number
  default = 48
}

variable "invite_jwt_secret" {
  type      = string
  sensitive = true
}

