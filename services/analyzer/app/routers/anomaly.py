import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from app.schemas import (
    AnomalyDetectRequest,
    AnomalyResult,
    FeedbackRequest,
)
from app.services.anomaly_service import anomaly_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/anomaly", tags=["anomaly"])


@router.post("/detect", response_model=AnomalyResult)
async def detect_anomaly(
    request: AnomalyDetectRequest,
    use_dl: bool = Query(False, alias="useDeepLearning"),
):
    result = await anomaly_service.detect_anomaly(request, use_deep_learning=use_dl)
    return result


@router.post("/{anomaly_id}/feedback")
async def submit_feedback(
    anomaly_id: str,
    feedback: FeedbackRequest,
    user_id: str = Query("system"),
):
    result = await anomaly_service.submit_feedback(
        anomaly_id, feedback.model_dump(), user_id
    )
    return result
