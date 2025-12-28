resource "aws_dynamodb_table" "tenant_registry" {
  name         = "${var.name}-tenant-registry"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  server_side_encryption {
    enabled = true
  }
  point_in_time_recovery {
    enabled = true
  }

  tags = { Name = "${var.name}-tenant-registry" }
}

resource "aws_dynamodb_table" "user_profiles" {
  name         = "${var.name}-user-profiles"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.name}-user-profiles"
  }
}

# One-time invite records (used to enforce single-use + 48h expiration)
resource "aws_dynamodb_table" "invites" {
  name         = "${var.name}-invites"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  server_side_encryption { enabled = true }
  point_in_time_recovery { enabled = true }

  tags = { Name = "${var.name}-invites" }
}

