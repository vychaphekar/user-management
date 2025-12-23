output "delegation_record_fqdn" {
  value = aws_route53_record.delegate_ns.fqdn
}
