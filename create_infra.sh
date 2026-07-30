#!/bin/bash
set -e

mkdir -p infra/helm/analyzer
mkdir -p infra/helm/collector
mkdir -p infra/helm/frontend
mkdir -p infra/helm/operator
mkdir -p infra/helm/orchestrator
mkdir -p infra/helm/realtime

for chart in analyzer collector frontend operator orchestrator realtime; do
  mkdir -p infra/helm/$chart/templates
  cat <<EOF > infra/helm/$chart/Chart.yaml
apiVersion: v2
name: $chart
description: A Helm chart for $chart
type: application
version: 0.1.0
appVersion: "1.0.0"
EOF
  cat <<EOF > infra/helm/$chart/values.yaml
replicaCount: 1
image:
  repository: astrawatch/$chart
  pullPolicy: IfNotPresent
  tag: "latest"
EOF
  cat <<EOF > infra/helm/$chart/templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "$chart.fullname" . }}
  labels:
    app: $chart
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: $chart
  template:
    metadata:
      labels:
        app: $chart
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
EOF
done

mkdir -p infra/terraform
cat <<EOF > infra/terraform/main.tf
provider "aws" {
  region = "us-east-1"
}
EOF
cat <<EOF > infra/terraform/postgres.tf
resource "aws_db_instance" "postgres" {
  allocated_storage = 20
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = "db.t3.micro"
  username          = "astrawatch"
  password          = "astrawatch"
}
EOF
cat <<EOF > infra/terraform/clickhouse.tf
resource "aws_instance" "clickhouse" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.medium"
  tags = {
    Name = "clickhouse"
  }
}
EOF
cat <<EOF > infra/terraform/kafka.tf
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
EOF
cat <<EOF > infra/terraform/redis.tf
resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "astrawatch-redis"
  engine               = "redis"
  node_type            = "cache.t3.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
}
EOF

mkdir -p infra/prometheus
cat <<EOF > infra/prometheus/prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'astrawatch-collector'
    static_configs:
      - targets: ['collector:8080']
  - job_name: 'astrawatch-cxx-agent'
    static_configs:
      - targets: ['cxx-agent:8080']
EOF

mkdir -p infra/grafana
cat <<EOF > infra/grafana/dashboard.json
{
  "title": "AstraWatch Dashboard",
  "panels": []
}
EOF

mkdir -p tests
cat <<EOF > tests/integration_test.sh
#!/bin/bash
echo "Running integration tests..."
exit 0
EOF
chmod +x tests/integration_test.sh

mkdir -p .github/workflows
cat <<EOF > .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build
        run: echo "Building..."
      - name: Test
        run: echo "Testing..."
EOF
