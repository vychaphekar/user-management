variable "zone_id" {
  type        = string
  description = "Route53 hosted zone id where validation records will be created"
}

variable "api_parent_domain" {
  type        = string
  description = "Example: api.dev.evanyaconsulting.com (or api.evanyaconsulting.com for prod)"
}

variable "manage_route53_validation" {
  type        = bool
  description = "Whether to create ACM DNS validation records in Route53"
  default     = true
}
