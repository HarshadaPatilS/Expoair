import time
import logging
from typing import List, Dict, Any, Optional
import httpx
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class WeatherService:
    def __init__(self):
        self.base_url = "https://api.open-meteo.com/v1/forecast"
        
        # In-memory cache
        # Format: { "lat,lng": { "data": dict, "timestamp": float } }
        self._cache: Dict[str, Dict[str, Any]] = {}
        self.cache_ttl = 900  # 15 minutes

    def _wind_direction_to_sector(self, degrees: float) -> str:
        """Converts 0-360 degrees to one of: N, NE, E, SE, S, SW, W, NW"""
        if degrees is None:
            return ""
            
        degrees = degrees % 360
        sectors = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"]
        index = int((degrees + 22.5) / 45.0)
        return sectors[index]

    def _get_cache_key(self, lat: float, lng: float) -> str:
        return f"{round(lat, 3)},{round(lng, 3)}"

    async def _fetch_weather_data(self, lat: float, lng: float) -> Optional[Dict[str, Any]]:
        cache_key = self._get_cache_key(lat, lng)
        cached = self._cache.get(cache_key)
        
        if cached and (time.time() - cached["timestamp"] < self.cache_ttl):
            return cached["data"]

        params = {
            "latitude": lat,
            "longitude": lng,
            "hourly": "pm2_5,wind_speed_10m,wind_direction_10m,relative_humidity_2m,temperature_2m,precipitation",
            "forecast_days": 2,
            "timezone": "Asia/Kolkata"
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(self.base_url, params=params)
                response.raise_for_status()
                data = response.json()
                
                self._cache[cache_key] = {
                    "data": data,
                    "timestamp": time.time()
                }
                return data
        except httpx.HTTPError as e:
            logger.error(f"HTTP error fetching weather data: {e}")
            if cached:
                logger.info("Returning stale cached weather data due to API failure.")
                return cached["data"]
            return None
        except Exception as e:
            logger.error(f"Unexpected error fetching weather data: {e}")
            if cached:
                return cached["data"]
            return None

    def _get_current_hour_index(self, hourly_times: List[str]) -> int:
        """Finds the index of the current hour in Open-Meteo's hourly times array."""
        # Get current time in Asia/Kolkata (UTC + 5:30)
        now_utc = datetime.utcnow()
        now_ist = now_utc + timedelta(hours=5, minutes=30)
        current_hour_str = now_ist.strftime("%Y-%m-%dT%H:00")
        
        try:
            return hourly_times.index(current_hour_str)
        except ValueError:
            # Fallback to the closest time if exact hour not found
            current_prefix = now_ist.strftime("%Y-%m-%dT%H")
            for i, t in enumerate(hourly_times):
                if t.startswith(current_prefix):
                    return i
            return 0  # Default to first if totally mismatched

    async def get_current_weather(self, lat: float, lng: float) -> Dict[str, Any]:
        """Returns a dict with current hour's weather values."""
        data = await self._fetch_weather_data(lat, lng)
        if not data or "hourly" not in data or "time" not in data["hourly"]:
            return {}

        hourly = data["hourly"]
        times = hourly.get("time", [])
        if not times:
            return {}

        idx = self._get_current_hour_index(times)
        
        def get_val(key):
            arr = hourly.get(key, [])
            return arr[idx] if idx < len(arr) else None

        wind_speed = get_val("wind_speed_10m")
        wind_direction = get_val("wind_direction_10m")
        
        return {
            "wind_speed": wind_speed,
            "wind_direction": wind_direction,
            "wind_direction_sector": self._wind_direction_to_sector(wind_direction) if wind_direction is not None else "",
            "humidity": get_val("relative_humidity_2m"),
            "temperature": get_val("temperature_2m"),
            "precipitation": get_val("precipitation"),
            "pm2_5_openmeteo": get_val("pm2_5")
        }

    async def get_forecast_24h(self, lat: float, lng: float) -> List[Dict[str, Any]]:
        """Returns next 24 hours of weather fields as a list (one dict per hour)."""
        data = await self._fetch_weather_data(lat, lng)
        if not data or "hourly" not in data or "time" not in data["hourly"]:
            return []

        hourly = data["hourly"]
        times = hourly.get("time", [])
        if not times:
            return []

        start_idx = self._get_current_hour_index(times)
        # Next 24 hours including the current hour
        end_idx = min(start_idx + 24, len(times))

        forecast = []
        for idx in range(start_idx, end_idx):
            wind_speed = hourly.get("wind_speed_10m", [])[idx] if idx < len(hourly.get("wind_speed_10m", [])) else None
            wind_direction = hourly.get("wind_direction_10m", [])[idx] if idx < len(hourly.get("wind_direction_10m", [])) else None
            
            forecast.append({
                "time": times[idx],
                "wind_speed": wind_speed,
                "wind_direction": wind_direction,
                "wind_direction_sector": self._wind_direction_to_sector(wind_direction) if wind_direction is not None else "",
                "humidity": hourly.get("relative_humidity_2m", [])[idx] if idx < len(hourly.get("relative_humidity_2m", [])) else None,
                "temperature": hourly.get("temperature_2m", [])[idx] if idx < len(hourly.get("temperature_2m", [])) else None,
                "precipitation": hourly.get("precipitation", [])[idx] if idx < len(hourly.get("precipitation", [])) else None,
                "pm2_5_openmeteo": hourly.get("pm2_5", [])[idx] if idx < len(hourly.get("pm2_5", [])) else None,
            })
            
        return forecast
