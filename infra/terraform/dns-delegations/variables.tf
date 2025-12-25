variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "root_zone_name" {
  type    = string
  default = "evanyaconsulting.com"
}

variable "subzone_name" {
  type        = string
  description = "e.g. dev.evanyaconsulting.com OR api.evanyaconsulting.com"
}

variable "subzone_name_servers" {
  type        = list(string)
  description = "NS servers from the delegated zone outputs"
}
