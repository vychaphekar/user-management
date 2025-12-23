package terraform.cri

deny[msg] {
  rc := input.resource_changes[_]
  rc.type == "aws_ecs_service"
  rc.change.after.network_configuration.assign_public_ip == true
  msg := "CRI: ECS services must not assign public IPs"
}
