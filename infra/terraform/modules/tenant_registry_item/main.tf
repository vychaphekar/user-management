resource "aws_dynamodb_table_item" "tenant" {
  table_name = var.tenant_table_name
  hash_key   = "pk"

  item = jsonencode({
    pk = { S = "TENANT#${var.tenant_slug}" }
    tenantId = { S = var.tenant_id }
    tenantSlug = { S = var.tenant_slug }
    status = { S = var.status }
    isolationMode = { S = var.isolation_mode }
    profileTableName = { S = var.profile_table_name }
    cognitoUserPoolId = { S = var.cognito_user_pool_id }
    cognitoIssuer = { S = var.cognito_issuer }
    cognitoAppClientId = { S = var.cognito_app_client_id }
  })
}
