import time
import math
from datetime import datetime
from fastapi import APIRouter, Query, HTTPException

from services.ml_service import MLService
from services.openaq_service import OpenAQService
from services.weather_service import WeatherService
from services.traffic_service import TrafficService

router = APIRouter()

# Simple dictionary-based TTL caching
cache_aqi = {}
cache_source = {}

def get_from_cache(cache_dict, key, ttl=600):
    if key in cache_dict:
        data, timestamp = cache_dict[key]
        if time.time() - timestamp < ttl:
            return data
    return None

def set_to_cache(cache_dict, key, data):
    cache_dict[key] = (data, time.time())

def round_coord(val: float) -> str:
    # Round to nearest 0.005 degrees
    return f"{round(val / 0.005) * 0.005:.3f}"

def get_cache_key_aqi(lat: float, lng: float):
    return f"{round_coord(lat)}_{round_coord(lng)}_aqi"

def get_cache_key_source(lat: float, lng: float):
    return f"{round_coord(lat)}_{round_coord(lng)}_source"


@router.get("/aqi")
async def predict_aqi(lat: float = Query(...), lng: float = Query(...)):
    key = get_cache_key_aqi(lat, lng)
    cached_val = get_from_cache(cache_aqi, key)
    if cached_val:
        return cached_val
        
    openaq_service = OpenAQService()
    openaq_station = await openaq_service.get_nearest_station(lat, lng)
    current_weather = WeatherService.get_weather((lat, lng))
    
    # We stub 24 hours of feature dicts for demonstration
    # Ideally, we would fetch historical 24h data from OpenAQService
    features_24h = []
    import random
    
    for i in range(24):
       hour = (datetime.now().hour - 24 + i) % 24
       feature = {
           'pm25': random.uniform(20, 100),
           'no2': random.uniform(10, 50),
           'wind_speed': current_weather.get('wind_speed_kmh', 5.0),
           'wind_dir_sin': math.sin(math.radians(current_weather.get('wind_dir', 0.0))),
           'wind_dir_cos': math.cos(math.radians(current_weather.get('wind_dir', 0.0))),
           'humidity': current_weather.get('humidity', 50.0),
           'temp': current_weather.get('temperature', 25.0),
           'traffic_index': random.uniform(1, 10),
           'hour_sin': math.sin(2 * math.pi * hour / 24),
           'hour_cos': math.cos(2 * math.pi * hour / 24),
           'day_of_week': datetime.now().weekday()
       }
       features_24h.append(feature)
       
    # Merge latest station data as the final real observation
    if openaq_station and openaq_station.get('PM2.5'):
        features_24h[-1]['pm25'] = float(openaq_station.get('PM2.5'))
        features_24h[-1]['no2'] = float(openaq_station.get('NO2', features_24h[-1]['no2']))
        
    result = MLService.predict_aqi_ahead(features_24h)
    
    set_to_cache(cache_aqi, key, result)
    return result


@router.get("/source")
async def predict_source(lat: float = Query(...), lng: float = Query(...)):
    key = get_cache_key_source(lat, lng)
    cached_val = get_from_cache(cache_source, key)
    if cached_val:
        return cached_val
        
    openaq_service = OpenAQService()
    openaq_station = await openaq_service.get_nearest_station(lat, lng)
    if not openaq_station:
        raise HTTPException(status_code=404, detail="No OpenAQ station nearby to analyze source.")
        
    pm25 = float(openaq_station.get('PM2.5', 50))
    pm10 = float(openaq_station.get('PM10', 80))
    
    current_weather = WeatherService.get_weather((lat, lng))
    wind_dir = current_weather.get('wind_dir', 0.0)
    
    current_reading = {
        'pm25': pm25,
        'pm10': pm10,
        'pm1': pm25 * 0.6,
        'no2': float(openaq_station.get('NO2', 30)),
        'so2': float(openaq_station.get('SO2', 15)),
        'pm1_pm25_ratio': 0.6,
        'pm10_pm25_ratio': pm10 / max(pm25, 1),
        'wind_dir_sector': int(wind_dir // 45) % 8, 
        'hour': datetime.now().hour,
        'month': datetime.now().month,
        'is_weekend': int(datetime.now().weekday() >= 5)
    }
    
    result = MLService.fingerprint_source(current_reading)
    
    set_to_cache(cache_source, key, result)
    return result
