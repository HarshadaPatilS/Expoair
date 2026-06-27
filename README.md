# ExpoAir — Environmental exposure Prediction & Observation for Air Intelligence and Reporting

ExpoAir is an intelligent, full-stack air quality monitoring and prediction platform developed to provide real-time environmental awareness and personalized exposure insights. It integrates IoT hardware sensing, public environmental APIs, and machine learning models into a unified civic dashboard.

---

## Project Structure

- `backend/`: FastAPI Python backend managing data aggregation (OpenAQ, OpenWeather, Google Traffic), machine learning inference, and MQTT telemetry streams.
- `frontend/`: React + Vite + Tailwind CSS single-page application providing live 3D civic AQI monitoring, exposure calculators, XAI forecasting, and health guidance.
- `ml/`: Machine learning pipelines (LSTM multi-horizon forecasting, XGBoost source apportionment fingerprinter) and saved model binaries (`lstm_aqi.keras` and `source_fingerprinter.json`).

---

## Technical Architecture

### 1. Data Fusion Engine
The backend aggregates data from three main sources:
*   **IoT Sensing Unit**: Real-time localized PM2.5, temperature, humidity, and CO2-equivalent metrics transmitted via MQTT.
*   **Regional APIs**: OpenAQ (regional ambient stations), WeatherService (temperature, humidity, wind vector), and TrafficService (commute congestion index).
*   **Hybrid Fallback**: If the IoT hardware or MQTT broker is offline, the backend automatically performs data fusion of regional ambient sensors.

### 2. Machine Learning Pipeline
*   **Multi-Horizon Forecasting**: An LSTM recurrent neural network predicts AQI trends for the next 24 hours.
*   **Source Apportionment**: An XGBoost classifier identifies the primary source of local pollution (e.g., Vehicular, Industrial, Biomass Burning) based on particle ratio analysis.
*   **Explainable AI (XAI)**: SHAP (SHapley Additive exPlanations) values decompose model predictions into individual feature contributions in real-time.

---

## Getting Started

### 1. Backend Setup
1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install required packages:
   ```bash
   pip install -r requirements.txt
   ```
4. Start the FastAPI server:
   ```bash
   uvicorn main:app --reload
   ```
   The interactive API docs will be available at `http://127.0.0.1:8000/docs`.

### 2. Frontend Setup
1. Navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

---

## MQTT Telemetry & Hardware Integration

### Broker Specifications
*   **Broker**: `psyduck-6158e935.a02.usw2.aws.hivemq.cloud`
*   **Port**: `8883` (TLS Secured)
*   **Topic**: `AQI/data`
*   **Username**: `Vaishnavi`

### Hardware Code Overview
The ESP32 firmware reads sensors and publishes JSON telemetry payloads to the HiveMQ broker:
```json
{
  "timestamp": "Sat 27-Jun-2026 00:17:42",
  "status": "GOOD",
  "temp": 31.6,
  "hum": 63.3,
  "co2": 153.7,
  "iaqi": 0,
  "label": "GOOD",
  "skipped": true
}
```

### Presentation & Testing Mode (Simulation Fallback)
To ensure reliable presentations during external examinations:
1. **MQTT Telemetry Simulator**: When the FastAPI backend starts, it launches an automatic MQTT listener and a background publisher simulation thread. 
2. **Local Loopback**: If the local network blocks port `8883` (common on university or corporate firewalls), the backend automatically triggers a local loopback mode. Terminal logs will still output incoming MQTT JSON packages, and the dashboard will update in real-time.
3. **Database Seeding**: In the frontend **Admin Panel**, clicking **Seed Database** executes a real backend script that populates the SQLite database with 1,000+ historical data entries, activating the charts and predictions immediately.
