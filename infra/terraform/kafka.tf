resource "aws_msk_cluster" "kafka" {
  cluster_name           = "astrawatch-kafka"
  kafka_version          = "3.2.0"
  number_of_broker_nodes = 3
  broker_node_group_info {
    instance_type = "kafka.m5.large"
    client_subnets = ["subnet-xyz"]
    security_groups = ["sg-xyz"]
  }
}
