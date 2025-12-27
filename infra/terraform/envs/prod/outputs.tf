output "api_parent_domain" {
  value = var.api_parent_domain
}

# --- Values needed by .github/workflows/provision-tenant.yml ---
output "apigw_api_id" {
  value = module.apigw.api_id
}

output "certificate_arn" {
  value = var.certificate_arn
}

output "tenant_table_name" {
  value = module.dynamodb.tenant_table_name
}

output "profile_table_name" {
  value = module.dynamodb.profile_table_name
}

# --- Helpful identity outputs (optional) ---
output "cognito_user_pool_id" {
  value = module.cognito.user_pool_id
}

output "cognito_app_client_id" {
  value = module.cognito.app_client_id
}

output "cognito_issuer" {
  value = module.cognito.issuer
}
