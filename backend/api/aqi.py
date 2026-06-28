from fastapi import APIRouter, Query, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel

from database.connection import get_db
from database.schema import Station, AQIRecord, WeatherRecord
from services.openaq_service import OpenAQService, pm25_to_aqi
from services.weather_service import WeatherService
from services.traffic_service import TrafficService

router = APIRouter(prefix="/aqi", tags=["Air Quality Index"])


# ── Pydantic schemas ────────────────────────────────────────────────────────

class StationResponse(BaseModel):
    id: int
    name: str
    latitude: float
    longitude: float

    class Config:
        from_attributes = True


class LiveStationResponse(BaseModel):
    id: Optional[int] = None
    name: str
    latitude: float
    longitude: float
    city: str
    aqi: Optional[float] = None
    pm25: Optional[float] = None
    source: str  # "db" | "openaq"


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


# ── Dependency helpers ──────────────────────────────────────────────────────

def get_openaq():
    return OpenAQService()

def get_weather():
    return WeatherService()

def get_traffic():
    return TrafficService()


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/stations", response_model=List[StationResponse])
def get_stations(db: Session = Depends(get_db)):
    """Return all locally-seeded monitoring stations."""
    return db.query(Station).all()


@router.get("/stations/live", response_model=List[LiveStationResponse])
async def get_live_stations(
    openaq: OpenAQService = Depends(get_openaq),
    db: Session = Depends(get_db),
):
    """
    Return stations from both the local DB and OpenAQ, each annotated
    with their latest AQI reading.  DB stations take precedence.
    """
    combined: List[LiveStationResponse] = []

    # 1. All locally-seeded stations with their latest DB record
    db_stations = db.query(Station).all()
    db_used_names = set()
    for s in db_stations:
        latest = (
            db.query(AQIRecord)
            .filter(AQIRecord.station_id == s.id)
            .order_by(AQIRecord.timestamp.desc())
            .first()
        )
        # Determine city from name heuristic
        name_lower = s.name.lower()
        if "delhi" in name_lower:
            city = "Delhi"
        elif "lonavala" in name_lower or "sinhgad" in name_lower:
            city = "Lonavala"
        elif "pcmc" in name_lower or "pimpri" in name_lower or "bhosari" in name_lower:
            city = "PCMC"
        else:
            city = "Pune"

        combined.append(LiveStationResponse(
            id=s.id,
            name=s.name,
            latitude=s.latitude,
            longitude=s.longitude,
            city=city,
            aqi=round(latest.aqi, 1) if latest else None,
            pm25=round(latest.pm25, 1) if latest else None,
            source="db",
        ))
        db_used_names.add(s.name)

    # 2. Augment with any additional OpenAQ stations not already in DB
    try:
        oaq_stations = await openaq.get_stations_with_aqi()
        for s in oaq_stations:
            if s["station"] not in db_used_names:
                combined.append(LiveStationResponse(
                    id=None,
                    name=s["station"],
                    latitude=s["latitude"],
                    longitude=s["longitude"],
                    city=s["city"],
                    aqi=s.get("aqi"),
                    pm25=s.get("pm25"),
                    source="openaq",
                ))
    except Exception as e:
        pass  # don't fail if OpenAQ is unreachable

    return combined


