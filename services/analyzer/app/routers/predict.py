from fastapi import APIRouter, Depends
from datetime import datetime
from app.schemas import PredictRequest, ModelStatus
from app.services.anomaly_service import anomaly_service
from app.core.auth import require_internal_auth

router = APIRouter(prefix="/v1", tags=["predict"])


@router.post("/predict/timeseries")
async def predict_timeseries(request: PredictRequest):
    predictions = await anomaly_service.predict_timeseries(request)
    return {"forecast": [p.model_dump() for p in predictions]}


@router.get("/models/status")
async def model_status():
    models = await anomaly_service.get_model_status()
    return {"models": [m.model_dump() for m in models]}


@router.post("/models/retrain", status_code=202, dependencies=[Depends(require_internal_auth)])
async def retrain_model(model_name: str = "all"):
    result = await anomaly_service.retrain_model(model_name)
    return {"status": "accepted", **result}
