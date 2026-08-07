# AstraWatch Terraform

This directory manages the **data stores** AstraWatch depends on (Postgres, Kafka,
Redis, ClickHouse). The **application services** (collector, orchestrator, analyzer,
realtime, operator, payment, frontend) are deployed via the Helm charts in
`infra/helm/` — one chart per service (audit 5.1/5.2: the Helm charts had been
deleted and Terraform covered only the stores, so infra-as-code could not deploy
the product itself).

## Layout

| File            | Resource                                    |
|-----------------|---------------------------------------------|
| `main.tf`       | Provider + shared config                    |
| `postgres.tf`   | Managed Postgres instance + database        |
| `kafka.tf`      | Managed Kafka cluster + topics              |
| `redis.tf`      | Managed Redis cache                         |
| `clickhouse.tf` | Managed ClickHouse cluster                  |

## Application services

Deploy the product with Helm after `terraform apply`:

```bash
terraform apply        # data stores
kubectl create secret generic astrawatch-secrets \
  --from-literal=JWT_SECRET="$(openssl rand -base64 48)" \
  --from-literal=INTERNAL_API_TOKEN="$(openssl rand -base64 24)"
helm install astrawatch infra/helm/orchestrator
helm install astrawatch infra/helm/collector
helm install astrawatch infra/helm/analyzer
helm install astrawatch infra/helm/realtime
helm install astrawatch infra/helm/operator
helm install astrawatch infra/helm/frontend
```

Service accounts, RBAC, and health probes for each service are defined in the
charts (see `infra/helm/operator/templates/deployment.yaml` for the operator's
ClusterRole, for example).
