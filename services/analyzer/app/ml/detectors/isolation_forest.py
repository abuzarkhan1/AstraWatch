import numpy as np
from typing import Tuple, Optional
from sklearn.ensemble import IsolationForest as SKIsolationForest
import joblib
import os


class IsolationForestDetector:
    def __init__(self, model_path: str = "/models"):
        self.model_path = model_path
        self.model: Optional[SKIsolationForest] = None
        self.contamination = 0.05
        self._load_or_init()

    def _load_or_init(self):
        try:
            import mlflow
            from app.core.config import settings
            mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
            self.model = mlflow.sklearn.load_model("models:/astrawatch-isolation_forest/latest")
            return
        except Exception:
            pass

        model_file = os.path.join(self.model_path, "isolation_forest.pkl")
        if os.path.exists(model_file):
            self.model = joblib.load(model_file)
        else:
            self.model = SKIsolationForest(
                n_estimators=100,
                max_samples="auto",
                contamination=self.contamination,
                random_state=42,
                n_jobs=-1,
            )

    def train(self, data: np.ndarray) -> dict:
        self.model = SKIsolationForest(
            n_estimators=100,
            max_samples="auto",
            contamination=self.contamination,
            random_state=42,
            n_jobs=-1,
        )
        self.model.fit(data)

        os.makedirs(self.model_path, exist_ok=True)
        model_file = os.path.join(self.model_path, "isolation_forest.pkl")
        joblib.dump(self.model, model_file)

        return {"samples": len(data), "model_file": model_file}

    def detect(self, values: np.ndarray) -> Tuple[bool, float]:
        if self.model is None:
            return False, 0.0

        from sklearn.exceptions import NotFittedError
        from sklearn.utils.validation import check_is_fitted
        try:
            check_is_fitted(self.model)
        except NotFittedError:
            return False, 0.0

        values_2d = values.reshape(-1, 1) if values.ndim == 1 else values
        scores = self.model.score_samples(values_2d)
        predictions = self.model.predict(values_2d)

        anomaly_score = 1.0 - np.exp(scores[-1])
        is_anomaly = predictions[-1] == -1

        return bool(is_anomaly), float(min(1.0, max(0.0, anomaly_score)))
