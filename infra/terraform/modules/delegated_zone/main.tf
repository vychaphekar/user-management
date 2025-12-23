resource "aws_route53_zone" "this" {
  name = var.subzone_name
}
