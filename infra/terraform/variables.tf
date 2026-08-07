# Shared input variables for the AstraWatch data-store stack (audit P4.13:
# resource files previously hardcoded placeholders like subnet-xyz and leaked a
# plaintext DB password — everything is now parameterized, with secure defaults
# and no hardcoded credentials).
variable "aws_region" {
  description = "AWS region for AstraWatch data stores"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment tag"
  type        = string
  default     = "dev"
}

variable "vpc_id" {
  description = "VPC where the data stores are launched"
  type        = string
  default     = ""
}

variable "subnet_ids" {
  description = "Subnet IDs for multi-AZ / private placement"
  type        = list(string)
  default     = []
}

variable "allowed_cidrs" {
  description = "CIDR blocks allowed to reach the data stores (default: none)"
  type        = list(string)
  default     = []
}

variable "db_username" {
  description = "Postgres master username"
  type        = string
  default     = "astrawatch"
}

variable "db_password" {
  description = "Postgres master password (never hardcode — use SSM/vault at apply time)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "db_allocated_storage" {
  description = "Postgres storage in GB"
  type        = number
  default     = 20
}

variable "kafka_instance_type" {
  description = "MSK broker instance type"
  type        = string
  default     = "kafka.m5.large"
}

variable "kafka_broker_count" {
  description = "Number of MSK broker nodes"
  type        = number
  default     = 3
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "ec2_key_name" {
  description = "EC2 key pair name for SSH access to the ClickHouse instance"
  type        = string
  default     = ""
}
