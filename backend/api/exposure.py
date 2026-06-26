from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime

from database.connection import get_db
from database.schema import ExposureScore, User
from auth.auth_handler import get_current_user
from services.exposure_service import ExposureService

router = APIRouter(prefix="/exposure", tags=["Personal Exposure Engine"])

# Schemas
class RouteSegment(BaseModel):
    name: str # e.g. 'Home', 'Commute', 'Office', 'Gym'
    lat: float
    lng: float
    duration_minutes: float
    activity: str # 'resting', 'walking', 'cycling', 'jogging', 'commuting_vehicle'

class ExposureProfileRequest(BaseModel):
    home_lat: float
    home_lng: float
    office_lat: float
    office_lng: float
    travel_time_minutes: float = 40.0
    vehicle: str = "car" # 'car', 'bus', 'train', 'cycling', 'walking'
    daily_routine: Optional[List[RouteSegment]] = None

class ExposureInterval(BaseModel):
    label: str
    exposure_val: float # dosage index
    level: str # 'Low', 'Moderate', 'High'

class ExposureResponse(BaseModel):
    daily_dose: float # µg-min/m³ equivalent
    equivalent_pm25: float # µg/m³ average
    health_index: float # 0 to 100
    risk_level: str # 'low', 'moderate', 'high'
    intervals: List[ExposureInterval]
    trends: Dict[str, List[float]] # lifetime or historical trends

@router.post("", response_model=ExposureResponse)
def calculate_personal_exposure(
    profile: ExposureProfileRequest = Body(...),
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # If no custom daily routine is supplied, construct one based on home, office, and commute
    segments = profile.daily_routine
    if not segments:
        # standard 24 hours (1440 mins) breakdown:
        # Home: 14 hours (840 mins), activity: resting
        # Commute: 2 * travel_time, activity: commuting_vehicle or walking
        # Office: 9 hours (540 mins) minus commute, activity: resting
        commute_mins = profile.travel_time_minutes
        office_mins = max(120.0, 540.0 - commute_mins)
        home_mins = 1440.0 - (2 * commute_mins) - office_mins
        
        commute_activity = "commuting_vehicle"
        if profile.vehicle in ["walking", "cycling"]:
            commute_activity = profile.vehicle
            
        segments = [
            RouteSegment(name="Home", lat=profile.home_lat, lng=profile.home_lng, duration_minutes=home_mins, activity="resting"),
            RouteSegment(name="Morning Commute", lat=(profile.home_lat + profile.office_lat)/2, lng=(profile.home_lng + profile.office_lng)/2, duration_minutes=commute_mins, activity=commute_activity),
            RouteSegment(name="Office", lat=profile.office_lat, lng=profile.office_lng, duration_minutes=office_mins, activity="resting"),
            RouteSegment(name="Evening Commute", lat=(profile.home_lat + profile.office_lat)/2, lng=(profile.home_lng + profile.office_lng)/2, duration_minutes=commute_mins, activity=commute_activity)
        ]
        
    # Translate segments to the format expected by ExposureService
    # Fetch local AQI values for segments or use coordinates proxies
    readings = []
    # For speed, we will assign a reasonable simulated AQI based on coordinates
    for seg in segments:
        # Simulate base station AQI around Pune / Anand Vihar / general coords
        # Let's say: base is 80. If segment name is Commute, traffic increases it
        base_aqi = 85.0
        if "commute" in seg.name.lower():
            base_aqi = 120.0
            if profile.vehicle == "bus":
                base_aqi = 135.0 # bus stops have more diesel smoke
            elif profile.vehicle == "walking":
                base_aqi = 110.0 # open air but active
        elif "office" in seg.name.lower():
            base_aqi = 55.0 # air conditioned office filters
            
        readings.append({
            "aqi": base_aqi,
            "duration_minutes": seg.duration_minutes,
            "activity": seg.activity,
            "lat": seg.lat,
            "lng": seg.lng
        })
        
    dose_res = ExposureService.calculate_dose(readings)
    
    daily_dose = dose_res["total_dose"]
    equivalent_pm25 = dose_res["equivalent_pm25_ugm3"]
    health_index = dose_res["health_index_0_to_100"]
    
    risk_level = "low"
    if health_index > 40:
        risk_level = "moderate"
    if health_index > 75:
        risk_level = "high"
        
    # Generate intervals
    intervals = [
        ExposureInterval(label="Today", exposure_val=round(daily_dose / 100, 1), level=risk_level.title()),
        ExposureInterval(label="Weekly Projection", exposure_val=round(daily_dose * 7 / 100, 1), level=risk_level.title()),
        ExposureInterval(label="Monthly Projection", exposure_val=round(daily_dose * 30 / 100, 1), level=risk_level.title())
    ]
    
    # Generate lifetime trends (simulated monthly exposure index over 12 months)
    import json
    input_data_json = json.dumps({
        "home": [profile.home_lat, profile.home_lng],
        "office": [profile.office_lat, profile.office_lng],
        "travel_time": profile.travel_time_minutes,
        "vehicle": profile.vehicle
    })
    
    # Save score in the database
    new_exposure = ExposureScore(
        user_id=current_user.id if current_user else None,
        daily_exposure=daily_dose,
        weekly_exposure=daily_dose * 7,
        monthly_exposure=daily_dose * 30,
        lifetime_exposure=daily_dose * 365,
        risk_level=risk_level,
        input_data=input_data_json
    )
    db.add(new_exposure)
    db.commit()
    
    # Return response with lifetime trend values
    return ExposureResponse(
        daily_dose=daily_dose,
        equivalent_pm25=equivalent_pm25,
        health_index=health_index,
        risk_level=risk_level,
        intervals=intervals,
        trends={
            "months": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            "exposure_scores": [
                round(daily_dose * 30 * (1.0 + 0.15 * (i % 3 - 1)) / 100, 1)
                for i in range(12)
            ]
        }
    )
