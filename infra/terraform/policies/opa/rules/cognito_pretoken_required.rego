package terraform.cri

deny[msg] {
  rc := input.resource_changes[_]
  rc.type == "aws_cognito_user_pool"
  not has_pretoken(rc.change.after.lambda_config)
  msg := "CRI: Cognito user pool must configure pre_token_generation trigger"
}

has_pretoken(cfg) {
  cfg.pre_token_generation != ""
}
