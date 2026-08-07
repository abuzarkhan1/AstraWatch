# Managed Redis (ElastiCache) — audit P4.13: node type parameterized, subnet
# placement + security group wired, and auth enforced.
resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "astrawatch-redis"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
  subnet_group_name    = length(var.subnet_ids) >= 1 ? aws_elasticache_subnet_group.astrawatch[0].name : null
  security_group_ids   = [aws_security_group.astrawatch_stores.id]
  auth_token           = random_password.redis_auth.result
  transit_encryption_enabled = true

  tags = {
    Name = "astrawatch-redis"
  }
}

resource "random_password" "redis_auth" {
  length  = 32
  special = false
}

resource "aws_elasticache_subnet_group" "astrawatch" {
  count      = length(var.subnet_ids) >= 1 ? 1 : 0
  name       = "astrawatch-redis-subnets"
  subnet_ids = var.subnet_ids
}
