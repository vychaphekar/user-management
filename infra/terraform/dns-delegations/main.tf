provider "aws" {
  region = var.aws_region
}

data "aws_route53_zone" "root" {
  name = var.root_zone_name
}

resource "aws_route53_record" "delegate_ns" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = var.subzone_name
  type    = "NS"
  ttl     = 300
  records = var.subzone_name_servers
}
