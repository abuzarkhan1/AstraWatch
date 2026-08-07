# ClickHouse on EC2 — audit P4.13: the AMI was a hardcoded (and stale) ID. It is
# now resolved via the official data source so the image matches the region, and
# the instance is placed on the shared store security group / subnets.
data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}

resource "aws_instance" "clickhouse" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = "t3.medium"
  subnet_id              = length(var.subnet_ids) >= 1 ? var.subnet_ids[0] : null
  vpc_security_group_ids = [aws_security_group.astrawatch_stores.id]
  key_name               = var.ec2_key_name != "" ? var.ec2_key_name : null

  root_block_device {
    volume_size = 100
    volume_type = "gp3"
  }

  user_data = <<-EOT
    #!/bin/bash
    set -e
    dnf install -y https://packages.clickhouse.com/rpm/stable/clickhouse-common-static-23.8.16.41.x86_64.rpm \
                   https://packages.clickhouse.com/rpm/stable/clickhouse-server-23.8.16.41.x86_64.rpm
    systemctl enable clickhouse-server
    systemctl start clickhouse-server
  EOT

  tags = {
    Name = "astrawatch-clickhouse"
  }
}
