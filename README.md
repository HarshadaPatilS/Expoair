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
