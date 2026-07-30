import asyncio
import json
import logging
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.kafka_client import kafka_client
from app.ml.ensemble import EnsembleDetector
from app.routers import anomaly, predict, rootcause, models
from app.schemas import AnomalyDetectRequest, MetricPoint

logger = logging.getLogger(__name__)


metrics_buffer: dict[str, list[MetricPoint]] = defaultdict(list)
detector = EnsembleDetector()


async def consume_raw_metrics():
    topic = "raw-metrics"
    logger.info(f"Starting Kafka consumer for {topic}")
    try:
        consumer = await kafka_client.create_consumer(topic, group_id="analyzer-group")
        async for msg in consumer:
            try:
                value = msg.value
                service_id = value.get("serviceId", "unknown")
                metric = MetricPoint(
                    ts=datetime.fromtimestamp(value["ts"] / 1000, tz=timezone.utc),
                    name=value["metricName"],
                    value=value["value"],
                    labels=value.get("labels"),
                )
                metrics_buffer[service_id].append(metric)
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
                )
                if result["isAnomaly"]:
                    anomaly_event = {
                        "eventId": str(hash(f"{service_id}-{metrics[-1].ts.isoformat()}")),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "serviceId": service_id,
                        "cluster": "default",
                        "anomalyScore": result["score"],
                        "affectedMetrics": result.get("contributingMetrics", []),
                        "traceId": "",
                    }
                    logger.info(f"Anomaly detected: {service_id} score={result['score']}")
                    await kafka_client.publish(
                        settings.kafka_anomaly_topic,
                        key=service_id,
                        value=anomaly_event,
                    )
            except Exception as e:
                logger.error(f"Detection error for {service_id}: {e}")
            metrics_buffer[service_id] = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting AstraWatch Analyzer Service")
    consumer_task = asyncio.create_task(consume_raw_metrics())
    detection_task = asyncio.create_task(run_periodic_detection())
    yield
    consumer_task.cancel()
    detection_task.cancel()
    logger.info("Shutting down AstraWatch Analyzer Service")
    await kafka_client.close()


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    lifespan=lifespan,
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
app.include_router(models.router)


@app.get("/v1/health")
async def health():
    return {
        "status": "healthy",
        "service": "analyzer",
        "version": "1.0.0",
    }
