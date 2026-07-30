resource "aws_db_instance" "postgres" {
  allocated_storage = 20
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = "db.t3.micro"
  username          = "astrawatch"
  password          = "astrawatch"
}
