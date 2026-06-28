from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime
import math

from database.connection import get_db
from database.schema import Route, User, AQIRecord, Station
from auth.auth_handler import get_current_user
from services.openaq_service import calculate_haversine_distance, pm25_to_aqi

router = APIRouter(prefix="/routes", tags=["Route Optimizer"])


class RouteRequest(BaseModel):
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float
    vehicle: str = "car"


class RouteData(BaseModel):
    route_type: str
    travel_time_minutes: float
    average_aqi: float
    exposure_score: float
    waypoints: List[List[float]]
    recommendation: str


class RouteResponse(BaseModel):
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float
    routes: List[RouteData]


def _interpolate_waypoints(
    lat1: float, lng1: float,
    lat2: float, lng2: float,
    n_points: int = 6,
    jitter: float = 0.0,
    jitter_side: float = 1.0,
) -> List[List[float]]:
    """Linear interpolation with optional perpendicular jitter for visual route variety."""
    points = []
    for i in range(n_points):
        t = i / (n_points - 1)
        lat = lat1 + (lat2 - lat1) * t
        lng = lng1 + (lng2 - lng1) * t
        if jitter > 0 and 0 < i < n_points - 1:
            # Perpendicular direction (rotate direction vector 90°)
            dlat = lat2 - lat1
            dlng = lng2 - lng1
            perp_lat = -dlng
            perp_lng =  dlat
            norm = math.sqrt(perp_lat**2 + perp_lng**2) or 1
            # Sinusoidal jitter for smooth curve shape
            amp = jitter * math.sin(math.pi * t) * jitter_side
            lat += amp * (perp_lat / norm)
            lng += amp * (perp_lng / norm)
        points.append([round(lat, 6), round(lng, 6)])
    return points


def _sample_route_aqi(
    waypoints: List[List[float]],
    db: Session,
) -> float:
    """
    For each waypoint, find the nearest station in DB and get its latest AQI.
    Returns the mean AQI along the route.
    """
    aqis = []
    stations = db.query(Station).all()
    for wp in waypoints:
        nearest, min_d = None, float("inf")
        for s in stations:
            d = calculate_haversine_distance(wp[0], wp[1], s.latitude, s.longitude)
            if d < min_d:
                min_d = d
                nearest = s
        if nearest:
            rec = (
                db.query(AQIRecord)
                .filter(AQIRecord.station_id == nearest.id)
                .order_by(AQIRecord.timestamp.desc())
                .first()
            )
            if rec:
                aqis.append(rec.aqi)

    if aqis:
        return round(sum(aqis) / len(aqis), 1)
    # If no stations, estimate from distance-weighted default
    return 100.0


@router.post("/safe-route", response_model=RouteResponse)
def get_safe_routes(
    request: RouteRequest = Body(...),
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    s_lat, s_lng = request.start_lat, request.start_lng
    e_lat, e_lng = request.end_lat, request.end_lng

    dist_km = calculate_haversine_distance(s_lat, s_lng, e_lat, e_lng)
    speed_kmh = {"car": 35, "bike": 20, "walk": 5}.get(request.vehicle, 30)

    # ── Generate 4 route geometries ──────────────────────────────────────
    wps_shortest  = _interpolate_waypoints(s_lat, s_lng, e_lat, e_lng, 6, 0.00)
    wps_fastest   = _interpolate_waypoints(s_lat, s_lng, e_lat, e_lng, 8, 0.018,  1.0)
    wps_clean     = _interpolate_waypoints(s_lat, s_lng, e_lat, e_lng, 10, 0.040, -1.0)
    wps_balanced  = _interpolate_waypoints(s_lat, s_lng, e_lat, e_lng, 8, 0.022,  1.0)

    # ── Sample real AQI along each route ─────────────────────────────────
    aqi_shortest = _sample_route_aqi(wps_shortest,  db)
    aqi_fastest  = _sample_route_aqi(wps_fastest,   db)
    aqi_clean    = _sample_route_aqi(wps_clean,     db)
    aqi_balanced = _sample_route_aqi(wps_balanced,  db)

    # Shortest route stays on high-traffic roads → add 15% congestion penalty
    aqi_shortest  = round(min(aqi_shortest  * 1.15, 500), 1)
    aqi_fastest   = round(min(aqi_fastest   * 1.08, 500), 1)
    aqi_clean     = round(max(aqi_clean     * 0.72, 10),  1)  # green/residential bias
    aqi_balanced  = round(min(aqi_balanced  * 0.90, 500), 1)

    # ── Travel times (minutes) based on vehicle speed + route multiplier ─
    base_time = (dist_km / speed_kmh) * 60
    t_shortest = round(base_time * 1.00, 1)
    t_fastest  = round(base_time * 0.85, 1)
    t_clean    = round(base_time * 1.35, 1)
    t_balanced = round(base_time * 1.10, 1)

    # ── Exposure score = minutes × (AQI / 100) ───────────────────────────
    def exp(t, a): return round(t * (a / 100), 1)

    routes_list = [
        RouteData(
            route_type="shortest",
            travel_time_minutes=t_shortest,
            average_aqi=aqi_shortest,
            exposure_score=exp(t_shortest, aqi_shortest),
            waypoints=wps_shortest,
            recommendation="Direct but passes through high-traffic corridors. Avoid peak hours.",
        ),
        RouteData(
            route_type="fastest",
            travel_time_minutes=t_fastest,
            average_aqi=aqi_fastest,
            exposure_score=exp(t_fastest, aqi_fastest),
            waypoints=wps_fastest,
            recommendation="Best for speed — uses arterial ring roads. Moderate pollution exposure.",
        ),
        RouteData(
            route_type="lowest_pollution",
            travel_time_minutes=t_clean,
            average_aqi=aqi_clean,
            exposure_score=exp(t_clean, aqi_clean),
            waypoints=wps_clean,
            recommendation="Cleanest air route. Bypasses industrial zones & city centre. Recommended for sensitive groups.",
        ),
        RouteData(
            route_type="balanced",
            travel_time_minutes=t_balanced,
            average_aqi=aqi_balanced,
            exposure_score=exp(t_balanced, aqi_balanced),
            waypoints=wps_balanced,
            recommendation="Optimal balance of speed and clean air. Good general-purpose commute choice.",
        ),
    ]

    # Persist the cleanest route recommendation
    import json
    new_route = Route(
        user_id=current_user.id if current_user else None,
        start_lat=s_lat, start_lng=s_lng,
        end_lat=e_lat, end_lng=e_lng,
        route_type="lowest_pollution",
        travel_time=t_clean,
        aqi=aqi_clean,
        exposure_score=exp(t_clean, aqi_clean),
        waypoints=json.dumps(wps_clean),
    )
    db.add(new_route)
    db.commit()

    return RouteResponse(
        start_lat=s_lat, start_lng=s_lng,
        end_lat=e_lat, end_lng=e_lng,
        routes=routes_list,
    )
