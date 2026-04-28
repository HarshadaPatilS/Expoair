from fastapi import APIRouter
from pydantic import BaseModel
from services.exposure_service import ExposureService

router = APIRouter()

class HealthProfile(BaseModel):
    age_group: str = "adult"      # "adult", "child", "senior"
    asthma: str = "none"          # "none", "mild", "severe"
    pregnant: bool = False
    cardiovascular: bool = False

class HealthScoreRequest(BaseModel):
    current_aqi: float
    health_profile: HealthProfile

@router.post("/")
def get_health_score(request: HealthScoreRequest):
    """
    Evaluates the user's localized real-time exposure risk.
    Translates raw AQI scores against their unique biometric and health parameters.
    """
    return ExposureService.get_safety_score(
        aqi=request.current_aqi,
        health_profile=request.health_profile.model_dump()
    )
