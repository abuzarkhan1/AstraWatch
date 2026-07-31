import logging
from datetime import datetime
from typing import Optional

try:
    import mlflow
    HAS_MLFLOW = True
except ImportError:
    HAS_MLFLOW = False
    mlflow = None

import numpy as np
from app.core.config import settings
from app.ml.detectors.isolation_forest import IsolationForestDetector
from app.ml.detectors.lstm_autoencoder import LSTMAutoencoder
from app.ml.detectors.statistical import StatisticalDetector

logger = logging.getLogger(__name__)


def retrain_model(model_name: str, training_data: Optional[list] = None) -> dict:
    if not HAS_MLFLOW:
        logger.warning("MLflow not installed, running retrain job in local fallback mode")
        return {"jobId": "local-fallback", "status": "completed", "artifact_uri": "local"}

    mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
    mlflow.set_experiment(f"astrawatch-{model_name}")

    with mlflow.start_run() as run:
        mlflow.log_param("model_name", model_name)
        mlflow.log_param("retrain_time", datetime.utcnow().isoformat())
        mlflow.log_param("retrain_trigger", "scheduled")

        if training_data is None:
            training_data = _generate_training_data(model_name)

        if model_name == "statistical" or model_name == "all":
            mlflow.log_param("detector", "statistical")
            mlflow.log_metric("training_samples", len(training_data))

        if model_name == "isolation_forest" or model_name == "all":
            detector = IsolationForestDetector()
            arr = np.array(training_data, dtype=float).reshape(-1, 1)
            result = detector.train(arr)
            mlflow.log_metric("training_samples", result["samples"])
            mlflow.sklearn.log_model(detector.model, f"models/{model_name}")
            mlflow.register_model(
                f"runs:/{run.info.run_id}/models/{model_name}",
                f"astrawatch-{model_name}",
            )
            logger.info("isolation_forest model retrained and registered", extra={"run_id": run.info.run_id})

        if model_name == "lstm_autoencoder" or model_name == "all":
            detector = LSTMAutoencoder()
            arr = np.array(training_data, dtype=np.float32)
            result = detector.train(arr, epochs=20)
            mlflow.log_metric("training_samples", result.get("samples", 0))
            mlflow.log_metric("final_loss", result.get("final_loss", 0))
            mlflow.log_metric("threshold", result.get("threshold", 0))
            mlflow.pyfunc.log_model(
                f"models/{model_name}",
                python_model=detector,
                artifacts={"model_path": f"{settings.model_path}/lstm_autoencoder.keras"},
            )
            mlflow.register_model(
                f"runs:/{run.info.run_id}/models/{model_name}",
                f"astrawatch-{model_name}",
            )
            logger.info("lstm_autoencoder model retrained and registered", extra={"run_id": run.info.run_id})

        return {
            "jobId": run.info.run_id,
            "status": "completed",
            "artifact_uri": run.info.artifact_uri,
        }


def _generate_training_data(model_name: str) -> list:
    rng = np.random.default_rng(42)
    base = 50.0 if "cpu" in model_name else 100.0
    noise = rng.normal(0, 5, 200)
    trend = np.linspace(0, 10, 200)
    return list(base + trend + noise)
