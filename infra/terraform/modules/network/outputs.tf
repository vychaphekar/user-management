output "vpc_id" { 
    value = aws_vpc.this.id 
}

output "private_subnet_ids" { 
    value = [aws_subnet.private_a.id, aws_subnet.private_b.id] 
}

output "apigw_vpc_link_security_group_id" {
  value = aws_security_group.apigw_vpc_link.id
}
