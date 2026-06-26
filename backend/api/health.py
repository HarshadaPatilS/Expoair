from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from database.connection import get_db
from database.schema import HealthScore, User
from auth.auth_handler import get_current_user
from services.exposure_service import ExposureService

router = APIRouter(prefix="/health", tags=["Health & Risk Assessment"])

# Schemas
class HealthProfile(BaseModel):
    age_group: str = "adult" # 'child', 'adult', 'senior'
    asthma: str = "none" # 'none', 'mild', 'severe'
    pregnant: bool = False
    cardiovascular: bool = False
    current_aqi: float = 75.0

class HealthCard(BaseModel):
    title: str
    status: str # 'Good', 'Moderate', 'High Risk', 'Warning'
    value: str # e.g. '85%', 'Wear Mask', 'Safe to Exercise'
    description: str
    icon: str # name of Lucide icon to use
    severity: str # 'info', 'success', 'warning', 'danger'

class HealthAssessmentResponse(BaseModel):
    safety_score: float # 0 to 100
    risk_level: str # 'safe', 'moderate', 'high', 'hazardous'
    summary: str
    cards: List[HealthCard]

@router.post("/health-risk", response_model=HealthAssessmentResponse)
def get_health_assessment(
    profile: HealthProfile = Body(...),
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    aqi = profile.current_aqi
    
    # Use ExposureService helper logic
    health_profile_dict = {
        "age_group": profile.age_group,
        "asthma": profile.asthma,
        "pregnant": profile.pregnant,
        "cardiovascular": profile.cardiovascular
    }
    
    safety_res = ExposureService.get_safety_score(aqi, health_profile_dict)
    safety_score = safety_res["safety_score_0_to_100"]
    risk_level = safety_res["risk_level"]
    summary = safety_res["message"]
    
    # 2. Formulate Apple Health style Cards
    cards = []
    
    # Card 1: Respiratory Risk
    resp_status = "Good"
    resp_severity = "success"
    resp_desc = "No elevated respiratory threat detected."
    if profile.asthma != "none" or aqi > 100:
        resp_status = "High Risk" if profile.asthma == "severe" or aqi > 150 else "Moderate"
        resp_severity = "danger" if resp_status == "High Risk" else "warning"
        resp_desc = "Elevated particulate counts might trigger bronchospasm or coughing."
    cards.append(HealthCard(
        title="Respiratory Risk",
        status=resp_status,
        value="Elevated" if resp_status != "Good" else "Normal",
        description=resp_desc,
        icon="Activity",
        severity=resp_severity
    ))
    
    # Card 2: Exercise Suitability
    exercise_score = round(safety_score * 0.9)
    ex_status = "Safe"
    ex_severity = "success"
    ex_desc = "Perfect weather for running and outdoor sports."
    if exercise_score < 70:
        ex_status = "Limited"
        ex_severity = "warning"
        ex_desc = "Avoid high-intensity outdoor cardio. Keep exertion light."
    if exercise_score < 40:
        ex_status = "Unsafe"
        ex_severity = "danger"
        ex_desc = "Stay indoors. High ventilation rates will double particulate inhalation."
    cards.append(HealthCard(
        title="Exercise Score",
        status=ex_status,
        value=f"{exercise_score}/100",
        description=ex_desc,
        icon="Flame",
        severity=ex_severity
    ))
    
    # Card 3: Mask Recommendation
    mask_val = "Not Required"
    mask_severity = "success"
    mask_desc = "Ambient air is clean enough; no respiratory protection required."
    if aqi > 100 or (aqi > 70 and (profile.asthma != "none" or profile.cardiovascular)):
        mask_val = "N95 Recommended" if aqi > 150 else "Surgical Mask"
        mask_severity = "danger" if aqi > 150 else "warning"
        mask_desc = "N95 particulate filter recommended to filter out micro PM2.5."
    cards.append(HealthCard(
        title="Mask Guidance",
        status="Required" if mask_val != "Not Required" else "Recommended",
        value=mask_val,
        description=mask_desc,
        icon="ShieldAlert",
        severity=mask_severity
    ))
    
    # Card 4: Vulnerable Groups Safety (Child/Senior)
    v_status = "Safe"
    v_severity = "success"
    v_desc = "Air is clean for children, elderly, and pregnant individuals."
    if aqi > 80:
        v_status = "Caution"
        v_severity = "warning"
        v_desc = "Sensitive groups should reduce prolonged outdoor play or morning walks."
    if aqi > 130 or (aqi > 90 and (profile.age_group in ["child", "senior"] or profile.pregnant)):
        v_status = "Stay Indoors"
        v_severity = "danger"
        v_desc = "Keep children and seniors indoors. Activate HEPA air filtration."
    cards.append(HealthCard(
        title="Vulnerable Demographics",
        status=v_status,
        value=v_status,
        description=v_desc,
        icon="Baby",
        severity=v_severity
    ))
    
    # Save the score in the database
    new_score = HealthScore(
        user_id=current_user.id if current_user else None,
        age_group=profile.age_group,
        asthma=profile.asthma,
        pregnant=profile.pregnant,
        cardiovascular=profile.cardiovascular,
        safety_score=safety_score,
        risk_level=risk_level
    )
    db.add(new_score)
    db.commit()
    
    return HealthAssessmentResponse(
        safety_score=safety_score,
        risk_level=risk_level,
        summary=summary,
        cards=cards
    )
