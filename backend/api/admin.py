from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
import logging

from database.connection import get_db
from database.schema import Station, AQIRecord, Prediction, User, ModelVersion
from database.seeds.seed_data import seed_db
from services.ml_service import MLService

router = APIRouter(prefix="/admin", tags=["Admin Operations"])
logger = logging.getLogger(__name__)


@router.post("/seed")
async def trigger_db_seed(db: Session = Depends(get_db)):
    """Seed the database with stations across Delhi, Pune, PCMC and Lonavala,
    plus 7 days of realistic historical AQI records."""
    try:
        logger.info("Admin triggered database seeding.")
        seed_db()
        station_count = db.query(Station).count()
        record_count  = db.query(AQIRecord).count()
        return {
            "status": "success",
            "message": (
                f"Database seeded successfully! "
                f"Created {station_count} stations and {record_count} historical AQI records."
            ),
        }
    except Exception as e:
        logger.error(f"Error during database seeding: {e}")
        raise HTTPException(status_code=500, detail=f"Database seeding failed: {e}")


@router.get("/status")
async def get_system_status(db: Session = Depends(get_db)):
    """Returns a complete system health report for the Admin Panel."""
    from datetime import datetime, timedelta

    # ── Database stats ────────────────────────────────────────────────────
    station_count     = db.query(Station).count()
    aqi_record_count  = db.query(AQIRecord).count()
    prediction_count  = db.query(Prediction).count()
    user_count        = db.query(User).count()

    # Latest AQI record
    latest_record = db.query(AQIRecord).order_by(AQIRecord.timestamp.desc()).first()
    latest_ts = latest_record.timestamp.isoformat() if latest_record else None

    # Records in last 24 h
    cutoff = datetime.utcnow() - timedelta(hours=24)
    recent_24h = db.query(AQIRecord).filter(AQIRecord.timestamp >= cutoff).count()

    # ── ML model status ───────────────────────────────────────────────────
    ml_status = MLService.status()
    model_versions = db.query(ModelVersion).all()
    models_info = [
        {
            "name": m.name,
            "version": m.version,
            "accuracy": m.accuracy,
            "status": m.status,
            "filepath": m.filepath,
        }
        for m in model_versions
    ]

    # ── OpenAQ API reachability ───────────────────────────────────────────
    openaq_reachable = False
    try:
        import httpx, os
        api_key = os.getenv("OPENAQ_API_KEY", "")
        headers = {"X-API-Key": api_key} if api_key else {}
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get("https://api.openaq.org/v3/locations?limit=1", headers=headers)
            openaq_reachable = r.status_code == 200
    except Exception:
        pass

    # ── Open-Meteo reachability ───────────────────────────────────────────
    openmeteo_reachable = False
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(
                "https://api.open-meteo.com/v1/forecast"
                "?latitude=18.52&longitude=73.86&hourly=temperature_2m&forecast_days=1"
            )
            openmeteo_reachable = r.status_code == 200
    except Exception:
        pass

    # ── MQTT/ESP32 status ─────────────────────────────────────────────────
    from services.mqtt_service import MQTTService
    mqtt_service = MQTTService()
    if not mqtt_service.running:
        mqtt_mode = "offline"
    elif mqtt_service.local_simulation:
        mqtt_mode = "simulator"
    elif mqtt_service.connected:
        mqtt_mode = "hardware"
    else:
        mqtt_mode = "offline"

    return {
        "timestamp": datetime.utcnow().isoformat(),
        "database": {
            "stations":         station_count,
            "aqi_records":      aqi_record_count,
            "predictions":      prediction_count,
            "users":            user_count,
            "records_24h":      recent_24h,
            "latest_record_at": latest_ts,
        },
        "ml_models": {
            "lstm_loaded":     ml_status["lstm_loaded"],
            "xgb_loaded":      ml_status["xgb_loaded"],
            "scalers_loaded":  ml_status["scalers_loaded"],
            "registered":      models_info,
        },
        "external_apis": {
            "openaq":     "reachable" if openaq_reachable else "unreachable",
            "open_meteo": "reachable" if openmeteo_reachable else "unreachable",
        },
        "mqtt": {
            "connected": mqtt_service.connected,
            "mode": mqtt_mode,
        },
    }


@router.get("/mqtt-status")
async def get_mqtt_status():
    """Returns the current MQTT/ESP32 connection and mode status."""
    from services.mqtt_service import MQTTService
    service = MQTTService()
    if not service.running:
        mode = "offline"
    elif service.local_simulation:
        mode = "simulator"
    elif service.connected:
        mode = "hardware"
    else:
        mode = "offline"
    return {
        "connected": service.connected,
        "mode": mode
    }


@router.get("/model-status")
async def get_model_status():
    """Returns the loaded status of ML models."""
    return MLService.status()

