# Managed Kafka (MSK) — audit P4.13: broker count / instance type and subnet
# placement are parameterized, and the hardcoded subnet-xyz / sg-xyz
# placeholders are replaced with the shared security group + supplied subnets.
resource "aws_msk_cluster" "kafka" {
  cluster_name           = "astrawatch-kafka"
  kafka_version          = "3.2.0"
  number_of_broker_nodes = var.kafka_broker_count

  broker_node_group_info {
    instance_type   = var.kafka_instance_type
    client_subnets  = var.subnet_ids
    security_groups = [aws_security_group.astrawatch_stores.id]
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }

  tags = {
    Name = "astrawatch-kafka"
  }
}

