variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "root_zone_name" {
  type    = string
  default = "fostercareca.com"
}

variable "subzone_name" {
  type        = string
  description = "e.g. dev.fostercareca.com OR api.fostercareca.com"
}

variable "subzone_name_servers" {
  type        = list(string)
  description = "NS servers from the delegated zone outputs"
}
