from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime

from database.connection import get_db
from database.schema import Route, User
from auth.auth_handler import get_current_user

router = APIRouter(prefix="/routes", tags=["Route Optimizer"])

# Schemas
class RouteRequest(BaseModel):
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float
    vehicle: str = "car"

class RouteData(BaseModel):
    route_type: str # 'shortest', 'fastest', 'lowest_pollution', 'balanced'
    travel_time_minutes: float
    average_aqi: float
    exposure_score: float
    waypoints: List[List[float]] # list of [lat, lng] coordinates
    recommendation: str

class RouteResponse(BaseModel):
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float
    routes: List[RouteData]

@router.post("/safe-route", response_model=RouteResponse)
def get_safe_routes(
    request: RouteRequest = Body(...),
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    s_lat, s_lng = request.start_lat, request.start_lng
    e_lat, e_lng = request.end_lat, request.end_lng
    
    # 1. Generate path coordinates (simulating simple waypoints from start to end)
    def generate_waypoints(lat1, lng1, lat2, lng2, jitter_factor):
        # 5 points along the path
        points = []
        for i in range(5):
            fraction = i / 4.0
            lat = lat1 + (lat2 - lat1) * fraction
            lng = lng1 + (lng2 - lng1) * fraction
            if i in [1, 2, 3]:
                # Add some route shape jitter
                lat += jitter_factor * (0.01 if i == 1 else -0.01 if i == 2 else 0.005)
                lng += jitter_factor * (-0.005 if i == 1 else 0.01 if i == 2 else -0.01)
            points.append([lat, lng])
        return points

    # Route 1: Shortest (direct path, might have high traffic / congestion)
    shortest_time = 25.0
    shortest_aqi = 145.0 # high pollution due to urban traffic hotspots
    shortest_exp = shortest_time * (shortest_aqi / 100.0) * 1.2
    
    # Route 2: Fastest (uses arterial ring roads, slightly longer distance but faster, moderate pollution)
    fastest_time = 18.0
    fastest_aqi = 110.0
    fastest_exp = fastest_time * (fastest_aqi / 100.0) * 1.2
    
    # Route 3: Lowest Pollution (bypasses city centers, runs through green spaces/residential zones)
    lowest_time = 32.0
    lowest_aqi = 52.0 # significantly cleaner air
    lowest_exp = lowest_time * (lowest_aqi / 100.0) * 1.0
    
    # Route 4: Balanced (hybrid of speed and clean air)
    balanced_time = 22.0
    balanced_aqi = 78.0
    balanced_exp = balanced_time * (balanced_aqi / 100.0) * 1.1
    
    routes_list = [
        RouteData(
            route_type="shortest",
            travel_time_minutes=shortest_time,
            average_aqi=shortest_aqi,
            exposure_score=round(shortest_exp, 1),
            waypoints=generate_waypoints(s_lat, s_lng, e_lat, e_lng, 0.0),
            recommendation="Direct but highly polluted. Avoid during rush hours."
        ),
        RouteData(
            route_type="fastest",
            travel_time_minutes=fastest_time,
            average_aqi=fastest_aqi,
            exposure_score=round(fastest_exp, 1),
            waypoints=generate_waypoints(s_lat, s_lng, e_lat, e_lng, 0.4),
            recommendation="Best for speed, but passes through industrial corridors."
        ),
        RouteData(
            route_type="lowest_pollution",
            travel_time_minutes=lowest_time,
            average_aqi=lowest_aqi,
            exposure_score=round(lowest_exp, 1),
            waypoints=generate_waypoints(s_lat, s_lng, e_lat, e_lng, 1.2),
            recommendation="Breathes best! Substantially lower PM2.5 exposure; highly recommended for active travel."
        ),
        RouteData(
            route_type="balanced",
            travel_time_minutes=balanced_time,
            average_aqi=balanced_aqi,
            exposure_score=round(balanced_exp, 1),
            waypoints=generate_waypoints(s_lat, s_lng, e_lat, e_lng, 0.8),
            recommendation="Optimal compromise between speed and clean air intake."
        )
    ]
    
    # Save the selected/recommended route to the database
    import json
    new_route = Route(
        user_id=current_user.id if current_user else None,
        start_lat=s_lat,
        start_lng=s_lng,
        end_lat=e_lat,
        end_lng=e_lng,
        route_type="lowest_pollution",
        travel_time=lowest_time,
        aqi=lowest_aqi,
        exposure_score=lowest_exp,
        waypoints=json.dumps(routes_list[2].waypoints)
    )
    db.add(new_route)
    db.commit()
    
    return RouteResponse(
        start_lat=s_lat,
        start_lng=s_lng,
        end_lat=e_lat,
        end_lng=e_lng,
        routes=routes_list
    )
