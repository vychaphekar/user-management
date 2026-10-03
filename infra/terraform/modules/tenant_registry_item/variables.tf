variable "tenant_table_name" { type = string }
variable "tenant_slug" { type = string }
variable "tenant_id" { type = string }
variable "ui_base_url" {
  description = "Exact HTTPS application origin for cookie CORS and invitation links. Unset tenants cannot use browser authentication."
  type        = string
  default     = null
  validation {
    condition     = var.ui_base_url == null ? true : can(regex("^https://[A-Za-z0-9.-]+(:[0-9]+)?$", var.ui_base_url))
    error_message = "Use an HTTPS origin without a path, query, fragment, or trailing slash."
  }
}
variable "isolation_mode" {
  type    = string
  default = "LOGICAL"
}

variable "status" {
  type    = string
  default = "ACTIVE"
}

variable "profile_table_name" { type = string }
# optional dedicated pool overrides

variable "cognito_user_pool_id" {
  type    = string
  default = ""
}

variable "cognito_issuer" {
  type    = string
  default = ""
}

variable "cognito_app_client_id" {
  type    = string
  default = ""
}
