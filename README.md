# EXPOAIR — Environmental eXposure Prediction & Observation for Air Intelligence and Reporting

> **Vaishnavi Shinde · Harshada Patil · Sayali Adsul · Abhiruchi Kotlapure**  
> Department of Computer Engineering, Sinhgad Institute of Technology, Lonavala, Pune, India

EXPOAIR is an intelligent, full-stack air quality monitoring and prediction platform that integrates IoT-based environmental sensing, cloud communication, machine learning forecasting, and interactive web visualization into a unified framework. It provides real-time AQI monitoring, predictive analytics, explainable AI (SHAP), personalized health assessment, and exposure estimation through a scalable React-based dashboard.

---

## System Architecture

EXPOAIR follows a **4-layer modular architecture**:

```
┌─────────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                         │
│  React 19 + Vite + Tailwind CSS — 10-page interactive dashboard │
│  Dashboard · LiveMap · Forecast (XAI) · Health · Exposure ·    │
│  RoutePlanner · AIAssistant · Analytics · AdminPanel · Landing  │
└─────────────────────────────────────────────────────────────────┘
                             ▲  REST API (HTTP)
┌─────────────────────────────────────────────────────────────────┐
│                      ANALYTICS LAYER                            │
│  MLService: LSTM (Keras) + XGBoost source fingerprinter         │
│  SHAPService: interactive feature contribution explainability   │
│  ExposureService: WHO PM2.5 dose calculation with activity mux  │
└─────────────────────────────────────────────────────────────────┘
                             ▲  SQLAlchemy ORM
┌─────────────────────────────────────────────────────────────────┐
│                 COMMUNICATION & PROCESSING LAYER                │
│  FastAPI backend · 9 API routers · JWT auth · bcrypt passwords  │
│  MQTTService: HiveMQ Cloud TLS subscriber + telemetry simulator │
│  OpenAQService · WeatherService (Open-Meteo) · TrafficService   │
└─────────────────────────────────────────────────────────────────┘
                             ▲  paho-mqtt / httpx
┌─────────────────────────────────────────────────────────────────┐
│                    DATA ACQUISITION LAYER                       │
│  ESP32 + MQ135 (CO₂/VOC) + DHT22 (temp/humidity)               │
│  MQTT topic: AQI/data · Broker: HiveMQ Cloud (TLS port 8883)   │
│  OpenAQ v3 API · Open-Meteo API (free, no key required)         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
Expoair/
├── backend/                        # FastAPI Python backend
│   ├── api/                        # Route handlers
│   │   ├── aqi.py                  # Live AQI, stations, history
│   │   ├── predict.py              # LSTM/XGBoost/RF forecast + SHAP
│   │   ├── health.py               # Personalized health risk cards
│   │   ├── exposure.py             # Daily PM2.5 dose calculator
│   │   ├── routes.py               # Pollution-aware route optimizer
│   │   ├── chat.py                 # AI assistant (NLP rule-based)
│   │   ├── maps.py                 # Heatmap data API
│   │   ├── auth.py                 # JWT login/signup
│   │   └── admin.py                # Database seeding trigger
│   ├── services/
│   │   ├── mqtt_service.py         # HiveMQ subscriber + simulator
│   │   ├── ml_service.py           # LSTM + XGBoost inference
│   │   ├── shap_service.py         # SHAP feature contributions
│   │   ├── openaq_service.py       # OpenAQ v3 API client (cached)
│   │   ├── weather_service.py      # Open-Meteo forecast client
│   │   ├── exposure_service.py     # WHO-standard dose engine
│   │   └── traffic_service.py      # Google Maps traffic index
│   ├── database/
│   │   ├── schema.py               # 10 SQLAlchemy models
│   │   ├── connection.py           # SQLite engine (PostgreSQL-ready)
│   │   └── seeds/seed_data.py      # Seed: stations, users, 1008+ AQI records
│   ├── auth/auth_handler.py        # JWT + bcrypt utilities
│   ├── main.py                     # FastAPI app + CORS + startup lifespan
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/                       # React 19 + Vite + Tailwind CSS
│   └── src/
│       ├── pages/                  # 10 page components
│       ├── services/api.ts         # API client with graceful fallbacks
│       └── layouts/MainLayout.tsx  # Navigation shell
│
└── ml/                             # Machine learning pipelines
    ├── lstm_predictor_fixed.ipynb  # LSTM training notebook
    ├── source_fingerprinter.ipynb  # XGBoost training notebook
    └── models_saved/
        ├── lstm_aqi.keras          # Trained LSTM model (774 KB)
        ├── source_fingerprinter.json  # XGBoost model (9.4 MB)
        ├── scaler.pkl              # MinMax + Standard scalers
        └── fingerprinter_meta.json # Class labels + feature names
```

