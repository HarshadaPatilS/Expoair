import pytest
from httpx import AsyncClient, ASGITransport
import sys
import os

# Add the parent directory to the path so we can import from main
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import app

@pytest.mark.asyncio
async def test_mode_b_pipeline():
    """Mode B: OpenAQ API → Weather → LSTM predict → AQI response"""
    # Using ASGITransport as recommended in newer httpx versions
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/aqi/current?lat=18.5204&lng=73.8567&mode=api")
        assert resp.status_code == 200
        data = resp.json()
        assert "aqi" in data
        assert 0 < data["aqi"] < 500
        assert data["mode_used"] == "api_fusion"

@pytest.mark.asyncio  
async def test_source_fingerprint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/predict/source?lat=18.5204&lng=73.8567")
        assert resp.status_code == 200
        data = resp.json()
        assert data["source"] in ["Vehicular","Industrial","Construction","Biomass","Mixed"]
        assert 0 < data["confidence"] < 1

@pytest.mark.asyncio
async def test_health_score():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/health-score", json={
            "current_aqi": 145,
            "health_profile": {"age_group":"child","asthma":"severe","pregnant":False,"cardiovascular":False}
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["risk_level"] == "hazardous"  # AQI 145 > 120 threshold for asthmatic child
