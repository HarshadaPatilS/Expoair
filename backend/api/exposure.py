from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime

from database.connection import get_db
from database.schema import ExposureScore, User
from auth.auth_handler import get_current_user
from services.exposure_service import ExposureService
from services.openaq_service import OpenAQService

router = APIRouter(prefix="/exposure", tags=["Personal Exposure Engine"])

# ── Dependency ───────────────────────────────────────────────────────────────

def get_openaq():
    return OpenAQService()

# ── Schemas ──────────────────────────────────────────────────────────────────

class RouteSegment(BaseModel):
    name: str  # e.g. 'Home', 'Commute', 'Office', 'Gym'
    lat: float
    lng: float
    duration_minutes: float
    activity: str  # 'resting', 'walking', 'cycling', 'jogging', 'commuting_vehicle'


class ExposureProfileRequest(BaseModel):
    home_lat: float
    home_lng: float
    office_lat: float
    office_lng: float
    travel_time_minutes: float = 40.0
    vehicle: str = "car"  # 'car', 'bus', 'train', 'cycling', 'walking'
    daily_routine: Optional[List[RouteSegment]] = None


class ExposureInterval(BaseModel):
    label: str
    exposure_val: float  # dosage index
    level: str  # 'Low', 'Moderate', 'High'


class ExposureResponse(BaseModel):
    daily_dose: float          # µg-min/m³ equivalent
    equivalent_pm25: float     # µg/m³ average
    health_index: float        # 0 to 100
    risk_level: str            # 'low', 'moderate', 'high'
    intervals: List[ExposureInterval]
    trends: Dict[str, List[float]]  # lifetime or historical trends
    data_note: Optional[str] = None  # Set when falling back to estimated AQI


# ── AQI lookup helpers ───────────────────────────────────────────────────────

# Commute segments see elevated pollution; model this as a multiplier
# so the amplification scales correctly regardless of the live base AQI.
SEGMENT_MULTIPLIERS = {
    "home":    1.0,
    "office":  0.65,   # air-conditioned interiors filter particles
    "commute": 1.40,   # general traffic
    "bus":     1.55,   # diesel bus stops — higher than personal car
    "walking": 1.25,   # open air, lower than vehicle but still elevated
}


# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("", response_model=ExposureResponse)
async def calculate_personal_exposure(
    profile: ExposureProfileRequest = Body(...),
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
    openaq: OpenAQService = Depends(get_openaq),
):
    import json

    # If no custom daily routine, construct one from home/office/commute
    segments = profile.daily_routine
    if not segments:
        commute_mins = profile.travel_time_minutes
        office_mins = max(120.0, 540.0 - commute_mins)
        home_mins = 1440.0 - (2 * commute_mins) - office_mins

        commute_activity = "commuting_vehicle"
        if profile.vehicle in ["walking", "cycling"]:
            commute_activity = profile.vehicle

        segments = [
            RouteSegment(name="Home",            lat=profile.home_lat,   lng=profile.home_lng,   duration_minutes=home_mins,    activity="resting"),
            RouteSegment(name="Morning Commute", lat=(profile.home_lat + profile.office_lat) / 2, lng=(profile.home_lng + profile.office_lng) / 2, duration_minutes=commute_mins, activity=commute_activity),
            RouteSegment(name="Office",          lat=profile.office_lat, lng=profile.office_lng, duration_minutes=office_mins,  activity="resting"),
            RouteSegment(name="Evening Commute", lat=(profile.home_lat + profile.office_lat) / 2, lng=(profile.home_lng + profile.office_lng) / 2, duration_minutes=commute_mins, activity=commute_activity),
        ]

    # ── Fetch live AQI for each unique coordinate set ─────────────────────────
    # Cache by rounded coordinate to avoid duplicate API calls
    _coord_cache: dict[tuple, tuple[float, bool]] = {}

    readings = []
    any_fallback = False

    for seg in segments:
        coord_key = (round(seg.lat, 3), round(seg.lng, 3))

        if coord_key not in _coord_cache:
            aqi_raw, is_live = await ExposureService.get_nearest_aqi_live(
                seg.lat, seg.lng, db, openaq
            )
            _coord_cache[coord_key] = (aqi_raw, is_live)
        else:
            aqi_raw, is_live = _coord_cache[coord_key]

        if not is_live:
            any_fallback = True

        # Apply segment-context multiplier on top of the live base AQI
        seg_lower = seg.name.lower()
        if "commute" in seg_lower:
            if profile.vehicle == "bus":
                mult = SEGMENT_MULTIPLIERS["bus"]
            elif profile.vehicle == "walking":
                mult = SEGMENT_MULTIPLIERS["walking"]
            else:
                mult = SEGMENT_MULTIPLIERS["commute"]
        elif "office" in seg_lower:
            mult = SEGMENT_MULTIPLIERS["office"]
        else:
            mult = SEGMENT_MULTIPLIERS["home"]

        base_aqi = round(aqi_raw * mult, 1)

        readings.append({
            "aqi": base_aqi,
            "duration_minutes": seg.duration_minutes,
            "activity": seg.activity,
            "lat": seg.lat,
            "lng": seg.lng,
        })

    dose_res = ExposureService.calculate_dose(readings)

    daily_dose      = dose_res["total_dose"]
    equivalent_pm25 = dose_res["equivalent_pm25_ugm3"]
    health_index    = dose_res["health_index_0_to_100"]

    risk_level = "low"
    if health_index > 40:
        risk_level = "moderate"
    if health_index > 75:
        risk_level = "high"

    # Generate intervals
    intervals = [
        ExposureInterval(label="Today",              exposure_val=round(daily_dose / 100, 1), level=risk_level.title()),
        ExposureInterval(label="Weekly Projection",  exposure_val=round(daily_dose * 7  / 100, 1), level=risk_level.title()),
        ExposureInterval(label="Monthly Projection", exposure_val=round(daily_dose * 30 / 100, 1), level=risk_level.title()),
    ]

    # Persist to database
    input_data_json = json.dumps({
        "home":        [profile.home_lat,   profile.home_lng],
        "office":      [profile.office_lat, profile.office_lng],
        "travel_time": profile.travel_time_minutes,
        "vehicle":     profile.vehicle,
    })

    new_exposure = ExposureScore(
        user_id=current_user.id if current_user else None,
        daily_exposure=daily_dose,
        weekly_exposure=daily_dose * 7,
        monthly_exposure=daily_dose * 30,
        lifetime_exposure=daily_dose * 365,
        risk_level=risk_level,
        input_data=input_data_json,
    )
    db.add(new_exposure)
    db.commit()

    data_note = (
        "Using estimated AQI — connect for live data"
        if any_fallback
        else None
    )

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
            ],
        },
        data_note=data_note,
    )
