output "nlb_arn" { value = aws_lb.nlb.arn }
output "nlb_listener_arn" { value = aws_lb_listener.listener.arn }
output "nlb_dns" { value = aws_lb.nlb.dns_name }
