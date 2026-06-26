import pytest
from httpx import AsyncClient, ASGITransport
import sys
import os

# Add the parent directory to the path so we can import from main
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import app

@pytest.mark.asyncio
async def test_mode_b_pipeline():
    """Data Fusion Pipeline: OpenAQ API + Weather + Traffic -> Live AQI"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/aqi/live?lat=18.5204&lng=73.8567")
        assert resp.status_code == 200
        data = resp.json()
        assert "aqi" in data
        assert "pm25" in data
        assert "source" in data
        assert "weather" in data

@pytest.mark.asyncio  
async def test_prediction_forecast():
    """Forecast Pipeline: LSTM predict + SHAP explanation"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "lat": 18.5204,
            "lng": 73.8567,
            "custom_features": {
                "pm25": 42.0,
                "wind_speed": 5.0
            }
        }
        resp = await client.post("/api/predict/forecast", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert "predicted_aqi" in data
        assert "shap_explanation" in data
        assert len(data["models"]) > 0

@pytest.mark.asyncio
async def test_health_score():
    """Health Assessment Pipeline: Profile + AQI -> Safety Score & Recommendations"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "age_group": "child",
            "asthma": "severe",
            "pregnant": False,
            "cardiovascular": False,
            "current_aqi": 145.0
        }
        resp = await client.post("/api/health/health-risk", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["risk_level"] in ["high", "hazardous"]
        assert "safety_score" in data
        assert len(data["cards"]) > 0
