variable "name" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "nlb_listener_arn" { type = string }
variable "security_group_ids" {
  type        = list(string)
  description = "Security groups for the API Gateway VPC Link"
}
