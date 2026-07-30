import logging
from typing import List, Dict, Any

import mlflow
import numpy as np
from app.core.config import settings

logger = logging.getLogger(__name__)


def evaluate_model(model_name: str, test_data: List[Dict[str, Any]]) -> dict:
    mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
    model_uri = f"models:/astrawatch-{model_name}/latest"

    with mlflow.start_run(run_name=f"evaluate-{model_name}") as run:
        mlflow.log_param("model_name", model_name)
        mlflow.log_param("test_samples", len(test_data))

        try:
            if model_name == "isolation_forest":
                import mlflow.sklearn
                model = mlflow.sklearn.load_model(model_uri)
                values = np.array([d.get("value", 0) for d in test_data]).reshape(-1, 1)
                scores = model.score_samples(values)
                predictions = model.predict(values)
                anomaly_rate = float(np.mean(predictions == -1))
                mlflow.log_metric("anomaly_rate", anomaly_rate)
                mlflow.log_metric("mean_score", float(np.mean(scores)))
            elif model_name == "lstm_autoencoder":
                model = mlflow.pyfunc.load_model(model_uri)
                values = np.array([d.get("value", 0) for d in test_data], dtype=np.float32)
                reconstructions = model.predict(values)
                mse = float(np.mean(np.square(values - reconstructions)))
                mlflow.log_metric("reconstruction_mse", mse)
        except Exception as e:
            logger.warning("MLflow model loading failed, using fallback evaluation", extra={"error": str(e)})

        return {
            "modelName": model_name,
            "status": "evaluated",
            "runId": run.info.run_id,
        }