@router.get("/live", response_model=AQIResponse)
async def get_live_aqi(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    openaq: OpenAQService = Depends(get_openaq),
    weather: WeatherService = Depends(get_weather),
    traffic: TrafficService = Depends(get_traffic),
    db: Session = Depends(get_db),
):
    """
    Data fusion engine:
    1. Check local DB for a recent record from a nearby station (< 5 km, < 1 h old)
    2. Fall back to OpenAQ nearest station + Open-Meteo weather + traffic fusion
    """
    from services.openaq_service import calculate_haversine_distance

    # Step 1 — local DB lookup
    nearest_station = None
    min_dist = float("inf")
    for s in db.query(Station).all():
        d = calculate_haversine_distance(lat, lng, s.latitude, s.longitude)
        if d < min_dist:
            min_dist = d
            nearest_station = s

    if nearest_station and min_dist < 5.0:
        recent = (
            db.query(AQIRecord)
            .filter(AQIRecord.station_id == nearest_station.id)
            .order_by(AQIRecord.timestamp.desc())
            .first()
        )
        if recent and (datetime.utcnow() - recent.timestamp) < timedelta(hours=1):
            weather_data = {}
            try:
                weather_data = await weather.get_current_weather(lat, lng)
            except Exception:
                pass
            return AQIResponse(
                aqi=recent.aqi, pm25=recent.pm25, pm10=recent.pm10,
                pm1=recent.pm1, no2=recent.no2, so2=recent.so2,
                lat=recent.lat, lng=recent.lng,
                source=f"Local Station ({nearest_station.name})",
                timestamp=recent.timestamp, weather=weather_data,
            )

    # Step 2 — OpenAQ + weather + traffic fusion
    try:
        oaq = await openaq.get_nearest_station(lat, lng)
        weather_data = await weather.get_current_weather(lat, lng)
        traffic_idx = await traffic.get_traffic_index(lat, lng)

        # Prefer OpenAQ PM2.5; fall back to Open-Meteo pm2_5
        base_pm25 = (
            oaq.get("PM2.5")
            or weather_data.get("pm2_5_openmeteo")
            or 45.0
        )
        base_aqi = oaq.get("AQI") or pm25_to_aqi(base_pm25)

        # Meteorological adjustments
        weather_factor = 1.0
        if weather_data.get("precipitation", 0) > 0:
            weather_factor -= 0.15   # rain washes particles
        ws = weather_data.get("wind_speed") or 0
        if ws > 12.0:
            weather_factor -= 0.10   # wind disperses PM

        fused_pm25 = max(2.0, base_pm25 * weather_factor * (1.0 + traffic_idx * 0.25))
        fused_aqi  = max(5.0, base_aqi  * weather_factor * (1.0 + traffic_idx * 0.25))

        new_rec = AQIRecord(
            lat=lat, lng=lng,
            aqi=round(fused_aqi, 1), pm25=round(fused_pm25, 1),
            pm10=round(fused_pm25 * 1.5, 1), pm1=round(fused_pm25 * 0.6, 1),
            no2=oaq.get("NO2") or 25.0, so2=oaq.get("SO2") or 10.0,
            temp=weather_data.get("temperature"),
            humidity=weather_data.get("humidity"),
            wind_speed=weather_data.get("wind_speed"),
            wind_dir=weather_data.get("wind_direction"),
            source="fusion_api",
            timestamp=datetime.utcnow(),
        )
        db.add(new_rec)
        db.commit()

        station_label = oaq.get("station") or "OpenAQ Nearest"
        return AQIResponse(
            aqi=round(fused_aqi, 1), pm25=round(fused_pm25, 1),
            pm10=round(fused_pm25 * 1.5, 1), pm1=round(fused_pm25 * 0.6, 1),
            no2=new_rec.no2, so2=new_rec.so2,
            lat=lat, lng=lng,
            source=f"API Fusion · {station_label}",
            timestamp=new_rec.timestamp,
            weather=weather_data,
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Environmental data fusion engine error: {e}",
        )


@router.get("/history", response_model=List[HistoryDataPoint])
def get_aqi_history(
    station_id: Optional[int] = Query(None),
    lat: Optional[float] = Query(None),
    lng: Optional[float] = Query(None),
    days: int = Query(7),
    db: Session = Depends(get_db),
):
    from services.openaq_service import calculate_haversine_distance

    cutoff = datetime.utcnow() - timedelta(days=days)
    q = db.query(AQIRecord).filter(AQIRecord.timestamp >= cutoff)

    if station_id:
        q = q.filter(AQIRecord.station_id == station_id)
    elif lat is not None and lng is not None:
        # find nearest station in DB
        nearest, min_d = None, float("inf")
        for s in db.query(Station).all():
            d = calculate_haversine_distance(lat, lng, s.latitude, s.longitude)
            if d < min_d:
                min_d = d
                nearest = s
        if nearest:
            q = q.filter(AQIRecord.station_id == nearest.id)

    records = q.order_by(AQIRecord.timestamp.asc()).limit(200).all()
    return [HistoryDataPoint(timestamp=r.timestamp, aqi=r.aqi, pm25=r.pm25) for r in records]
