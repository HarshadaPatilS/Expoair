import os
import sys
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Ensure backend directory is in python path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

load_dotenv()

PORT = os.getenv("PORT", "8000")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from services.ml_service import MLService

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"AirSense AI backend starting on port {PORT}")
    
    # Auto-initialize database tables on startup
    try:
        from database.connection import engine, Base, SessionLocal
        import database.schema  # ensure models are registered
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables initialized successfully on startup.")
        
        # Check if database is empty and auto-seed
        db = SessionLocal()
        try:
            from database.schema import Station
            if db.query(Station).count() == 0:
                logger.info("Database is empty. Auto-seeding database...")
                from database.seeds.seed_data import seed_db
                seed_db()
                logger.info("Database auto-seeded successfully.")
        except Exception as se:
            logger.error(f"Database auto-seeding failed: {se}")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Failed to initialize database tables: {e}")

    # Initialize machine learning models
    try:
        MLService.initialize()
    except Exception as e:
        logger.error(f"Failed to initialize MLService: {e}")

    # Initialize and start MQTT Service & Telemetry Simulator
    try:
        from services.mqtt_service import MQTTService
        mqtt_service = MQTTService()
        mqtt_service.start()
        logger.info("MQTT service started successfully on startup.")
    except Exception as e:
        logger.error(f"Failed to initialize or start MQTTService: {e}")

    # Pre-warm the Open-Meteo cache for all seeded stations.
    # This fires in the background so it doesn't block startup, but ensures
    # the first user request gets weather data (critical on Render cold starts).
    import asyncio
    async def _prewarm_weather():
        try:
            from services.weather_service import WeatherService
            from database.connection import SessionLocal
            from database.schema import Station
            ws = WeatherService()
            db = SessionLocal()
            try:
                station_coords = [(s.latitude, s.longitude) for s in db.query(Station).all()]
            finally:
                db.close()
            for lat, lng in station_coords:
                try:
                    await ws.get_current_weather(lat, lng)
                    logger.info(f"Weather cache pre-warmed for ({lat}, {lng})")
                except Exception as we:
                    logger.warning(f"Weather pre-warm failed for ({lat}, {lng}): {we}")
        except Exception as e:
            logger.warning(f"Weather pre-warm task failed: {e}")

    asyncio.create_task(_prewarm_weather())

    yield
    
    # Stop MQTT Service
    try:
        from services.mqtt_service import MQTTService
        mqtt_service = MQTTService()
        mqtt_service.stop()
        logger.info("MQTT service stopped successfully on shutdown.")
    except Exception as e:
        logger.error(f"Failed to stop MQTTService on shutdown: {e}")
        
    logger.info("AirSense AI backend shutting down")

app = FastAPI(
    title="AirSense AI — Environmental Decision Support System (EDSS)",
    description="Backend services for real-time air quality forecasts, SHAP explainability, health risks, and exposure engines.",
    version="2.0.0",
    lifespan=lifespan
)

# CORS middleware allowing Vite frontend dev server and production domains.
# Extra origins can be injected via the CORS_ORIGINS env var (comma-separated).
_base_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://expoair-airsense.vercel.app",
]
_extra = os.getenv("CORS_ORIGINS", "")
if _extra:
    _base_origins.extend([o.strip() for o in _extra.split(",") if o.strip()])

origins = list(dict.fromkeys(_base_origins))  # deduplicate, preserve order

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.vercel\.app",  # cover all Vercel preview URLs
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import routes
from api.auth import router as auth_router
from api.aqi import router as aqi_router
from api.predict import router as predict_router
from api.health import router as health_router
from api.exposure import router as exposure_router
from api.routes import router as routes_router
from api.chat import router as chat_router
from api.maps import router as maps_router
from api.admin import router as admin_router
from api.alerts import router as alerts_router

# Include routers
app.include_router(auth_router, prefix="/api")
app.include_router(aqi_router, prefix="/api")
app.include_router(predict_router, prefix="/api")
app.include_router(health_router, prefix="/api")
app.include_router(exposure_router, prefix="/api")
app.include_router(routes_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(maps_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(alerts_router, prefix="/api")

@app.get("/")
def read_root():
    return {
        "status": "AirSense AI EDSS API running",
        "version": "2.0.0",
        "documentation": "/docs"
    }

@app.get("/ping")
def ping():
    return {"pong": True}

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "version": "2.0.0",
        "database": "connected"
    }

@app.get("/debug-weather")
async def debug_weather():
    import httpx
    url = "https://api.open-meteo.com/v1/forecast?latitude=18.52&longitude=73.86&hourly=temperature_2m&forecast_days=1"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(url)
            return {
                "status_code": r.status_code,
                "response_preview": str(r.text)[:300],
                "reachable": r.status_code == 200
            }
    except Exception as e:
        return {"error": str(e), "reachable": False}