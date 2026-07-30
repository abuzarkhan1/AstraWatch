import logging
from fastapi import APIRouter
from app.schemas import RootCauseRequest, RootCauseResult
from app.services.anomaly_service import anomaly_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/anomaly", tags=["rootcause"])


@router.post("/root-cause", response_model=RootCauseResult)
async def root_cause(request: RootCauseRequest):
    result = await anomaly_service.root_cause_analysis(request)
    return result