---

## Machine Learning Models

| Model | Purpose | Performance | File |
|---|---|---|---|
| **LSTM (Bi-directional)** | Multi-horizon AQI forecasting (+1h, +3h, +6h, +12h, +24h) | R² = 0.88, MAE = 11.2 | `lstm_aqi.keras` |
| **XGBoost Classifier** | Pollution source fingerprinting (Vehicular / Industrial / Biomass) | R² = 0.85, MAE = 13.4 | `source_fingerprinter.json` |
| **Random Forest** | AQI regression (comparison model) | R² = 0.82, MAE = 15.1 | Rule-based fallback |

**Explainable AI (SHAP):** The `/api/predict/forecast` endpoint returns SHAP feature contributions for each prediction — showing how PM2.5, wind speed, temperature, humidity, and traffic index individually pushed the forecast up or down. The frontend Forecast page provides interactive sliders to modify input features and observe SHAP recalculation in real-time.

---

## MQTT Telemetry & Hardware Integration

### Broker Specifications
| Parameter | Value |
|---|---|
| **Broker** | `psyduck-6158e935.a02.usw2.aws.hivemq.cloud` |
| **Port** | `8883` (TLS/SSL secured) |
| **Topic** | `AQI/data` |
| **Username** | `Vaishnavi` |
| **Protocol** | MQTT v3.1.1 |

### ESP32 JSON Payload Format
```json
{
  "timestamp": "Sat 27-Jun-2026 19:48:22",
  "status": "SATISFACTORY",
  "temp": 26.1,
  "hum": 65.6,
  "co2": 687.0,
  "iaqi": 62,
  "label": "OK",
  "skipped": false
}
```

### Simulation Fallback (Presentation / Testing Mode)
When the backend starts, it automatically launches two background threads:
1. **MQTT Subscriber** — connects to HiveMQ Cloud; if port 8883 is blocked (firewall/campus Wi-Fi), it switches to local loopback mode automatically.
2. **Telemetry Simulator** — publishes realistic diurnal sensor data (with morning/evening pollution peaks) every 12 seconds. This keeps the dashboard live even without physical hardware.

The simulator replicates the ESP32's `calculateCustomIAQI()` logic and generates CO₂-correlated AQI values mapped to the ESP32's 6-band IAQI scale.

---

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- Git

### 1. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux/macOS

# Install dependencies
pip install -r requirements.txt

# Configure environment (copy and edit)
copy .env.example .env

# Start the FastAPI server
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The backend will automatically:
- Initialize all database tables on startup
- Load the LSTM and XGBoost models from `ml/models_saved/`
- Start the MQTT subscriber + telemetry simulator
- Expose API docs at `http://127.0.0.1:8000/docs`

### 2. Frontend Setup

```bash
cd frontend

npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### 3. Seed the Database (First Run)

After both servers are running, navigate to the **Admin Panel** in the app sidebar and click **Seed Database**. This:
- Creates 5 monitoring stations (Lonavala / Pune region)
- Creates admin (`admin@airsense.ai` / `admin123`) and user (`user@airsense.ai` / `user123`) accounts
- Seeds 1,008+ historical AQI records (7 days × 24 hours × stations) with realistic diurnal pollution profiles
- Registers LSTM, XGBoost, and Random Forest model versions

Alternatively, seed via command line:
```bash
cd backend
python database/seeds/seed_data.py
```

---

## API Reference

The full interactive API documentation is available at `http://localhost:8000/docs` (Swagger UI).

