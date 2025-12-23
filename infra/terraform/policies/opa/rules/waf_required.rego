package terraform.cri

deny[msg] {
  some i
  input.resource_changes[i].type == "aws_apigatewayv2_api"
  not waf_assoc_exists
  msg := "CRI: API Gateway must have WAF association"
}

waf_assoc_exists {
  some j
  input.resource_changes[j].type == "aws_wafv2_web_acl_association"
}
