package terraform.cri

deny[msg] {
  not cw_log_group_exists
  msg := "CRI: CloudWatch log group for ECS must exist"
}

cw_log_group_exists {
  some i
  input.resource_changes[i].type == "aws_cloudwatch_log_group"
}
