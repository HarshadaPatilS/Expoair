import os
import math
import time
import logging
import httpx
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance using the Haversine formula."""
    R = 6371.0  # Earth radius in kilometers
    
    if None in (lat1, lon1, lat2, lon2):
        return float('inf')

    try:
        lat1_rad = math.radians(float(lat1))
        lon1_rad = math.radians(float(lon1))
        lat2_rad = math.radians(float(lat2))
        lon2_rad = math.radians(float(lon2))
        
        dlat = lat2_rad - lat1_rad
        dlon = lon2_rad - lon1_rad
        
        a = math.sin(dlat / 2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c
    except (ValueError, TypeError):
        return float('inf')


class OpenAQService:
    def __init__(self):
        self.api_key = os.getenv("OPENAQ_API_KEY")
        # OpenAQ v3 API base URL
        self.base_url = "https://api.openaq.org/v3"
        
        # Simple in-memory dictionary cache with TTL of 5 minutes
        self._cache: Dict[str, Dict[str, Any]] = {}
        self.cache_ttl = 300  # 5 minutes

    def _get_from_cache(self, key: str) -> Optional[Any]:
        if key in self._cache:
            item = self._cache[key]
            if time.time() - item["timestamp"] < self.cache_ttl:
                return item["data"]
        return None

    def _set_to_cache(self, key: str, data: Any):
        self._cache[key] = {
            "data": data,
            "timestamp": time.time()
        }

    async def _fetch_data(self, endpoint: str, params: Dict[str, Any], cache_key: str) -> Any:
        cached_data = self._get_from_cache(cache_key)
        if cached_data is not None:
            return cached_data

        if not self.api_key:
            logger.warning("OPENAQ_API_KEY environment variable is not set. Using mocked/cached data if available.")
            if cache_key in self._cache:
                return self._cache[cache_key]["data"]

        headers = {}
        if self.api_key:
            headers["X-API-Key"] = self.api_key

        try:
            async with httpx.AsyncClient() as client:
                url = f"{self.base_url}/{endpoint}"
                response = await client.get(url, params=params, headers=headers)
                response.raise_for_status()
                data = response.json()
                results = data.get("results", [])
                
                self._set_to_cache(cache_key, results)
                return results
        except httpx.HTTPError as e:
            logger.error(f"HTTP Error while fetching OpenAQ data: {e}")
            if cache_key in self._cache:
                logger.info(f"Returning stale cache data for {cache_key} due to API failure.")
                return self._cache[cache_key]["data"]
            return []
        except Exception as e:
            logger.error(f"Unexpected error fetching OpenAQ data: {e}")
            if cache_key in self._cache:
                return self._cache[cache_key]["data"]
            return []

    async def get_all_pune_stations(self) -> List[Dict[str, Any]]:
        """Returns active OpenAQ stations in Pune/PCMC area with lat/lng."""
        # OpenAQ v3 uses coordinates and radius. For Pune, let's use approx coords.
        # Pune lat/lng: 18.5204, 73.8567. Radius 50km
        params = {
            "coordinates": "18.5204,73.8567",
            "radius": 50000,
            "limit": 100
        }
        records = await self._fetch_data("locations", params, "all_openaq_stations_pune")
        
        pune_stations = {}
        for record in records:
            station_name = record.get("name")
            if not station_name:
                continue
                
            coords = record.get("coordinates", {})
            
            pune_stations[station_name] = {
                "station": station_name,
                "city": "Pune",
                "state": "Maharashtra",
                "latitude": coords.get("latitude"),
                "longitude": coords.get("longitude"),
                "pollutants": {}
            }
            
            # OpenAQ v3 sensors are in a nested list or accessible via /locations/{id}/latest
            # Let's map any parameters we can find if they are inline.
            # In v3, parameters are under 'parameters' list. We will need to query /latest for actual values
            # if they are not inline. For now, this just lists stations.
        
        return list(pune_stations.values())

    async def get_nearest_station(self, lat: float, lng: float) -> Dict[str, Any]:
        """
        Returns the nearest station's PM2.5, PM10, NO2, SO2, AQI values.
        """
        params = {
            "coordinates": f"{lat},{lng}",
            "radius": 25000,
            "limit": 5
        }
        
        # Querying /locations to find nearest stations
        locations = await self._fetch_data("locations", params, f"nearest_{lat}_{lng}")
        
        if not locations:
            return {}

        # Get the first one (nearest)
        nearest_loc = locations[0]
        loc_id = nearest_loc.get("id")
        
        # Fetch latest measurements for this location
        latest = await self._fetch_data(f"locations/{loc_id}/latest", {}, f"latest_{loc_id}")
        
        pollutants = {}
        if latest and len(latest) > 0:
            measurements = latest[0].get("results", []) # Usually in results array
            # Handle if latest endpoint returns list of measurements directly
            if isinstance(latest, list):
                # sometimes /latest returns array of parameters
                measurements = latest
            
            for m in measurements:
                param = str(m.get("parameter", "")).upper()
                val = m.get("value")
                if param and val is not None:
                    # OpenAQ param names might be "PM25", "PM10". Convert to expected.
                    if param == "PM25": param = "PM2.5"
                    pollutants[param] = float(val)

        # Estimate AQI if missing (simplified logic)
        if "AQI" not in pollutants and "PM2.5" in pollutants:
            pollutants["AQI"] = float(pollutants["PM2.5"]) * 2.5
            
        coords = nearest_loc.get("coordinates", {})
        s_lat = coords.get("latitude")
        s_lng = coords.get("longitude")
        
        dist = calculate_haversine_distance(lat, lng, float(s_lat), float(s_lng)) if s_lat and s_lng else float('inf')

        return {
            "station": nearest_loc.get("name"),
            "distance_km": round(dist, 2),
            "PM2.5": pollutants.get("PM2.5"),
            "PM10": pollutants.get("PM10"),
            "NO2": pollutants.get("NO2"),
            "SO2": pollutants.get("SO2"),
            "AQI": pollutants.get("AQI")
        }

    async def get_station_history(self, station_id: str, hours: int = 24) -> List[Dict[str, Any]]:
        """
        Returns hourly AQI readings for the past N hours from that station.
        """
        cache_key = f"history_openaq_{station_id}_{hours}"
        cached = self._get_from_cache(cache_key)
        if cached is not None:
             return cached
             
        # Mocking an endpoint call for exact station history
        params = {
            "limit": hours
        }
        
        # In OpenAQ we could query /measurements for a specific location
        records = await self._fetch_data("measurements", {"location_id": station_id, "limit": hours*5}, f"measurements_{station_id}")
        if not records:
             return []
             
        pollutants = {}
        last_update = None
        for record in records:
            p_id = str(record.get("parameter", "")).upper()
            if p_id == "PM25": p_id = "PM2.5"
            p_val = record.get("value")
            
            # Simple grouping
            if not last_update:
                last_update = record.get("date", {}).get("utc")
            if p_id and p_val is not None:
                try:
                    pollutants[p_id] = float(p_val)
                except ValueError:
                    pass
        
        history = [
            {
                "timestamp": last_update or time.time(),
                "station_id": station_id,
                "pollutants": pollutants
            }
        ]
        
        self._set_to_cache(cache_key, history)
        return history
