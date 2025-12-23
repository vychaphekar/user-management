variable "tenant_table_name" { type = string }
variable "tenant_slug" { type = string }
variable "tenant_id" { type = string }
variable "isolation_mode" { 
    type = string 
    default = "LOGICAL" 
}

variable "status" { 
    type = string 
    default = "ACTIVE" 
}

variable "profile_table_name" { type = string }
# optional dedicated pool overrides

variable "cognito_user_pool_id" { 
    type = string 
    default = "" 
}

variable "cognito_issuer" { 
    type = string 
    default = "" 
}

variable "cognito_app_client_id" { 
    type = string 
    default = "" 
}
