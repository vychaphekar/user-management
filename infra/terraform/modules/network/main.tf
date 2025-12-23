data "aws_region" "current" {}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags = { Name = "${var.name}-vpc" }
}

resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.this.id
  cidr_block        = "10.20.1.0/24"
  availability_zone = "${data.aws_region.current.name}a"
  tags = { Name = "${var.name}-priv-a" }
}

resource "aws_subnet" "private_b" {
  vpc_id            = aws_vpc.this.id
  cidr_block        = "10.20.2.0/24"
  availability_zone = "${data.aws_region.current.name}b"
  tags = { Name = "${var.name}-priv-b" }
}
