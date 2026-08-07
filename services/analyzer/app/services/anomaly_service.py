import logging
import os
import json
from typing import List, Dict, Any, Optional
from datetime import datetime

import numpy as np

from app.ml.ensemble import EnsembleDetector
from app.ml.causal import granger_causality, generate_ai_diagnosis
from app.schemas import (
    AnomalyDetectRequest,
    AnomalyResult,
    RootCauseRequest,
    RootCauseResult,
    PredictRequest,
    ForecastPoint,
    ModelStatus,
    AnomalyFeedback,
    AIDiagnosis,
)
from training.retrain_job import retrain_model as run_retrain

logger = logging.getLogger(__name__)


class AnomalyService:
    def __init__(self):
        self.detector = EnsembleDetector()
        self._model_registry_cache: dict = {}

    def _get_pg_connection(self):
        import psycopg2
        return psycopg2.connect(
            host=os.getenv("POSTGRES_HOST", "localhost"),
            port=int(os.getenv("POSTGRES_PORT", "5432")),
            dbname=os.getenv("POSTGRES_DB", "astrawatch"),
            user=os.getenv("POSTGRES_USER", "astrawatch"),
            password=os.getenv("POSTGRES_PASSWORD", "astrawatch")
        )

    def _init_pg_tables(self):
        try:
            with self._get_pg_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS anomaly_feedback (
                            id SERIAL PRIMARY KEY,
                            anomaly_id VARCHAR(255) NOT NULL,
                            is_true_positive BOOLEAN NOT NULL,
                            actual_severity VARCHAR(50),
                            notes TEXT,
                            user_id VARCHAR(100) NOT NULL,
                            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                        );
                    """)
                conn.commit()
        except Exception as e:
            logger.error(f"Failed to init PG tables: {e}")

    async def detect_anomaly(
        self, request: AnomalyDetectRequest, use_deep_learning: bool = False
    ) -> AnomalyResult:
        metrics_dict = [
            {"name": m.name, "value": m.value, "ts": m.ts}
            for m in request.metrics
        ]

        from app.metrics import ANOMALIES_DETECTED, DETECT_LATENCY
        with DETECT_LATENCY.time():
            result = self.detector.detect(
                service_id=request.serviceId,
                metrics=metrics_dict,
                window_seconds=request.window or 300,
                use_deep_learning=use_deep_learning,
                threshold=getattr(request, "threshold", None),
                tenant_id=getattr(request, "tenantId", "default"),
            )

        prediction = []
        ai_diagnosis = None
        if result["isAnomaly"]:
            ANOMALIES_DETECTED.labels(outcome="detected").inc()

            values = [m.value for m in request.metrics if m.name == result.get(
                "details", {}
            ).get("primary_metric", request.metrics[0].name)]
            if not values:
                values = [m.value for m in request.metrics]
            prediction = self.detector.predict_timeseries(values, 30)

            root_causes = result.get("rootCauses", [])
            # Pass mined log evidence so the diagnosis reflects the actual error
            # (audit F5) instead of generic text.
            from app.services.log_miner import log_miner
            log_evidence = log_miner.evidence(
                getattr(request, "tenantId", None) or "default", request.serviceId, window_seconds=300
            )
            ai_diagnosis_dict = generate_ai_diagnosis(
                root_causes, service_id=request.serviceId, log_evidence=log_evidence
            )
            # Optional LLM prose pass on top of the deterministic evidence
            # (strategy gap 3). Fails closed to the deterministic diagnosis.
            from app.services.llm_diagnosis import llm_enhance
            ai_diagnosis_dict = await llm_enhance(ai_diagnosis_dict)
            ai_diagnosis = AIDiagnosis(**ai_diagnosis_dict)
        else:
            ANOMALIES_DETECTED.labels(outcome="normal").inc()

        return AnomalyResult(
            isAnomaly=result["isAnomaly"],
            score=result["score"],
            contributingMetrics=result.get("contributingMetrics", []),
            rootCauses=result.get("rootCauses", []),
            aiDiagnosis=ai_diagnosis,
            prediction30min=prediction if prediction else None,
        )

    async def root_cause_analysis(
        self, request: RootCauseRequest
    ) -> RootCauseResult:
        service_id = getattr(request, 'serviceId', None)
        if not service_id:
            service_id = request.incidentId

        metric_groups = {
            "cpu_usage": self._get_recent_values(service_id, "cpu_usage"),
            "memory_usage": self._get_recent_values(service_id, "memory_usage"),
            "latency": self._get_recent_values(service_id, "latency"),
        }

        # Drop empty/degenerate series so granger causality never sees empty input.
        metric_groups = {k: v for k, v in metric_groups.items() if len(v) >= 3}

        from app.metrics import ROOT_CAUSE_ANALYSES
        ROOT_CAUSE_ANALYSES.inc()

        ranked_causes = []
        if len(metric_groups) >= 2:
            min_len = min(len(v) for v in metric_groups.values())
            ranked = granger_causality(metric_groups, max_lag=min(5, max(1, min_len // 2)))
            ranked_causes = [
                {
                    "metric": r["cause"],
                    "confidence": r["score"],
                    "laggedBy": r["lag"],
                }
                for r in ranked[:5]
            ]

        # Mine the actual log stream so the diagnosis — and the auto-PR remediation
        # document built from it — carries real error content (audit F5). This is the
        # path the orchestrator's AnomalyEventConsumer calls before opening a PR.
        from app.services.log_miner import log_miner
        tenant_id = getattr(request, 'tenantId', None) or 'default'
        log_evidence = log_miner.evidence(tenant_id, service_id, window_seconds=300)

        ai_diagnosis_dict = generate_ai_diagnosis(ranked_causes, service_id=service_id, log_evidence=log_evidence)
        # Optional LLM prose pass (strategy gap 3); fails closed.
        from app.services.llm_diagnosis import llm_enhance
        ai_diagnosis_dict = await llm_enhance(ai_diagnosis_dict)
        ai_diagnosis = AIDiagnosis(**ai_diagnosis_dict)

        return RootCauseResult(
            rankedCauses=ranked_causes,
            aiDiagnosis=ai_diagnosis,
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
        """
        Fetch the latest 60 values for (service_id, metric) from ClickHouse.

        Uses ClickHouse HTTP parameter binding (param_* query params) so the
        service_id / metric values are never interpolated into the SQL string
        (previously an f-string SQL injection). Returns [] (no synthetic data)
        when the query fails or returns nothing.
        """
        try:
            import httpx
            clickhouse_url = os.getenv("CLICKHOUSE_URL", "http://localhost:8123")
            query = (
                "SELECT value FROM metrics "
                "WHERE service_id = {service_id:String} "
                "AND metric_name = {metric:String} "
                "ORDER BY ts DESC LIMIT 60"
            )
            response = httpx.post(
                clickhouse_url,
                data=query,
                params={
                    "param_service_id": service_id,
                    "param_metric": metric,
                },
                timeout=5.0,
            )
            if response.status_code == 200:
                lines = response.text.strip().split('\n')
                if lines and lines[0]:
                    return [float(line) for line in lines][::-1]
        except Exception as e:
            logger.error(f"Clickhouse query error: {e}")
        return []

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
        self._init_pg_tables()
        try:
            with self._get_pg_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO anomaly_feedback (anomaly_id, is_true_positive, actual_severity, notes, user_id)
                        VALUES (%s, %s, %s, %s, %s)
                        """,
                        (
                            anomaly_id,
                            feedback.get('isTruePositive', True),
                            feedback.get('actualSeverity', ''),
                            feedback.get('notes', ''),
                            user_id
                        )
                    )
                conn.commit()
            
            # Async retrain trigger (audit F12): a false positive must NOT block the
            # HTTP request with a synchronous model retrain. Publish to the
            # feedback-received Kafka topic; the consumer task triggers the retrain.
            try:
                from app.core.kafka_client import kafka_client
                from app.core.config import settings
                await kafka_client.publish(
                    settings.kafka_feedback_topic,
                    key=anomaly_id,
                    value={
                        "anomalyId": anomaly_id,
                        "isTruePositive": feedback.get('isTruePositive', True),
                        "actualSeverity": feedback.get('actualSeverity', ''),
                    },
                )
                logger.info(f"Feedback for anomaly {anomaly_id} published to {settings.kafka_feedback_topic} for async retrain")
            except Exception as e:
                logger.error(f"Failed to publish feedback event for async retrain: {e}")

            from app.metrics import FEEDBACK_RECEIVED
            FEEDBACK_RECEIVED.labels(
                is_true_positive=str(feedback.get('isTruePositive', True)).lower()
            ).inc()

            logger.info(
                f"Feedback recorded for anomaly {anomaly_id}: "
                f"isTruePositive={feedback.get('isTruePositive')}"
            )
            return {"status": "recorded", "anomalyId": anomaly_id}
        except Exception as e:
            logger.error(f"Failed to record feedback: {e}")
            return {"status": "error", "error": str(e)}


anomaly_service = AnomalyService()

