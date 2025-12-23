package terraform.cri

deny[msg] {
  rc := input.resource_changes[_]
  rc.type == "aws_iam_role_policy"
  contains(rc.change.after.policy, "\"Action\":\"*\"")
  msg := "CRI: IAM policies must not include wildcard Action:\"*\""
}
