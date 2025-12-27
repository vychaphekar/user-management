resource "aws_acm_certificate" "cert" {
  domain_name               = var.api_parent_domain
  subject_alternative_names = ["*.${var.api_parent_domain}"]
  validation_method         = "DNS"
}

resource "aws_route53_record" "validation" {
  for_each = var.manage_route53_validation ? {
    for dvo in aws_acm_certificate.cert.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  zone_id         = var.zone_id
  name            = trim(each.value.name, ".")
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
}

resource "aws_acm_certificate_validation" "certv" {
  certificate_arn = aws_acm_certificate.cert.arn

  validation_record_fqdns = var.manage_route53_validation ? [
    for r in aws_route53_record.validation : r.fqdn
    ] : [
    for dvo in aws_acm_certificate.cert.domain_validation_options : trim(dvo.resource_record_name, ".")
  ]
}

