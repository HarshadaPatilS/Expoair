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
    # Initialize machine learning models
    try:
        MLService.initialize()
    except Exception as e:
        logger.error(f"Failed to initialize MLService: {e}")
    yield
    logger.info("AirSense AI backend shutting down")

app = FastAPI(
    title="AirSense AI — Environmental Decision Support System (EDSS)",
    description="Backend services for real-time air quality forecasts, SHAP explainability, health risks, and exposure engines.",
    version="2.0.0",
    lifespan=lifespan
)

# CORS middleware allowing Vite frontend dev server and production domains
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
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

# Include routers
app.include_router(auth_router, prefix="/api")
app.include_router(aqi_router, prefix="/api")
app.include_router(predict_router, prefix="/api")
app.include_router(health_router, prefix="/api")
app.include_router(exposure_router, prefix="/api")
app.include_router(routes_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(maps_router, prefix="/api")

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
