output "tenant_table_name" { value = aws_dynamodb_table.tenant_registry.name }
output "profile_table_name" { value = aws_dynamodb_table.user_profiles.name }
output "invite_table_name" { value = aws_dynamodb_table.invites.name }
