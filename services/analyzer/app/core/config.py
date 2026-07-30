import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str = "AstraWatch Analyzer"
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"
    kafka_bootstrap_servers: str = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
    kafka_anomaly_topic: str = os.getenv("KAFKA_ANOMALY_TOPIC", "anomaly-detected")
    kafka_consumer_group: str = os.getenv("KAFKA_CONSUMER_GROUP", "analyzer-group")
    kafka_feedback_topic: str = os.getenv("KAFKA_FEEDBACK_TOPIC", "feedback-received")
    clickhouse_host: str = os.getenv("CLICKHOUSE_HOST", "localhost")
    clickhouse_port: int = int(os.getenv("CLICKHOUSE_PORT", "9000"))
    clickhouse_db: str = os.getenv("CLICKHOUSE_DB", "astrawatch")
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    mlflow_tracking_uri: str = os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5000")
    model_path: str = os.getenv("MODEL_PATH", "/models")
    retrain_interval_hours: int = int(os.getenv("RETRAIN_INTERVAL_HOURS", "24"))
    jwt_secret: str = os.getenv("JWT_SECRET", "dev-secret")
    prometheus_port: int = int(os.getenv("PROMETHEUS_PORT", "9090"))

    class Config:
        env_file = ".env"

settings = Settings()
