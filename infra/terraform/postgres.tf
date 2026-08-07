# Managed Postgres (audit P4.13: username/password were hardcoded in source;
# now password comes from a sensitive variable and storage/instance are
# parameterized).
resource "aws_db_instance" "postgres" {
  allocated_storage     = var.db_allocated_storage
  engine                = "postgres"
  engine_version        = "16"
  instance_class        = "db.t3.micro"
  username              = var.db_username
  password              = var.db_password == "" ? random_password.db_password.result : var.db_password
  db_name               = "astrawatch"
  skip_final_snapshot   = true
  backup_retention_period = 7
  multi_az              = var.environment == "prod" ? true : false
  storage_encrypted     = true

  vpc_security_group_ids = [aws_security_group.astrawatch_stores.id]
  db_subnet_group_name   = length(var.subnet_ids) >= 2 ? aws_db_subnet_group.astrawatch.id : null
  publicly_accessible    = false

  tags = {
    Name = "astrawatch-postgres"
  }
}

resource "random_password" "db_password" {
  length  = 32
  special = true
  # Keep the value stable across applies once generated.
  keepers = {
    username = var.db_username
  }
}

resource "aws_db_subnet_group" "astrawatch" {
  count = length(var.subnet_ids) >= 2 ? 1 : 0
  name  = "astrawatch-stores"
  subnet_ids = var.subnet_ids
}

# Shared security group for all data stores (default: closed; open only the
# CIDRs the caller explicitly provides).
resource "aws_security_group" "astrawatch_stores" {
  name_prefix = "astrawatch-stores-"
  vpc_id      = var.vpc_id

  dynamic "ingress" {
    for_each = var.allowed_cidrs
    content {
      from_port   = 0
      to_port     = 0
      protocol    = "-1"
      cidr_blocks = [ingress.value]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
