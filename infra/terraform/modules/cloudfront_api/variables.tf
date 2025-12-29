variable "name" { type = string }
variable "aws_region" { type = string }
variable "apigw_api_id" { type = string }

# Optional WAF ACL ARN (CloudFront scope)
variable "web_acl_arn" {
  type    = string
  default = null
}

# Optional custom domains later (Route53 manual)
variable "aliases" {
  type    = list(string)
  default = []
}

variable "acm_cert_arn" {
  type    = string
  default = null
}
