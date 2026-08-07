# Connection endpoints for the deployed data stores (audit P4.13: nothing was
# exported, so services had to hardcode endpoints).
output "postgres_endpoint" {
  description = "Postgres host:port"
  value       = aws_db_instance.postgres.address
}

output "postgres_database" {
  description = "Postgres database name"
  value       = aws_db_instance.postgres.db_name
}

output "kafka_bootstrap_brokers" {
  description = "MSK TLS bootstrap brokers (comma-separated)"
  value       = aws_msk_cluster.kafka.bootstrap_brokers_tls
}

output "redis_endpoint" {
  description = "ElastiCache Redis host:port"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "clickhouse_public_ip" {
  description = "ClickHouse instance public IP (if any)"
  value       = aws_instance.clickhouse.public_ip
}

# The generated master password (when var.db_password was left empty) is
# surfaced as a sensitive output so the app can connect; read it with
# `terraform output -raw db_password` or store it in AWS Secrets Manager.
output "db_password" {
  description = "Postgres master password (generated unless var.db_password was set)"
  value       = var.db_password == "" ? random_password.db_password.result : var.db_password
  sensitive   = true
}
