from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from database.connection import get_db
from database.schema import Station, AQIRecord

router = APIRouter(prefix="/maps", tags=["Geospatial Heatmap"])

# Schemas
class HeatmapPoint(BaseModel):
    lat: float
    lng: float
    aqi: float
    weight: float # intensity weighting between 0 and 1

@router.get("/heatmap", response_model=List[HeatmapPoint])
def get_heatmap_grid(
    lat: float = Query(28.63, description="Center Latitude"),
    lng: float = Query(77.22, description="Center Longitude"),
    radius_km: float = Query(20.0, description="Heatmap radius limit"),
    db: Session = Depends(get_db)
):
    # Retrieve all recent AQI records or stations to construct the heatmap points
    # Let's generate a fine grid of points surrounding the station points
    stations = db.query(Station).all()
    points = []
    
    for s in stations:
        # Fetch the latest AQI reading for this station
        latest = db.query(AQIRecord)\
            .filter(AQIRecord.station_id == s.id)\
            .order_by(AQIRecord.timestamp.desc())\
            .first()
            
        aqi_val = latest.aqi if latest else 120.0
        
        # Add center point
        points.append(HeatmapPoint(
            lat=s.latitude,
            lng=s.longitude,
            aqi=aqi_val,
            weight=min(1.0, aqi_val / 200.0)
        ))
        
        # Generate surrounding grids (3-4 auxiliary points to create heatmap dispersion)
        for offset in [0.015, -0.015, 0.025, -0.025]:
            points.append(HeatmapPoint(
                lat=s.latitude + offset,
                lng=s.longitude - offset,
                aqi=aqi_val * 0.9,
                weight=min(1.0, (aqi_val * 0.9) / 200.0)
            ))
            points.append(HeatmapPoint(
                lat=s.latitude - offset,
                lng=s.longitude + offset,
                aqi=aqi_val * 0.85,
                weight=min(1.0, (aqi_val * 0.85) / 200.0)
            ))
            
    # If no stations are seeded or present, generate Pune center default grid
    if not points:
        for i in range(10):
            pt_lat = lat + 0.02 * (i % 3 - 1)
            pt_lng = lng + 0.02 * (i // 3 - 1)
            points.append(HeatmapPoint(
                lat=pt_lat,
                lng=pt_lng,
                aqi=85.0 + 10.0 * i,
                weight=0.5 + 0.05 * i
            ))
            
    return points
