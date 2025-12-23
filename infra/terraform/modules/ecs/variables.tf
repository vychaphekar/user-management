variable "name" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "aws_region" { type = string }
variable "ecr_image" { type = string }
variable "env_vars" { type = map(string) }
