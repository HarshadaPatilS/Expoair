import pytest
import math
from unittest.mock import patch, MagicMock, AsyncMock
import httpx

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
    
    # We need to mock _fetch_data instead of httpx.AsyncClient.get because _fetch_data is called twice
    with patch.object(service, '_fetch_data', new_callable=AsyncMock) as mock_fetch_data:
        # Side effect to return different data based on endpoint
        async def mock_fetch(endpoint, params, cache_key):
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
                    {
                        "results": [
                            {"parameter": "PM25", "value": 45.0},
                            {"parameter": "PM10", "value": 90.0},
                            {"parameter": "NO2", "value": 15.0}
                        ]
                    }
                ]
            return []
            
        mock_fetch_data.side_effect = mock_fetch
        
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
    
    service._cache["nearest_18.5_73.8"] = {
        "data": [
            {
                "id": 1,
                "name": "Cached Station",
                "coordinates": {
                    "latitude": 18.5,
                    "longitude": 73.8
                }
            }
        ],
        "timestamp": 0 # Old timestamp (expired TTL)
    }
    service._cache["latest_1"] = {
        "data": [
            {
                "results": [
                    {"parameter": "PM25", "value": 100.0}
                ]
            }
        ],
        "timestamp": 0
    }
    
    with patch('httpx.AsyncClient.get', new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = httpx.HTTPError("API Down")
        
        # Since API fails, it should fallback to the cached records
        result = await service.get_nearest_station(lat=18.5, lng=73.8)
        
        assert result is not None
        assert result["station"] == "Cached Station"
        assert result["PM2.5"] == 100.0
