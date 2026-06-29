import os
import math
import time
import logging
import httpx
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

# ── Indian CPCB AQI breakpoints for PM2.5 ──────────────────────────────────
# Source: CPCB National Air Quality Index Technical Document
PM25_BREAKPOINTS = [
    (0,    30,   0,   50),
    (30,   60,   51,  100),
    (60,   90,   101, 200),
    (90,   120,  201, 300),
    (120,  250,  301, 400),
    (250,  500,  401, 500),
]

def pm25_to_aqi(pm25: float) -> float:
    """Convert PM2.5 (µg/m³) to Indian CPCB AQI using linear interpolation."""
    if pm25 < 0:
        return 0.0
    for c_lo, c_hi, i_lo, i_hi in PM25_BREAKPOINTS:
        if c_lo <= pm25 <= c_hi:
            aqi = ((i_hi - i_lo) / (c_hi - c_lo)) * (pm25 - c_lo) + i_lo
            return round(aqi, 1)
    return 500.0  # hazardous cap


def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance (km) between two coordinates using the Haversine formula."""
    R = 6371.0
    if None in (lat1, lon1, lat2, lon2):
        return float("inf")
    try:
        lat1_r, lon1_r = math.radians(float(lat1)), math.radians(float(lon1))
        lat2_r, lon2_r = math.radians(float(lat2)), math.radians(float(lon2))
        dlat = lat2_r - lat1_r
        dlon = lon2_r - lon1_r
        a = math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    except (ValueError, TypeError):
        return float("inf")


class OpenAQService:
    """Wrapper around OpenAQ v3 REST API with in-memory TTL cache."""

    BASE_URL = "https://api.openaq.org/v3"

    # City centres used for multi-city station discovery
    CITIES = [
        {"name": "Delhi",    "lat": 28.6139, "lng": 77.2090, "radius": 40000},
        {"name": "Pune",     "lat": 18.5204, "lng": 73.8567, "radius": 30000},
        {"name": "PCMC",     "lat": 18.6298, "lng": 73.7997, "radius": 20000},
        {"name": "Lonavala", "lat": 18.7490, "lng": 73.4070, "radius": 15000},
    ]

    # Class-level cache: shared across all instances so it actually persists
    # between requests (FastAPI creates a new instance per request via Depends).
    _cache: Dict[str, Dict[str, Any]] = {}
    cache_ttl: int = 300  # 5 minutes

    def __init__(self):
        self.api_key: Optional[str] = os.getenv("OPENAQ_API_KEY")


    # ── Cache helpers ───────────────────────────────────────────────────────

    def _get(self, key: str) -> Optional[Any]:
        item = self._cache.get(key)
        if item and time.time() - item["ts"] < self.cache_ttl:
            return item["data"]
        return None

    def _set(self, key: str, data: Any):
        self._cache[key] = {"data": data, "ts": time.time()}

    # ── HTTP helper ─────────────────────────────────────────────────────────

    async def _request(self, endpoint: str, params: Dict[str, Any], cache_key: str) -> Any:
        cached = self._get(cache_key)
        if cached is not None:
            return cached

        headers = {}
        if self.api_key:
            headers["X-API-Key"] = self.api_key

        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                url = f"{self.BASE_URL}/{endpoint}"
                resp = await client.get(url, params=params, headers=headers)
                resp.raise_for_status()
                results = resp.json().get("results", [])
                self._set(cache_key, results)
                return results
        except httpx.HTTPStatusError as e:
            logger.warning(f"OpenAQ HTTP {e.response.status_code} for {endpoint}: {e}")
        except Exception as e:
            logger.warning(f"OpenAQ request error for {endpoint}: {e}")

        # Return stale cache on failure
        stale = self._cache.get(cache_key)
        return stale["data"] if stale else []

    # ── Public API ──────────────────────────────────────────────────────────

    async def get_all_stations(self) -> List[Dict[str, Any]]:
        """Return all monitoring stations across all tracked cities."""
        all_stations: Dict[str, Dict] = {}

        for city in self.CITIES:
            cache_key = f"stations_{city['name']}"
            records = await self._request(
                "locations",
                {
                    "coordinates": f"{city['lat']},{city['lng']}",
                    "radius": city["radius"],
                    "limit": 50,
                },
                cache_key,
            )
            for rec in records:
                name = rec.get("name") or rec.get("id")
                coords = rec.get("coordinates") or {}
                lat = coords.get("latitude")
                lng = coords.get("longitude")
                if not (name and lat and lng):
                    continue
                all_stations[str(rec.get("id"))] = {
                    "id": rec.get("id"),
                    "station": name,
                    "city": city["name"],
                    "latitude": lat,
                    "longitude": lng,
                }

        return list(all_stations.values())

    async def get_nearest_station(self, lat: float, lng: float) -> Dict[str, Any]:
        """Return nearest station's latest pollutant readings + computed AQI."""
        cache_key = f"nearest_{round(lat,3)}_{round(lng,3)}"
        cached = self._get(cache_key)
        if cached is not None:
            return cached

        locations = await self._request(
            "locations",
            {"coordinates": f"{lat},{lng}", "radius": 50000, "limit": 5},
            f"loc_search_{round(lat,2)}_{round(lng,2)}",
        )

        if not locations:
            result = {}
            self._set(cache_key, result)
            return result

        nearest = locations[0]
        loc_id = nearest.get("id")

        # Fetch latest sensor readings for this location
        latest = await self._request(
            f"locations/{loc_id}/latest",
            {},
            f"latest_{loc_id}",
        )

        # OpenAQ v3 returns a list of {parameter, value, ...} dicts
        pollutants: Dict[str, float] = {}
        measurements = latest if isinstance(latest, list) else latest.get("results", [])
        for m in measurements:
            param = str(m.get("parameter", "")).lower().replace(".", "")
            val = m.get("value")
            if param and val is not None:
                try:
                    pollutants[param] = float(val)
                except (TypeError, ValueError):
                    pass

        # Normalise common parameter name variants
        pm25 = pollutants.get("pm25") or pollutants.get("pm2_5")
        pm10 = pollutants.get("pm10")
        no2  = pollutants.get("no2")
        so2  = pollutants.get("so2")

        aqi = pollutants.get("aqi")
        if aqi is None and pm25 is not None:
            aqi = pm25_to_aqi(pm25)

        coords = nearest.get("coordinates") or {}
        s_lat = coords.get("latitude")
        s_lng = coords.get("longitude")
        dist = calculate_haversine_distance(lat, lng, float(s_lat or lat), float(s_lng or lng))

        result = {
            "station": nearest.get("name"),
            "location_id": loc_id,
            "distance_km": round(dist, 2),
            "PM2.5": pm25,
            "PM10":  pm10,
            "NO2":   no2,
            "SO2":   so2,
            "AQI":   round(aqi, 1) if aqi else None,
        }
        self._set(cache_key, result)
        return result

    async def get_stations_with_aqi(self) -> List[Dict[str, Any]]:
        """Return all city stations with their latest AQI from OpenAQ."""
        stations = await self.get_all_stations()
        results = []
        for s in stations:
            try:
                latest = await self._request(
                    f"locations/{s['id']}/latest",
                    {},
                    f"latest_{s['id']}",
                )
                pm25 = None
                measurements = latest if isinstance(latest, list) else latest.get("results", [])
                for m in measurements:
                    param = str(m.get("parameter", "")).lower().replace(".", "")
                    if param in ("pm25", "pm2_5") and m.get("value") is not None:
                        pm25 = float(m["value"])
                        break
                aqi = pm25_to_aqi(pm25) if pm25 else None
                results.append({**s, "pm25": pm25, "aqi": aqi})
            except Exception as e:
                logger.debug(f"Could not fetch latest for {s['station']}: {e}")
                results.append({**s, "pm25": None, "aqi": None})
        return results

    async def get_station_history(self, location_id: str, hours: int = 24) -> List[Dict[str, Any]]:
        """Return hourly PM2.5 readings for a specific OpenAQ location."""
        cache_key = f"history_{location_id}_{hours}"
        cached = self._get(cache_key)
        if cached is not None:
            return cached

        records = await self._request(
            "measurements",
            {"location_id": location_id, "limit": hours * 4, "parameter": "pm25"},
            cache_key,
        )

        history = []
        for rec in records:
            ts = (rec.get("date") or {}).get("utc")
            val = rec.get("value")
            if ts and val is not None:
                try:
                    pm25 = float(val)
                    history.append({
                        "timestamp": ts,
                        "pm25": pm25,
                        "aqi": pm25_to_aqi(pm25),
                    })
                except (TypeError, ValueError):
                    pass

        self._set(cache_key, history)
        return history