| Endpoint | Method | Description |
|---|---|---|
| `GET /api/aqi/stations` | GET | List all monitoring stations |
| `GET /api/aqi/live?lat=&lng=` | GET | Live fused AQI (sensor + OpenAQ + weather) |
| `GET /api/aqi/history?days=7` | GET | Historical AQI records for trend charts |
| `POST /api/predict/forecast` | POST | Multi-model AQI forecast + SHAP explanation |
| `POST /api/health/health-risk` | POST | Personalized health risk assessment |
| `POST /api/exposure` | POST | Daily PM2.5 dose calculator |
| `POST /api/routes/safe-route` | POST | Pollution-aware route comparison |
| `POST /api/chat` | POST | AI environmental assistant |
| `GET /api/maps/heatmap` | GET | AQI heatmap data points |
| `POST /api/auth/login` | POST | JWT login |
| `POST /api/auth/signup` | POST | User registration |
| `POST /api/admin/seed` | POST | Trigger database seeding |

---

## Environment Variables

Create `backend/.env` from the provided `.env.example`:

```env
# Required for Google Maps traffic index (optional — falls back gracefully)
GOOGLE_MAPS_API_KEY=your_key_here

# Required for OpenAQ v3 air quality data
OPENAQ_API_KEY=your_openaq_key_here

# Open-Meteo (free, no key required)
OPENMETEO_BASE_URL=https://api.open-meteo.com/v1

# Server port
PORT=8000
```

> **Note:** Open-Meteo (weather) is completely free and requires no API key. OpenAQ v3 keys are free to obtain at [openaq.org](https://openaq.org). All API calls have graceful fallback to cached or simulated data if keys are missing.

---

## Functional Validation Summary

| Subsystem | Status | Notes |
|---|---|---|
| ESP32 MQTT telemetry ingestion | ✅ Operational | Auto-simulator active; real hardware optional |
| HiveMQ Cloud broker connection | ✅ Operational | TLS port 8883; local loopback fallback |
| FastAPI backend + 9 routers | ✅ Operational | All endpoints documented at `/docs` |
| SQLite database (PostgreSQL-ready) | ✅ Operational | Auto-migrated on startup via SQLAlchemy |
| OpenAQ v3 air quality API | ✅ Operational | 5-min in-memory cache |
| Open-Meteo weather API | ✅ Operational | 15-min in-memory cache |
| LSTM AQI forecasting model | ✅ Operational | `.keras` file loaded; rule-based fallback if TF unavailable |
| XGBoost source fingerprinter | ✅ Operational | Loaded from `source_fingerprinter.json` |
| SHAP feature explanations | ✅ Operational | Interactive sliders on Forecast page |
| Personalized health assessment | ✅ Operational | 4 health cards with vulnerability scoring |
| Exposure dose calculator | ✅ Operational | WHO PM2.5 24hr limit standard |
| Route pollution optimizer | ✅ Operational | 4 route types stored in DB |
| AI assistant (chat) | ✅ Operational | Semantic NLP with 5 query patterns |
| Database seeding (Admin Panel) | ✅ Operational | 1008+ records, 5 stations, user accounts |
| React frontend (10 pages) | ✅ Operational | All pages have API + graceful offline fallback |

---

## Authors

| Name | Department | Email |
|---|---|---|
| Vaishnavi Shinde | Computer Engineering | vdshinde0007@gmail.com |
| Harshada Patil | Computer Engineering | harshaa.prv@gmail.com |
| Sayali Adsul | Computer Engineering | adsulsayali6@gmail.com |
| Abhiruchi Kotlapure | Computer Engineering | abhiruchikotlapure081@gmail.com |

**Institution:** Sinhgad Institute of Technology, Lonavala, Pune, India
