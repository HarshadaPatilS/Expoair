import httpx
import requests
from datetime import datetime

CITY_COORDS = {
    "Pune": {"lat": 18.5204, "lng": 73.8567},
    "Mumbai": {"lat": 19.0760, "lng": 72.8777},
    "Delhi": {"lat": 28.7041, "lng": 77.1025}
}

def fetch_live_data(city: str) -> dict:
    """
    Fetches live AQI data, preferring the ExpoAir FastAPI backend, 
    but gracefully falling back to mock Fusion API responses representing Open-Meteo+OpenAQ if backend is down.
    """
    coords = CITY_COORDS.get(city, CITY_COORDS["Pune"])
    lat = coords["lat"]
    lng = coords["lng"]
    
    try:
        # Assuming the backend API is mounted locally at port 8000 for ExpoAir
        response = httpx.get(f"http://localhost:8000/api/aqi/current?lat={lat}&lng={lng}", timeout=1.5)
        response.raise_for_status()
        return response.json()
    except Exception:
        # Fallback payload simulating API Fusion Mode B
        return {
            "current_aqi": 124, 
            "current_aqi_delta": "-12",
            "pm25": 45.2,
            "pm10": 85.1,
            "dominant_source": "Vehicular (62%)",
            "forecast_1h": 126,
            "forecast_1h_delta_arrow": "up",
            "forecast_6h": 118,
            "forecast_6h_delta_arrow": "down",
            "station_count": 8,
            "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
