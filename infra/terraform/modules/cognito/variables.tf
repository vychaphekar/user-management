variable "name" {
  type = string
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "domain_prefix" {
  type = string
}

variable "mfa_configuration" {
  type    = string
  default = "ON"
}

variable "create_custom_tenant_attribute" {
  type    = bool
  default = true
}

variable "user_profiles_table_name" {
  type = string
}

variable "ui_callback_urls" {
  type    = list(string)
  default = ["https://app.evanyaconsulting.com/callback"]
}

variable "ui_logout_urls" {
  type    = list(string)
  default = ["https://app.evanyaconsulting.com/logout"]
}

variable "define_auth_challenge_lambda_arn" {
  type        = string
  description = "ARN for DefineAuthChallenge trigger lambda"
  default     = null
}

variable "create_auth_challenge_lambda_arn" {
  type        = string
  description = "ARN for CreateAuthChallenge trigger lambda"
  default     = null
}

variable "verify_auth_challenge_lambda_arn" {
  type        = string
  description = "ARN for VerifyAuthChallengeResponse trigger lambda"
  default     = null
}

