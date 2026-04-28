import os
import math
import logging
import asyncio
from typing import List, Dict, Any
from datetime import datetime, timedelta
import httpx

logger = logging.getLogger(__name__)

class TrafficService:
    def __init__(self):
        self.api_key = os.getenv("GOOGLE_MAPS_API_KEY")
        self.base_url = "https://maps.googleapis.com/maps/api/directions/json"
        
    def _time_of_day_heuristic(self) -> float:
        """
        Fallback heuristic based on IST time of day.
        - 8-10am and 6-8pm weekdays -> 0.8 (high)
        - 1-3pm -> 0.4 (medium)
        - 11pm-5am -> 0.1 (low)
        """
        # Get current time in Asia/Kolkata (UTC + 5:30)
        now_utc = datetime.utcnow()
        now_ist = now_utc + timedelta(hours=5, minutes=30)
        
        hour = now_ist.hour
        weekday = now_ist.weekday()  # Monday is 0, Sunday is 6
        
        is_weekday = weekday < 5
        
        if is_weekday and ((8 <= hour < 10) or (18 <= hour < 20)):
            return 0.8
        elif 13 <= hour < 15:
            return 0.4
        elif hour >= 23 or hour < 5:
            return 0.1
        else:
            return 0.2  # Default to some nominal low/medium traffic outside these windows

    async def get_traffic_index(self, lat: float, lng: float) -> float:
        """
        Returns traffic index normalized to 0-1 range.
        0 = free flow, 1 = severe congestion.
        """
        if not self.api_key:
            logger.warning("GOOGLE_MAPS_API_KEY not set. Using time-of-day heuristic.")
            return self._time_of_day_heuristic()
            
        # Origin and destination are small offsets from target coordinate (+/- 0.005 deg)
        origin = f"{lat + 0.005},{lng + 0.005}"
        destination = f"{lat - 0.005},{lng - 0.005}"
        
        params = {
            "origin": origin,
            "destination": destination,
            "departure_time": "now",
            "traffic_model": "best_guess",
            "key": self.api_key
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(self.base_url, params=params)
                data = response.json()
                
                # Handle API rate limits or errors
                if data.get("status") != "OK":
                    logger.warning(f"Google Maps API error: {data.get('status')}. Using heuristic fallback.")
                    return self._time_of_day_heuristic()
                
                routes = data.get("routes", [])
                if not routes:
                    return self._time_of_day_heuristic()
                    
                legs = routes[0].get("legs", [])
                if not legs:
                    return self._time_of_day_heuristic()
                    
                duration_in_traffic = legs[0].get("duration_in_traffic", {}).get("value")
                duration = legs[0].get("duration", {}).get("value")
                
                if duration_in_traffic is None or duration is None or duration == 0:
                    return self._time_of_day_heuristic()
                    
                ratio = duration_in_traffic / duration
                
                # Normalize ratio to 0-1 (1.0 ratio = 0 free flow, 2.0 ratio = 1 severe traffic)
                normalized = max(0.0, min(1.0, ratio - 1.0))
                return round(normalized, 2)
                
        except Exception as e:
            logger.error(f"Error fetching traffic index: {e}")
            return self._time_of_day_heuristic()

    async def get_traffic_grid(self, center_lat: float, center_lng: float, radius_km: float = 2.0) -> List[Dict[str, float]]:
        """
        Samples traffic at a 500m grid around center point.
        Returns list of {lat, lng, traffic_index} dicts for heatmap rendering.
        """
        grid = []
        step_km = 0.5
        
        # Approximate degrees per km
        deg_lat_per_km = 1 / 111.0
        # Longitude degrees per km changes depending on latitude
        lat_rad = math.radians(center_lat)
        deg_lng_per_km = 1 / (111.0 * math.cos(lat_rad))
        
        # Span -radius_km to +radius_km in steps of step_km
        steps = int(radius_km / step_km)
        
        tasks = []
        coordinates = []
        
        for i in range(-steps, steps + 1):
            for j in range(-steps, steps + 1):
                # Calculate offsets
                lat_offset = i * step_km * deg_lat_per_km
                lng_offset = j * step_km * deg_lng_per_km
                
                sample_lat = center_lat + lat_offset
                sample_lng = center_lng + lng_offset
                
                # Euclidean distance check to ensure it's within the radius circle
                if (i * step_km)**2 + (j * step_km)**2 <= radius_km**2:
                    coordinates.append((sample_lat, sample_lng))
                    tasks.append(self.get_traffic_index(sample_lat, sample_lng))
                    
        # Concurrently fetch all traffic indices
        try:
            results = await asyncio.gather(*tasks)
            for idx, (lat, lng) in enumerate(coordinates):
                grid.append({
                    "lat": round(lat, 5),
                    "lng": round(lng, 5),
                    "traffic_index": results[idx]
                })
        except Exception as e:
            logger.error(f"Error compiling traffic grid: {e}")
            
        return grid
