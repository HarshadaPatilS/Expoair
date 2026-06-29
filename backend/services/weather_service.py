import time
import logging
import os
import math
from typing import List, Dict, Any, Optional
import httpx
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class WeatherService:
    # Class-level cache shared across ALL instances (and therefore all requests).
    # Instance-level cache is reset on every `WeatherService()` construction,
    # which happens once per request via FastAPI dependency injection — making
    # the cache completely useless. Class-level fixes this.
    _cache: Dict[str, Dict[str, Any]] = {}
    cache_ttl: int = 7200  # 2 h TTL — avoids Open-Meteo rate limits

    def __init__(self):
        base = os.getenv("OPENMETEO_BASE_URL", "https://api.open-meteo.com/v1")
        self.base_url = f"{base}/forecast"


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
            "hourly": "wind_speed_10m,wind_direction_10m,relative_humidity_2m,temperature_2m,precipitation",
            "forecast_days": 2,
            "timezone": "Asia/Kolkata"
        }

        # Retry up to 3 times with exponential backoff (handles 429 and transient errors)
        import asyncio
        for attempt in range(3):
            try:
                timeout = 15.0 + attempt * 5  # 15s, 20s, 25s — generous for Render
                async with httpx.AsyncClient(timeout=timeout) as client:
                    response = await client.get(self.base_url, params=params)
                    if response.status_code == 429:
                        wait = 2 ** attempt  # 1s, 2s, 4s
                        logger.warning(f"Open-Meteo rate limited (429). Retry {attempt+1}/3 in {wait}s.")
                        if attempt < 2:
                            await asyncio.sleep(wait)
                            continue
                        # All retries exhausted — return stale cache or None
                        return cached["data"] if cached else None
                    response.raise_for_status()
                    data = response.json()
                    self._cache[cache_key] = {"data": data, "timestamp": time.time()}
                    return data
            except httpx.TimeoutException as e:
                logger.warning(f"Open-Meteo timeout (attempt {attempt+1}/3): {e}")
                if attempt < 2:
                    await asyncio.sleep(2 ** attempt)
                    continue
                return cached["data"] if cached else None
            except httpx.HTTPError as e:
                logger.error(f"Open-Meteo HTTP error: {e}")
                return cached["data"] if cached else None
            except Exception as e:
                logger.error(f"Open-Meteo unexpected error: {e}")
                return cached["data"] if cached else None
        return cached["data"] if cached else None

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

    def _generate_fallback_weather(self, lat: float, lng: float) -> Dict[str, Any]:
        """Generates realistic simulated weather data as a fallback when Open-Meteo is rate-limited or offline."""
        now = datetime.utcnow() + timedelta(hours=5, minutes=30)  # IST
        hour = now.hour
        month = now.month

        # Temperature baseline by month (general Indian sub-tropical climate)
        # Delhi is hotter/colder, Pune/Lonavala are more moderate.
        is_north = lat > 25.0  # Delhi-like
        is_hill = lat > 18.6 and lng < 73.5  # Lonavala-like
        
        # Monthly base temperatures
        monthly_temp_base = {
            1: 15.0, 2: 18.0, 3: 24.0, 4: 30.0, 5: 33.0, 6: 30.0,
            7: 27.0, 8: 26.0, 9: 27.0, 10: 25.0, 11: 20.0, 12: 16.0
        }
        base_t = monthly_temp_base.get(month, 25.0)
        
        if is_north:
            # Delhi gets colder in winter, hotter in summer
            if month in (12, 1): base_t -= 5.0
            elif month in (5, 6): base_t += 7.0
        elif is_hill:
            # Lonavala is cooler
            base_t -= 4.0

        # Diurnal variation: coldest at 5 AM, hottest at 3 PM (15h)
        diurnal = -math.cos((hour - 5) * 2 * math.pi / 24)  # ranges from -1 to 1
        temp = base_t + diurnal * 5.0
        
        # Humidity is inversely proportional to temperature + seasonal monsoon influence
        base_h = 45.0
        if month in (6, 7, 8, 9):
            base_h = 80.0
        elif is_hill:
            base_h += 15.0
            
        humidity = max(15.0, min(98.0, base_h - diurnal * 20.0))
        
        # Wind speed (typically 5 to 15 km/h)
        wind_speed = round(8.0 + math.sin(hour * math.pi / 12) * 4.0 + (5.0 if month in (6, 7) else 0.0), 1)
        wind_direction = (hour * 15) % 360
        
        # Precipitation (monsoon check)
        precipitation = 0.0
        if month in (6, 7, 8, 9) and hour in (14, 15, 16, 17, 18, 19, 20):
            precipitation = 1.5 if (hash(f"{now.date()}-{hour}") % 10 < 3) else 0.0

        return {
            "temperature": round(temp, 1),
            "humidity": round(humidity, 1),
            "wind_speed": wind_speed,
            "wind_direction": wind_direction,
            "wind_direction_sector": self._wind_direction_to_sector(wind_direction),
            "precipitation": precipitation,
            "pm2_5_openmeteo": 35.0
        }

    def _generate_fallback_forecast(self, lat: float, lng: float) -> List[Dict[str, Any]]:
        """Generates realistic 24h weather forecast fallback when API is unavailable."""
        forecast = []
        now = datetime.utcnow() + timedelta(hours=5, minutes=30)
        
        for i in range(24):
            hour_time = now + timedelta(hours=i)
            hour = hour_time.hour
            month = hour_time.month
            
            is_north = lat > 25.0
            is_hill = lat > 18.6 and lng < 73.5
            
            monthly_temp_base = {
                1: 15.0, 2: 18.0, 3: 24.0, 4: 30.0, 5: 33.0, 6: 30.0,
                7: 27.0, 8: 26.0, 9: 27.0, 10: 25.0, 11: 20.0, 12: 16.0
            }
            base_t = monthly_temp_base.get(month, 25.0)
            if is_north:
                if month in (12, 1): base_t -= 5.0
                elif month in (5, 6): base_t += 7.0
            elif is_hill:
                base_t -= 4.0
                
            diurnal = -math.cos((hour - 5) * 2 * math.pi / 24)
            temp = base_t + diurnal * 5.0
            
            base_h = 45.0
            if month in (6, 7, 8, 9):
                base_h = 80.0
            elif is_hill:
                base_h += 15.0
                
            humidity = max(15.0, min(98.0, base_h - diurnal * 20.0))
            wind_speed = round(8.0 + math.sin(hour * math.pi / 12) * 4.0 + (5.0 if month in (6, 7) else 0.0), 1)
            wind_direction = (hour * 15) % 360
            
            precipitation = 0.0
            if month in (6, 7, 8, 9) and hour in (14, 15, 16, 17, 18, 19, 20):
                precipitation = 1.5 if (hash(f"{hour_time.date()}-{hour}") % 10 < 3) else 0.0
                
            forecast.append({
                "time": hour_time.strftime("%Y-%m-%dT%H:00"),
                "wind_speed": wind_speed,
                "wind_direction": wind_direction,
                "wind_direction_sector": self._wind_direction_to_sector(wind_direction),
                "humidity": round(humidity, 1),
                "temperature": round(temp, 1),
                "precipitation": precipitation,
                "pm2_5_openmeteo": 35.0,
            })
        return forecast

    async def get_current_weather(self, lat: float, lng: float) -> Dict[str, Any]:
        """Returns a dict with current hour's weather values."""
        data = await self._fetch_weather_data(lat, lng)
        if not data or "hourly" not in data or "time" not in data["hourly"]:
            return self._generate_fallback_weather(lat, lng)

        hourly = data["hourly"]
        times = hourly.get("time", [])
        if not times:
            return self._generate_fallback_weather(lat, lng)

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
            return self._generate_fallback_forecast(lat, lng)

        hourly = data["hourly"]
        times = hourly.get("time", [])
        if not times:
            return self._generate_fallback_forecast(lat, lng)

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
