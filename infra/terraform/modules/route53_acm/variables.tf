variable "zone_id" {
  type        = string
  description = "Route53 hosted zone id where validation records will be created"
}

variable "api_parent_domain" {
  type        = string
  description = "Example: api.dev.evanyaconsulting.com (or api.evanyaconsulting.com for prod)"
}
