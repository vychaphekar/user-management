# --- Delegated zone (used for DNS delegation from shared DNS account) ---
output "delegated_zone_name" {
  value = var.subzone_name
}

output "delegated_zone_id" {
  value = module.delegated_zone.zone_id
}

output "delegated_zone_name_servers" {
  value = module.delegated_zone.name_servers
}

# --- API parent domain for this env (used for tenant domains) ---
output "api_parent_domain" {
  value = var.api_parent_domain
}

# --- Values needed by .github/workflows/provision-tenant.yml ---
output "apigw_api_id" {
  value = module.apigw.api_id
}

output "certificate_arn" {
  value = module.route53_acm.certificate_arn
}

output "route53_zone_id" {
  value = module.delegated_zone.zone_id
}

output "tenant_table_name" {
  value = module.dynamodb.tenant_table_name
}

output "profile_table_name" {
  value = module.dynamodb.profile_table_name
}

# --- Helpful identity outputs (optional but useful) ---
output "cognito_user_pool_id" {
  value = module.cognito.user_pool_id
}

output "cognito_app_client_id" {
  value = module.cognito.app_client_id
}

output "cognito_issuer" {
  value = module.cognito.issuer
}
