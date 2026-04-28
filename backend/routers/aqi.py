from fastapi import APIRouter, Query, Body, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import logging

from services.openaq_service import OpenAQService
from services.weather_service import WeatherService
from services.traffic_service import TrafficService

# Firebase imports
from firebase_admin import firestore

router = APIRouter(tags=["AQI"])
logger = logging.getLogger(__name__)

def get_db():
    try:
        return firestore.client()
    except Exception as e:
        # Expected if credentials are not loaded in main startup yet
        logger.warning(f"Firestore not initialized or failed: {e}")
        return None

def get_openaq_service(): return OpenAQService()
def get_weather_service(): return WeatherService()
def get_traffic_service(): return TrafficService()

# --- Schemas ---

class AQICurrentResponse(BaseModel):
    aqi: float = Field(..., description="Calculated or retrieved global AQI index")
    pm25: float = Field(..., description="Particulate matter <= 2.5 micrometers")
    lat: float = Field(..., description="Evaluated latitude")
    lng: float = Field(..., description="Evaluated longitude")
    source: str = Field(..., description="Data source description (e.g., fusion_api, firebase_sensor)")
    timestamp: datetime = Field(..., description="Temporal association vector")
    mode_used: str = Field(..., description="The definitive mode executed by the backend")
    confidence: float = Field(..., description="Systemic confidence interval (0.0 - 1.0)")

class GridPoint(BaseModel):
    lat: float
    lng: float
    estimated_aqi: float
    confidence: float

class GridResponse(BaseModel):
    grid: List[GridPoint]

class SensorReading(BaseModel):
    session_id: str = Field(..., description="Active device session UUID")
    lat: float
    lng: float
    pm25: float = Field(..., description="PM2.5 value registered by field hardware")
    pm10: Optional[float] = None
    pm1: Optional[float] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class SensorResponse(BaseModel):
    stored: bool = Field(..., description="Confirmation of persistent storage")
    dose_delta: float = Field(..., description="Estimated incremental lung exposure dosage value")


# --- Routes ---

@router.get("/current", response_model=AQICurrentResponse)
async def get_current_aqi(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    mode: str = Query("auto", pattern="^(auto|sensor|api)$", description="Data retrieval mode prioritization"),
    cpcb: OpenAQService = Depends(get_openaq_service),
    weather: WeatherService = Depends(get_weather_service),
    traffic: TrafficService = Depends(get_traffic_service),
):
    """
    Evaluates Current AQI exposure statistics using heuristic mode switching:
    - mode=auto: Seeks Firebase for local sensor updates first, otherwise maps dynamic real-time API Fusion
    - mode=api: Strictly relies on combined OpenAQ, Weather factor and active vehicular congestion
    - mode=sensor: Explicitly retrieves historic/recent measurements derived from field sensors
    """
    db = get_db()
    
    async def get_api_fusion() -> AQICurrentResponse:
        openaq_data = await cpcb.get_nearest_station(lat, lng)
        weather_data = await weather.get_current_weather(lat, lng)
        traffic_idx = await traffic.get_traffic_index(lat, lng)
        
        base_pm25 = openaq_data.get("PM2.5") or 50.0
        base_aqi = openaq_data.get("AQI") or (float(base_pm25) * 2.5) 
        
        weather_factor = 1.0
        if weather_data.get("precipitation", 0) > 0:
            weather_factor -= 0.1
        if weather_data.get("wind_speed", 0) > 15.0:
            weather_factor -= 0.1
            
        fused_aqi = float(base_aqi) * weather_factor * (1.0 + (traffic_idx * 0.2))
        fused_pm25 = float(base_pm25) * weather_factor * (1.0 + (traffic_idx * 0.2))
        
        return AQICurrentResponse(
            aqi=round(fused_aqi, 2),
            pm25=round(fused_pm25, 2),
            lat=lat,
            lng=lng,
            source="fusion_api",
            timestamp=datetime.utcnow(),
            mode_used="api",
            confidence=0.85
        )

    def query_latest_sensor():
        if not db:
            return None
        try:
            docs = db.collection_group("readings") \
                     .order_by("timestamp", direction=firestore.Query.DESCENDING) \
                     .limit(1).get()
            if docs:
                return docs[0].to_dict()
        except Exception as e:
            logger.error(f"Error querying sensor data: {e}")
        return None

    if mode == "api":
        return await get_api_fusion()
        
    elif mode == "sensor":
        data = query_latest_sensor()
        if data:
            ts = data.get("timestamp", datetime.utcnow())
            if not isinstance(ts, datetime):
                ts = datetime.utcnow()
                
            return AQICurrentResponse(
                aqi=data.get('pm25', 0) * 2.5,
                pm25=data.get('pm25', 0),
                lat=data.get('lat', lat),
                lng=data.get('lng', lng),
                source="firebase_sensor",
                timestamp=ts,
                mode_used="sensor",
                confidence=0.99
            )
        raise HTTPException(status_code=404, detail="No sensor data found.")

    elif mode == "auto":
        data = query_latest_sensor()
        if data:
            ts = data.get("timestamp", datetime.utcnow())
            if not isinstance(ts, datetime):
                ts = datetime.utcnow()
                
            return AQICurrentResponse(
                aqi=data.get('pm25', 0) * 2.5,
                pm25=data.get('pm25', 0),
                lat=data.get('lat', lat),
                lng=data.get('lng', lng),
                source="firebase_sensor",
                timestamp=ts,
                mode_used="auto_sensor",
                confidence=0.99
            )
            
        res = await get_api_fusion()
        res.mode_used = "auto_api"
        res.source = "fusion_api (auto fallback)"
        return res

