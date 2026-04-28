import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from routers import aqi, predict, health, sources

load_dotenv()

PORT = os.getenv("PORT", "8000")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from services.ml_service import MLService

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logging
    logger.info(f"ExpoAir backend started on port {PORT}")
    MLService.initialize()
    yield

app = FastAPI(
    title="ExpoAir API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware allowing specific origins for production and all for dev
# Configure via ALLOWED_ORIGINS env var, e.g. "https://expoair-dash.streamlit.app,https://expoair.app"
origins = [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "*").split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include router stubs
app.include_router(aqi.router, prefix="/api/aqi")
app.include_router(predict.router, prefix="/api/predict")
app.include_router(health.router, prefix="/api/health-score")
app.include_router(sources.router, prefix="/api/sources")

@app.get("/")
def read_root():
    return {"status": "ExpoAir API running", "version": "1.0.0", "docs": "/docs"}

@app.get("/ping")
def ping():
    return {"pong": True}

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "models_loaded": True,
        "firebase_connected": True,
        "version": "1.0.0"
    }
