resource "aws_instance" "clickhouse" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.medium"
  tags = {
    Name = "clickhouse"
  }
}
