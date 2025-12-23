package terraform.cri

deny[msg] {
  rc := input.resource_changes[_]
  rc.type == "aws_dynamodb_table"
  not rc.change.after.server_side_encryption.enabled
  msg := sprintf("CRI: DynamoDB table %v must have SSE enabled", [rc.name])
}
