data "archive_file" "pre_token_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../../../apps/cognito-triggers/pre-token-generation/dist"
  output_path = "${path.module}/pre-token-generation.zip"
}

resource "aws_iam_role" "pre_token_role" {
  name = "${var.name}-pretoken-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect    = "Allow",
      Principal = { Service = "lambda.amazonaws.com" },
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "pre_token_basic" {
  role       = aws_iam_role.pre_token_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "pre_token_ddb" {
  name = "${var.name}-pretoken-ddb"
  role = aws_iam_role.pre_token_role.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = ["dynamodb:GetItem"],
        Resource = "*"
      }
    ]
  })
}

resource "aws_lambda_function" "pre_token_generation" {
  function_name = "${var.name}-pre-token-generation"
  role          = aws_iam_role.pre_token_role.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"

  filename         = data.archive_file.pre_token_zip.output_path
  source_code_hash = data.archive_file.pre_token_zip.output_base64sha256

  environment {
    variables = {
      APP_AWS_REGION           = var.aws_region
      USER_PROFILES_TABLE_NAME = var.user_profiles_table_name
    }
  }
}

resource "aws_cognito_user_pool" "this" {
  name = "${var.name}-shared-pool"

  mfa_configuration        = var.mfa_configuration
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 10
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = true
  }

  dynamic "schema" {
    for_each = var.create_custom_tenant_attribute ? [1] : []
    content {
      name                = "tenantId"
      attribute_data_type = "String"
      mutable             = true
      required            = false
      string_attribute_constraints {
        min_length = 1
        max_length = 64
      }
    }
  }

  lambda_config {
    pre_token_generation = aws_lambda_function.pre_token_generation.arn
  }

  dynamic "lambda_config" {
    for_each = (
      var.define_auth_challenge_lambda_arn != null ||
      var.create_auth_challenge_lambda_arn != null ||
      var.verify_auth_challenge_lambda_arn != null
    ) ? [1] : []

    content {
      define_auth_challenge          = var.define_auth_challenge_lambda_arn
      create_auth_challenge          = var.create_auth_challenge_lambda_arn
      verify_auth_challenge_response = var.verify_auth_challenge_lambda_arn
    }
  }
}

resource "aws_lambda_permission" "allow_cognito" {
  statement_id  = "AllowExecutionFromCognito"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pre_token_generation.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.this.arn
}

resource "aws_cognito_user_pool_client" "this" {
  name            = "${var.name}-app-client"
  user_pool_id    = aws_cognito_user_pool.this.id
  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  callback_urls                        = var.ui_callback_urls
  logout_urls                          = var.ui_logout_urls
  supported_identity_providers         = ["COGNITO"]
}

resource "aws_cognito_user_pool_domain" "this" {
  domain       = var.domain_prefix
  user_pool_id = aws_cognito_user_pool.this.id
}
