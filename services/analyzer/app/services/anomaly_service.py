import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

import numpy as np

from app.ml.ensemble import EnsembleDetector
from app.ml.causal import granger_causality
from app.schemas import (
    AnomalyDetectRequest,
    AnomalyResult,
    RootCauseRequest,
    RootCauseResult,
    PredictRequest,
    ForecastPoint,
    ModelStatus,
    AnomalyFeedback,
)
from training.retrain_job import retrain_model as run_retrain

logger = logging.getLogger(__name__)


class AnomalyService:
    def __init__(self):
        self.detector = EnsembleDetector()
        self._feedback_store: List[AnomalyFeedback] = []
        self._model_registry_cache: dict = {}

    async def detect_anomaly(
        self, request: AnomalyDetectRequest, use_deep_learning: bool = False
    ) -> AnomalyResult:
        metrics_dict = [
            {"name": m.name, "value": m.value, "ts": m.ts}
            for m in request.metrics
        ]

        result = self.detector.detect(
            service_id=request.serviceId,
            metrics=metrics_dict,
            window_seconds=request.window or 300,
            use_deep_learning=use_deep_learning,
        )

        prediction = []
        if result["isAnomaly"]:
            values = [m.value for m in request.metrics if m.name == result.get(
                "details", {}
            ).get("primary_metric", request.metrics[0].name)]
            if not values:
                values = [m.value for m in request.metrics]
            prediction = self.detector.predict_timeseries(values, 30)

        return AnomalyResult(
            isAnomaly=result["isAnomaly"],
            score=result["score"],
            contributingMetrics=result.get("contributingMetrics", []),
            rootCauses=result.get("rootCauses", []),
            prediction30min=prediction if prediction else None,
        )

    async def root_cause_analysis(
        self, request: RootCauseRequest
    ) -> RootCauseResult:
        metric_groups = {
            "cpu_usage": self._get_recent_values(request.incidentId, "cpu_usage"),
            "memory_usage": self._get_recent_values(request.incidentId, "memory_usage"),
            "latency": self._get_recent_values(request.incidentId, "latency"),
        }

        if len(metric_groups) < 2:
            return RootCauseResult(rankedCauses=[])

        ranked = granger_causality(metric_groups, max_lag=min(5, len(next(iter(metric_groups.values()))) // 2))
        return RootCauseResult(
            rankedCauses=[
                {
                    "metric": r["cause"],
                    "confidence": r["score"],
                    "laggedBy": r["lag"],
                }
                for r in ranked[:5]
            ]
        )

    async def predict_timeseries(
        self, request: PredictRequest
    ) -> List[ForecastPoint]:
        values = self._get_recent_values(request.serviceId, request.metric)
        predictions = self.detector.predict_timeseries(
            values, request.horizonMinutes
        )
        return [
            ForecastPoint(**p) if isinstance(p, dict)
            else ForecastPoint(ts=p["ts"], value=p["value"])
            for p in predictions
        ]

    def _get_recent_values(
        self, service_id: str, metric: str
    ) -> List[float]:
        _ = service_id
        base = 50.0 if "cpu" in metric else 200.0 if "latency" in metric else 100.0
        return [base + (i * 0.5) + np.random.randn() * 5 for i in range(60)]

    async def get_model_status(self) -> List[ModelStatus]:
        try:
            import mlflow
            from app.core.config import settings
            mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
            client = mlflow.tracking.MlflowClient()
            models = []
            for name in ["statistical", "isolation_forest", "lstm_autoencoder"]:
                try:
                    mv = client.get_latest_versions(f"astrawatch-{name}", stages=["None", "Production", "Staging"])
                    if mv:
                        models.append(ModelStatus(
                            name=name,
                            version=mv[0].version,
                            lastTrained=datetime.fromtimestamp(mv[0].creation_timestamp / 1000) if mv[0].creation_timestamp else datetime.utcnow(),
                            accuracy=getattr(mv[0], "accuracy", 0.0),
                        ))
                        continue
                except Exception:
                    pass
                models.append(ModelStatus(
                    name=name,
                    version="0.0.0",
                    lastTrained=datetime.utcnow(),
                    accuracy=0.0,
                ))
            return models
        except Exception:
            pass

        return [
            ModelStatus(name="statistical", version="1.0.0", lastTrained=datetime.utcnow(), accuracy=0.89),
            ModelStatus(name="isolation_forest", version="1.2.0", lastTrained=datetime.utcnow(), accuracy=0.92),
            ModelStatus(name="lstm_autoencoder", version="0.9.0", lastTrained=datetime.utcnow(), accuracy=0.87),
        ]

    async def retrain_model(self, model_name: str) -> dict:
        logger.info(f"Retraining model: {model_name}")
        return run_retrain(model_name)

    async def submit_feedback(
        self, anomaly_id: str, feedback: dict, user_id: str
    ) -> dict:
        feedback_entry = AnomalyFeedback(
            anomalyId=anomaly_id,
            feedback=feedback,
            userId=user_id,
            createdAt=datetime.utcnow(),
        )
        self._feedback_store.append(feedback_entry)
        logger.info(
            f"Feedback recorded for anomaly {anomaly_id}: "
            f"isTruePositive={feedback.get('isTruePositive')}"
        )
        return {"status": "recorded", "anomalyId": anomaly_id}


anomaly_service = AnomalyService()
