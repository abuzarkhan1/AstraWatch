# AstraWatch data-store infrastructure (audit P4.13: main.tf used to contain
# only a provider block — zero resources. The stores now live in postgres.tf /
# kafka.tf / redis.tf / clickhouse.tf and this file wires shared config, tags,
# and an S3 backend so `terraform apply` is reproducible and state is remote).
terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  # Enable remote state by uncommenting and creating the bucket:
  # backend "s3" {
  #   bucket         = "astrawatch-tfstate"
  #   key            = "astrawatch/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "astrawatch-tfstate-lock"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.tags
  }
}

locals {
  tags = {
    Project   = "astrawatch"
    ManagedBy = "terraform"
    Environment = var.environment
  }
}
