import asyncio
import json
import uuid
import structlog
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.responses import ORJSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.kafka_client import kafka_client
from app.ml.ensemble import EnsembleDetector
from app.routers import anomaly, predict, rootcause
from app.schemas import AnomalyDetectRequest, MetricPoint
from app.services.log_miner import log_miner
from app.services.anomaly_service import anomaly_service

logger = structlog.get_logger(__name__)


metrics_buffer: dict[str, list[MetricPoint]] = defaultdict(list)
detector = EnsembleDetector()


async def consume_raw_logs():
    """Consume raw-logs and feed the log miner (audit F5: deep log analysis)."""
    topic = "raw-logs"
    logger.info(f"Starting Kafka consumer for {topic}")
    try:
        consumer = await kafka_client.create_consumer(topic, group_id="analyzer-log-miner")
        async for msg in consumer:
            try:
                log_miner.ingest(msg.value)
                await consumer.commit()
            except Exception as e:
                logger.error(f"Error processing log message: {e}")
    except Exception as e:
        logger.error(f"Kafka consumer error (raw-logs): {e}")


async def consume_feedback():
    """Consume feedback-received and trigger async retrains off the HTTP path
    (audit F12 — previously submit_feedback blocked on a synchronous retrain)."""
    topic = settings.kafka_feedback_topic
    logger.info(f"Starting Kafka consumer for {topic}")
    try:
        consumer = await kafka_client.create_consumer(topic, group_id="analyzer-feedback")
        async for msg in consumer:
            try:
                value = msg.value or {}
                is_true_positive = value.get("isTruePositive", True)
                anomaly_id = value.get("anomalyId", "unknown")
                if not is_true_positive:
                    logger.info(f"False positive feedback for {anomaly_id} — scheduling async retrain")
                    await anomaly_service.retrain_model("isolation_forest")
                else:
                    logger.info(f"Feedback for {anomaly_id} marked true positive — no retrain")
                await consumer.commit()
            except Exception as e:
                logger.error(f"Error processing feedback message: {e}")
    except Exception as e:
        logger.error(f"Kafka consumer error (feedback-received): {e}")


async def consume_raw_metrics():
    topic = "raw-metrics"
    logger.info(f"Starting Kafka consumer for {topic}")
    try:
        consumer = await kafka_client.create_consumer(topic, group_id="analyzer-group")
        async for msg in consumer:
            try:
                value = msg.value
                service_id = value.get("serviceId", "unknown")
                tenant_id = value.get("tenantId") or (value.get("labels") or {}).get("tenantId") or "default"
                metric = MetricPoint(
                    ts=datetime.fromtimestamp(value["ts"] / 1000, tz=timezone.utc),
                    name=value["metricName"],
                    value=value["value"],
                    labels=value.get("labels"),
                    tenant_id=tenant_id,
                )
                metrics_buffer[service_id].append(metric)
                await consumer.commit()
            except Exception as e:
                logger.error(f"Error processing metric message: {e}")
    except Exception as e:
        logger.error(f"Kafka consumer error: {e}")


async def run_periodic_detection():
    while True:
        await asyncio.sleep(30)
        for service_id, metrics in list(metrics_buffer.items()):
            if len(metrics) < 2:
                continue

            tenant_id = "default"
            for m in metrics:
                if hasattr(m, "tenant_id") and m.tenant_id:
                    tenant_id = m.tenant_id
                    break
                elif m.labels and isinstance(m.labels, dict) and "tenantId" in m.labels:
                    tenant_id = m.labels["tenantId"]
                    break

            try:
                metrics_dict = [
                    {"name": m.name, "value": m.value, "ts": m.ts.isoformat()}
                    for m in metrics
                ]
                result = detector.detect(
                    service_id=service_id,
                    metrics=metrics_dict,
                    window_seconds=30,
                    use_deep_learning=True,
                    tenant_id=tenant_id,
                )
                if result["isAnomaly"]:
                    # Attach real log evidence mined from the matching window so the
                    # incident and email carry the actual error (audit F5/F3).
                    log_evidence = log_miner.evidence(tenant_id, service_id, window_seconds=300)
                    contributing = result.get("contributingMetrics", []) or []
                    # The orchestrator's AnomalyDetectedEvent expects affectedMetrics as
                    # a String[] — publish metric NAMES, not the full dict payload.
                    affected_metric_names = [
                        m.get("metric", "unknown") if isinstance(m, dict) else str(m)
                        for m in contributing
                    ]
                    anomaly_event = {
                        "eventId": str(uuid.uuid4()),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "serviceId": service_id,
                        "tenantId": tenant_id,
                        "cluster": "default",
                        "anomalyScore": result["score"],
                        "affectedMetrics": affected_metric_names,
                        "traceId": (log_evidence.get("traceIds") or [""])[0] if log_evidence else "",
                        # The orchestrator's event carries logEvidence as a JSON string.
                        "logEvidence": json.dumps(log_evidence) if log_evidence else None,
                    }
                    logger.info(f"Anomaly detected: {service_id} tenant={tenant_id} score={result['score']}")
                    await kafka_client.publish(
                        settings.kafka_anomaly_topic,
                        key=service_id,
                        value=anomaly_event,
                    )
                # Clear buffer ONLY after successful processing and Kafka publishing
                metrics_buffer[service_id] = []
            except Exception as e:
                logger.error(f"Detection error for {service_id}: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting AstraWatch Analyzer Service")
    log_consumer_task = asyncio.create_task(consume_raw_logs())
    consumer_task = asyncio.create_task(consume_raw_metrics())
    feedback_task = asyncio.create_task(consume_feedback())
    detection_task = asyncio.create_task(run_periodic_detection())
    yield
    log_consumer_task.cancel()
    consumer_task.cancel()
    feedback_task.cancel()
    detection_task.cancel()
    logger.info("Shutting down AstraWatch Analyzer Service")
    await kafka_client.close()


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    lifespan=lifespan,
    default_response_class=ORJSONResponse,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(anomaly.router)
app.include_router(predict.router)
app.include_router(rootcause.router)


@app.get("/healthz")
@app.get("/v1/health")
async def health():
    return {
        "status": "healthy",
        "service": "analyzer",
        "version": "1.0.0",
    }
