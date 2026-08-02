"""Prometheus metrics for the Analyzer service.

The TDD requires every service to expose /metrics in Prometheus format.
prometheus-client is declared in requirements.txt but was never wired up — the
analyzer had no /metrics endpoint at all. These counters make anomaly detection
volume, root-cause work, and feedback-driven retrains observable, and the route
is mounted on the FastAPI app in app/__init__.py.
"""

from fastapi import APIRouter
from fastapi.responses import Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

ANOMALIES_DETECTED = Counter(
    "astrawatch_analyzer_anomalies_detected_total",
    "Anomaly detections, by outcome.",
    ["outcome"],  # detected | normal
)

ROOT_CAUSE_ANALYSES = Counter(
    "astrawatch_analyzer_root_cause_analyses_total",
    "Root-cause analyses performed (no label: service_id is unbounded user input and would balloon cardinality).",
)

FEEDBACK_RECEIVED = Counter(
    "astrawatch_analyzer_feedback_received_total",
    "Feedback events processed (drives async retrains).",
    ["is_true_positive"],
)

DETECT_LATENCY = Histogram(
    "astrawatch_analyzer_detect_seconds",
    "Anomaly detection latency (ensemble scoring).",
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
)

metrics_router = APIRouter()


@metrics_router.get("/metrics")
async def metrics() -> Response:
    """Expose Prometheus metrics (audit Phase 7 — meta-observability)."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
