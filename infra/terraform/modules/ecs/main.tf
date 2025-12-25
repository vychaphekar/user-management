resource "aws_ecs_cluster" "this" {
  name = "${var.name}-cluster"
}

resource "aws_cloudwatch_log_group" "lg" {
  name              = "/ecs/${var.name}-user-service"
  retention_in_days = 30
}

resource "aws_security_group" "task_sg" {
  name   = "${var.name}-task-sg"
  vpc_id = var.vpc_id
}

resource "aws_lb" "nlb" {
  name               = "${var.name}-nlb"
  internal           = true
  load_balancer_type = "network"
  subnets            = var.private_subnet_ids
}

resource "aws_lb_target_group" "tg" {
  name        = "${var.name}-tg"
  port        = 3000
  protocol    = "TCP"
  vpc_id      = var.vpc_id
  target_type = "ip"
  health_check { protocol = "TCP" }
}

resource "aws_lb_listener" "listener" {
  load_balancer_arn = aws_lb.nlb.arn
  port              = 80
  protocol          = "TCP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.tg.arn
  }
}

resource "aws_iam_role" "task_exec" {
  name = "${var.name}-task-exec"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17",
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "exec_attach" {
  role       = aws_iam_role.task_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "task_role" {
  name               = "${var.name}-task-role"
  assume_role_policy = aws_iam_role.task_exec.assume_role_policy
}

# NOTE: tighten IAM in production - scoped to specific table ARNs + pool ARNs.
resource "aws_iam_role_policy" "task_policy" {
  name = "${var.name}-task-policy"
  role = aws_iam_role.task_role.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      { Effect = "Allow", Action = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query"], Resource = "*" },
      { Effect = "Allow", Action = ["cognito-idp:*"], Resource = "*" }
    ]
  })
}

resource "aws_ecs_task_definition" "task" {
  family                   = "${var.name}-user-service"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.task_exec.arn
  task_role_arn            = aws_iam_role.task_role.arn

  container_definitions = jsonencode([{
    name         = "user-service",
    image        = var.ecr_image,
    portMappings = [{ containerPort = 3000, hostPort = 3000, protocol = "tcp" }],
    logConfiguration = {
      logDriver = "awslogs",
      options = {
        awslogs-group         = aws_cloudwatch_log_group.lg.name,
        awslogs-region        = var.aws_region,
        awslogs-stream-prefix = "ecs"
      }
    },
    environment = [for k, v in var.env_vars : { name = k, value = v }]
  }])
}

resource "aws_ecs_service" "svc" {
  name            = "${var.name}-user-service"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.task.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.task_sg.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.tg.arn
    container_name   = "user-service"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.listener]
}
