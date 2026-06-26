import os
import sys
from fastapi.testclient import TestClient

# Add backend directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app

client = TestClient(app)

def test_ping():
    response = client.get("/ping")
    assert response.status_code == 200
    assert response.json() == {"pong": True}

def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert "AirSense AI EDSS" in response.json()["status"]

def test_auth_signup_login():
    import random
    email = f"test_user_{random.randint(1000, 9999)}@example.com"
    
    # 1. Signup
    signup_resp = client.post("/api/auth/signup", json={"email": email, "password": "password123"})
    assert signup_resp.status_code == 200
    data = signup_resp.json()
    assert "access_token" in data
    assert data["role"] == "user"
    
    # 2. Login
    login_resp = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert login_resp.status_code == 200
    assert "access_token" in login_resp.json()

def test_aqi_endpoints():
    # Stations
    stations_resp = client.get("/api/aqi/stations")
    assert stations_resp.status_code == 200
    assert isinstance(stations_resp.json(), list)
    
    # Live AQI
    live_resp = client.get("/api/aqi/live?lat=28.63&lng=77.22")
    assert live_resp.status_code == 200
    data = live_resp.json()
    assert "aqi" in data
    assert "pm25" in data
    assert data["source"] in ["API Fusion Engine", "Local Station (Anand Vihar Environmental Station)", "Local Station (DTU Campus Air Lab)", "Local Station (Pusa Environmental Observatory)", "Local Station (Dwarka Sector 8 Station)"]

def test_prediction_forecast():
    payload = {
        "lat": 28.63,
        "lng": 77.22,
        "custom_features": {
            "pm25": 42.0,
            "wind_speed": 5.0
        }
    }
    resp = client.post("/api/predict/forecast", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "predicted_aqi" in data
    assert "shap_explanation" in data
    assert len(data["models"]) > 0

def test_health_risk():
    payload = {
        "age_group": "senior",
        "asthma": "mild",
        "pregnant": False,
        "cardiovascular": True,
        "current_aqi": 115.0
    }
    resp = client.post("/api/health/health-risk", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "safety_score" in data
    assert "risk_level" in data
    assert len(data["cards"]) > 0

def test_exposure():
    payload = {
        "home_lat": 28.63,
        "home_lng": 77.22,
        "office_lat": 28.75,
        "office_lng": 77.11,
        "travel_time_minutes": 35.0,
        "vehicle": "car"
    }
    resp = client.post("/api/exposure", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "daily_dose" in data
    assert "trends" in data
    assert len(data["intervals"]) > 0

def test_routes():
    payload = {
        "start_lat": 28.63,
        "start_lng": 77.22,
        "end_lat": 28.75,
        "end_lng": 77.11,
        "vehicle": "car"
    }
    resp = client.post("/api/routes/safe-route", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["routes"]) == 4
    assert data["routes"][2]["route_type"] == "lowest_pollution"

def test_chat():
    resp = client.post("/api/chat", json={"message": "Why is AQI rising?"})
    assert resp.status_code == 200
    assert "wind" in resp.json()["answer"].lower() or "stagnation" in resp.json()["answer"].lower() or "traffic" in resp.json()["answer"].lower()

def test_heatmap():
    resp = client.get("/api/maps/heatmap?lat=28.63&lng=77.22")
    assert resp.status_code == 200
    assert len(resp.json()) > 0
