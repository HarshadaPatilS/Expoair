import pytest
import time
from unittest.mock import patch, MagicMock, AsyncMock

from services.openaq_service import OpenAQService, calculate_haversine_distance

def test_haversine_distance():
    # Known distance test
    # Pune (18.5204, 73.8567) to Mumbai (19.0760, 72.8777) length is approx 118 km
    lat1, lon1 = 18.5204, 73.8567
    lat2, lon2 = 19.0760, 72.8777
    
    dist = calculate_haversine_distance(lat1, lon1, lat2, lon2)
    assert 115 < dist < 125

@pytest.mark.asyncio
async def test_get_nearest_station():
    service = OpenAQService()
    service.api_key = "dummy_key"
    
    with patch.object(service, '_request', new_callable=AsyncMock) as mock_request:
        async def mock_req(endpoint, params, cache_key):
            if endpoint == "locations":
                return [
                    {
                        "id": 1,
                        "name": "Station A, Pune",
                        "coordinates": {
                            "latitude": 18.52,
                            "longitude": 73.85
                        }
                    }
                ]
            elif endpoint == "locations/1/latest":
                return [
                    {"parameter": "pm25", "value": 45.0},
                    {"parameter": "pm10", "value": 90.0},
                    {"parameter": "no2", "value": 15.0}
                ]
            return []
            
        mock_request.side_effect = mock_req
        
        result = await service.get_nearest_station(lat=18.52, lng=73.85)
        
        assert result is not None
        assert result["station"] == "Station A, Pune"
        assert result["PM2.5"] == 45.0
        assert result["PM10"] == 90.0
        assert result["NO2"] == 15.0
        assert result["SO2"] is None
        assert result["distance_km"] < 1.0

@pytest.mark.asyncio
async def test_api_failure_fallback_to_cache():
    service = OpenAQService()
    service.api_key = "dummy_key"
    
    # Pre-populate the cache with the expected key and ts
    service._cache["nearest_18.5_73.8"] = {
        "data": {
            "station": "Cached Station",
            "location_id": 1,
            "distance_km": 0.0,
            "PM2.5": 100.0,
            "PM10": None,
            "NO2": None,
            "SO2": None,
            "AQI": 200.0
        },
        "ts": time.time()
    }
    
    # Requesting the coordinates should fetch from the cache directly
    result = await service.get_nearest_station(lat=18.5, lng=73.8)
    
    assert result is not None
    assert result["station"] == "Cached Station"
    assert result["PM2.5"] == 100.0
