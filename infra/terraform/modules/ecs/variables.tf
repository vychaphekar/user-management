variable "name" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "aws_region" { type = string }
variable "ecr_image" { type = string }
variable "env_vars" { type = map(string) }
variable "apigw_vpc_link_security_group_id" { type = string }
variable "additional_profile_table_arns" {
  description = "Dedicated tenant profile tables whose role/version conditions this service may check."
  type        = list(string)
  default     = []
}
