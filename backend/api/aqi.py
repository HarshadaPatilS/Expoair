from fastapi import APIRouter, Query, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel

from database.connection import get_db
from database.schema import Station, AQIRecord, WeatherRecord
from services.openaq_service import OpenAQService
from services.weather_service import WeatherService
from services.traffic_service import TrafficService

router = APIRouter(prefix="/aqi", tags=["Air Quality Index"])

# Schemas
class StationResponse(BaseModel):
    id: int
    name: str
    latitude: float
    longitude: float

    class Config:
        from_attributes = True

class AQIResponse(BaseModel):
    aqi: float
    pm25: float
    pm10: Optional[float]
    pm1: Optional[float]
    no2: Optional[float]
    so2: Optional[float]
    lat: float
    lng: float
    source: str
    timestamp: datetime
    weather: Optional[dict] = None

class HistoryDataPoint(BaseModel):
    timestamp: datetime
    aqi: float
    pm25: float

# Service dependencies
def get_openaq(): return OpenAQService()
def get_weather(): return WeatherService()
def get_traffic(): return TrafficService()

@router.get("/stations", response_model=List[StationResponse])
def get_stations(db: Session = Depends(get_db)):
    stations = db.query(Station).all()
    return stations

@router.get("/live", response_model=AQIResponse)
async def get_live_aqi(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    openaq: OpenAQService = Depends(get_openaq),
    weather: WeatherService = Depends(get_weather),
    traffic: TrafficService = Depends(get_traffic),
    db: Session = Depends(get_db)
):
    # Heuristic data fusion:
    # 1. Look for a station in our DB within 5km
    nearest_station = None
    min_dist = float('inf')
    stations = db.query(Station).all()
    for s in stations:
        # Haversine distance
        from services.openaq_service import calculate_haversine_distance
        dist = calculate_haversine_distance(lat, lng, s.latitude, s.longitude)
        if dist < min_dist:
            min_dist = dist
            nearest_station = s
            
    # If a station is very close (e.g. < 5km), check if there is a recent record in our DB
    if nearest_station and min_dist < 5.0:
        recent_record = db.query(AQIRecord)\
            .filter(AQIRecord.station_id == nearest_station.id)\
            .order_by(AQIRecord.timestamp.desc())\
            .first()
            
        if recent_record and (datetime.utcnow() - recent_record.timestamp) < timedelta(hours=1):
            # Fetch current weather to attach
            weather_data = {}
            try:
                weather_data = await weather.get_current_weather(lat, lng)
            except Exception:
                pass
                
            return AQIResponse(
                aqi=recent_record.aqi,
                pm25=recent_record.pm25,
                pm10=recent_record.pm10,
                pm1=recent_record.pm1,
                no2=recent_record.no2,
                so2=recent_record.so2,
                lat=recent_record.lat,
                lng=recent_record.lng,
                source=f"Local Station ({nearest_station.name})",
                timestamp=recent_record.timestamp,
                weather=weather_data
            )
            
    # 2. Fall back to OpenAQ API + Weather + Traffic data fusion
    try:
        openaq_data = await openaq.get_nearest_station(lat, lng)
        weather_data = await weather.get_current_weather(lat, lng)
        traffic_idx = await traffic.get_traffic_index(lat, lng)
        
        base_pm25 = openaq_data.get("PM2.5") or 45.0
        base_aqi = openaq_data.get("AQI") or (base_pm25 * 2.1)
        
        # Weather adjustments
        weather_factor = 1.0
        if weather_data.get("precipitation", 0) > 0:
            weather_factor -= 0.15 # rain washes pollution
        if weather_data.get("wind_speed", 0) > 12.0:
            weather_factor -= 0.1 # wind disperses PM
            
        fused_pm25 = base_pm25 * weather_factor * (1.0 + (traffic_idx * 0.25))
        fused_aqi = base_aqi * weather_factor * (1.0 + (traffic_idx * 0.25))
        
        # Keep within reasonable limits
        fused_pm25 = max(2.0, fused_pm25)
        fused_aqi = max(5.0, fused_aqi)
        
        # Write this new fusion record to DB for historical analytics
        new_record = AQIRecord(
            lat=lat,
            lng=lng,
            aqi=round(fused_aqi, 1),
            pm25=round(fused_pm25, 1),
            pm10=round(fused_pm25 * 1.5, 1),
            pm1=round(fused_pm25 * 0.6, 1),
            no2=openaq_data.get("NO2") or 25.0,
            so2=openaq_data.get("SO2") or 10.0,
            temp=weather_data.get("temperature"),
            humidity=weather_data.get("humidity"),
            wind_speed=weather_data.get("wind_speed"),
            wind_dir=weather_data.get("wind_direction"),
            source="fusion_api",
            timestamp=datetime.utcnow()
        )
        db.add(new_record)
        db.commit()
        
        return AQIResponse(
            aqi=round(fused_aqi, 1),
            pm25=round(fused_pm25, 1),
            pm10=round(fused_pm25 * 1.5, 1),
            pm1=round(fused_pm25 * 0.6, 1),
            no2=new_record.no2,
            so2=new_record.so2,
            lat=lat,
            lng=lng,
            source="API Fusion Engine",
            timestamp=new_record.timestamp,
            weather=weather_data
        )
    except Exception as e:
        # Fallback completely if external APIs fail
        raise HTTPException(
            status_code=500,
            detail=f"Environmental data fusion engine error: {e}"
        )

@router.get("/history", response_model=List[HistoryDataPoint])
def get_aqi_history(
    station_id: Optional[int] = Query(None, description="Filter by local Station ID"),
    lat: Optional[float] = Query(None, description="Latitude for proximity history"),
    lng: Optional[float] = Query(None, description="Longitude for proximity history"),
    days: int = Query(7, description="Number of days history"),
    db: Session = Depends(get_db)
):
    query_time = datetime.utcnow() - timedelta(days=days)
    
    if station_id:
        records = db.query(AQIRecord)\
            .filter(AQIRecord.station_id == station_id, AQIRecord.timestamp >= query_time)\
            .order_by(AQIRecord.timestamp.asc())\
            .all()
    elif lat is not None and lng is not None:
        # Find nearest station
        nearest_station = None
        min_dist = float('inf')
        stations = db.query(Station).all()
        for s in stations:
            from services.openaq_service import calculate_haversine_distance
            dist = calculate_haversine_distance(lat, lng, s.latitude, s.longitude)
            if dist < min_dist:
                min_dist = dist
                nearest_station = s
        
        if nearest_station:
            records = db.query(AQIRecord)\
                .filter(AQIRecord.station_id == nearest_station.id, AQIRecord.timestamp >= query_time)\
                .order_by(AQIRecord.timestamp.asc())\
                .all()
        else:
            records = db.query(AQIRecord)\
                .filter(AQIRecord.timestamp >= query_time)\
                .order_by(AQIRecord.timestamp.asc())\
                .limit(100).all()
    else:
        # Just return global database updates
        records = db.query(AQIRecord)\
            .filter(AQIRecord.timestamp >= query_time)\
            .order_by(AQIRecord.timestamp.asc())\
            .limit(100).all()
            
    return [
        HistoryDataPoint(
            timestamp=r.timestamp,
            aqi=r.aqi,
            pm25=r.pm25
        ) for r in records
    ]
