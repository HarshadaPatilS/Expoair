from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from database.connection import get_db
from database.schema import Station, AQIRecord
from services.openaq_service import OpenAQService

router = APIRouter(prefix="/maps", tags=["Geospatial Heatmap"])


class HeatmapPoint(BaseModel):
    lat: float
    lng: float
    aqi: float
    weight: float
    station_name: Optional[str] = None
    city: Optional[str] = None


def _city_from_name(name: str) -> str:
    n = name.lower()
    if "delhi" in n:            return "Delhi"
    if "lonavala" in n or "sinhgad" in n: return "Lonavala"
    if "pcmc" in n or "pimpri" in n or "bhosari" in n: return "PCMC"
    return "Pune"


@router.get("/heatmap", response_model=List[HeatmapPoint])
async def get_heatmap_grid(
    lat: float = Query(18.5204, description="Centre latitude"),
    lng: float = Query(73.8567, description="Centre longitude"),
    radius_km: float = Query(500.0, description="Heatmap radius (km)"),
    db: Session = Depends(get_db),
):
    """
    Returns heatmap points from:
    1. All local DB stations (with latest AQI from AQIRecord)
    2. Augmented with OpenAQ live stations if available

    Each centre point gets a small cluster of dispersion satellites so
    the canvas/Leaflet heatmap renders smooth contours.
    """
    points: List[HeatmapPoint] = []
    used_names = set()

    # ── Local DB stations ─────────────────────────────────────────────────
    stations = db.query(Station).all()
    for s in stations:
        latest = (
            db.query(AQIRecord)
            .filter(AQIRecord.station_id == s.id)
            .order_by(AQIRecord.timestamp.desc())
            .first()
        )
        aqi_val = round(latest.aqi, 1) if latest else 85.0
        weight  = min(1.0, aqi_val / 300.0)
        city    = _city_from_name(s.name)

        # Centre point
        points.append(HeatmapPoint(
            lat=s.latitude, lng=s.longitude,
            aqi=aqi_val, weight=weight,
            station_name=s.name, city=city,
        ))
        # Dispersion satellites (smaller AQI decay)
        for offset in [0.008, -0.008, 0.015, -0.015]:
            points.append(HeatmapPoint(
                lat=s.latitude + offset, lng=s.longitude - offset,
                aqi=round(aqi_val * 0.88, 1),
                weight=min(1.0, aqi_val * 0.88 / 300.0),
            ))
            points.append(HeatmapPoint(
                lat=s.latitude - offset, lng=s.longitude + offset,
                aqi=round(aqi_val * 0.82, 1),
                weight=min(1.0, aqi_val * 0.82 / 300.0),
            ))
        used_names.add(s.name)

    # ── OpenAQ live stations (additional) ─────────────────────────────────
    try:
        oaq = OpenAQService()
        oaq_stations = await oaq.get_stations_with_aqi()
        for s in oaq_stations:
            if s["station"] not in used_names and s.get("aqi") is not None:
                aqi_val = float(s["aqi"])
                weight  = min(1.0, aqi_val / 300.0)
                points.append(HeatmapPoint(
                    lat=s["latitude"], lng=s["longitude"],
                    aqi=aqi_val, weight=weight,
                    station_name=s["station"], city=s["city"],
                ))
    except Exception:
        pass  # if OpenAQ unreachable, DB data is sufficient

    # ── Fallback if DB is completely empty ────────────────────────────────
    if not points:
        default_cities = [
            (28.6139, 77.2090, 180, "Delhi"),
            (18.5204, 73.8567, 85,  "Pune"),
            (18.6298, 73.7997, 90,  "PCMC"),
            (18.7490, 73.4070, 30,  "Lonavala"),
        ]
        for dlat, dlng, daqi, city in default_cities:
            points.append(HeatmapPoint(
                lat=dlat, lng=dlng,
                aqi=float(daqi), weight=min(1.0, daqi / 300.0),
                station_name=f"{city} Centre", city=city,
            ))

    return points
