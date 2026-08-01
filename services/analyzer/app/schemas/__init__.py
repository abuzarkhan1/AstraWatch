from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class MetricPoint(BaseModel):
    ts: datetime
    name: str
    value: float
    labels: Optional[dict] = None
    tenant_id: Optional[str] = "default"


class AnomalyDetectRequest(BaseModel):
    serviceId: str
    tenantId: Optional[str] = "default"
    threshold: Optional[float] = None
    metrics: List[MetricPoint]
    window: Optional[int] = 300


class SuggestedFix(BaseModel):
    targetFile: str
    patch: str
    explanation: str


class AIDiagnosis(BaseModel):
    summary: str
    what: str
    why: str
    suggestedFix: Optional[SuggestedFix] = None
    suggestedAction: Optional[dict] = None


class AnomalyResult(BaseModel):
    isAnomaly: bool
    score: float
    contributingMetrics: List[dict] = []
    rootCauses: List[dict] = []
    aiDiagnosis: Optional[AIDiagnosis] = None
    prediction30min: Optional[List[dict]] = None


class RootCauseRequest(BaseModel):
    incidentId: str
    serviceId: Optional[str] = None
    metricsWindow: Optional[int] = 900


class RootCauseResult(BaseModel):
    rankedCauses: List[dict] = []
    aiDiagnosis: Optional[AIDiagnosis] = None


class PredictRequest(BaseModel):
    serviceId: str
    metric: str
    horizonMinutes: int = 30


class ForecastPoint(BaseModel):
    ts: datetime
    value: float
    confidenceInterval: Optional[List[float]] = None


class ModelStatus(BaseModel):
    name: str
    version: str
    lastTrained: datetime
    accuracy: float


class FeedbackRequest(BaseModel):
    isTruePositive: bool
    actualSeverity: Optional[str] = None
    notes: Optional[str] = None


class AnomalyFeedback(BaseModel):
    anomalyId: str
    feedback: FeedbackRequest
    userId: str
    createdAt: datetime