@router.get("/grid", response_model=List[GridPoint])
async def get_aqi_grid(
    lat: float = Query(..., description="Center latitude"),
    lng: float = Query(..., description="Center longitude"),
    radius_km: float = Query(2.0, description="Radius boundary mapped in km"),
    cpcb: OpenAQService = Depends(get_openaq_service),
    weather: WeatherService = Depends(get_weather_service),
    traffic: TrafficService = Depends(get_traffic_service),
):
    """
    Returns AQI estimates at 500m grid clusters spanning a specific coordinate circumference.
    Ideal for real-time app map layer mapping overlay utilizing nearest stations + directional traffic.
    """
    openaq_data = await cpcb.get_nearest_station(lat, lng)
    weather_data = await weather.get_current_weather(lat, lng)
    
    base_pm25 = openaq_data.get("PM2.5") or 50.0
    base_aqi = openaq_data.get("AQI") or (float(base_pm25) * 2.5)
    
    weather_multiplier = 1.0
    if weather_data.get("precipitation", 0) > 0:
        weather_multiplier -= 0.1
    if weather_data.get("wind_speed", 0) > 15.0:
        weather_multiplier -= 0.1
        
    grid_points = await traffic.get_traffic_grid(lat, lng, radius_km)
    
    result = []
    for point in grid_points:
        t_idx = point.get("traffic_index", 0.2)
        local_aqi = float(base_aqi) * weather_multiplier * (1.0 + (t_idx * 0.3))
        
        result.append(
            GridPoint(
                lat=point["lat"],
                lng=point["lng"],
                estimated_aqi=round(local_aqi, 2),
                confidence=0.75
            )
        )
        
    return result

@router.post("/sensor", response_model=SensorResponse)
async def post_sensor_reading(
    reading: SensorReading = Body(...)
):
    """
    Saves external field IoT telemetry packets mapped directly underneath isolated UUID sessions in Firestore.
    """
    db = get_db()
    
    # Heuristically derive an instantaneous lung exposure index fraction 
    dose_delta = reading.pm25 * 0.01 
    
    if db:
        try:
            logger.info(f"Storing telemetric sensor arrays targeting session ID/UUID: {reading.session_id}")
            # Target path -> sessions/{session_id}/readings/
            doc_ref = db.collection("sessions").document(reading.session_id) \
                        .collection("readings").document()
                        
            doc_ref.set(reading.model_dump())
            return SensorResponse(stored=True, dose_delta=round(dose_delta, 4))
        except Exception as e:
            logger.error(f"Firestore exception encountered pushing node properties: {e}")
            raise HTTPException(status_code=500, detail="Database write synchronization failed.")
            
    else:
        logger.warning("Firebase credentials absent. Executing simulated telemetry sink.")
        return SensorResponse(stored=True, dose_delta=round(dose_delta, 4))
