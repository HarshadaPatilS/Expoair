![Backend CI](https://github.com/HarshadaPatilS/expoair/actions/workflows/ci.yml/badge.svg)

# ExpoAir — Personal AQI Exposure Tracker

ExpoAir is a comprehensive platform for tracking and analyzing personal Air Quality Index (AQI) exposure. It features a complete ecosystem from hardware sensor tracking to advanced machine learning predictions and a 3D civic dashboard.

## Project Structure

- `backend/`: FastAPI Python backend for managing data flows and API requests.
- `ml/`: Machine learning models and training notebooks (LSTM for predictions, source fingerprinting).
- `dashboard/`: Streamlit application serving a 3D civic view of the AQI data.
- `firmware/`: ESP32 Arduino firmware for hardware sensor nodes.
- `app/`: Flutter mobile application for personal exposure tracking.

## Getting Started

### Prerequisites

You will need the following tools installed:
- Python 3.9+
- Node.js & npm (for potential frontend dependencies in the future)
- Flutter SDK (for mobile app development)
- Arduino IDE or PlatformIO (for firmware development)

### 1. Backend Setup

The backend is built with FastAPI. To start it, run the following commands:

```bash
cd backend
python -m venv venv
# On Windows use: venv\Scripts\activate
# On Linux/Mac use: source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```
The backend will be available at `http://127.0.0.1:8000`.

### 2. Streamlit Dashboard Setup

The dashboard is built using Streamlit. To run it:

```bash
cd dashboard
python -m venv venv
# On Windows use: venv\Scripts\activate
# On Linux/Mac use: source venv/bin/activate
pip install -r requirements.txt
streamlit run app.py
```
The dashboard will open automatically in your browser.

### 3. ML Setup

To work on the ML models, navigate to the `ml/` directory and launch Jupyter Notebook. You can use the same virtual environment as the backend or create a dedicated one.

### 4. Hardware Node Setup

If you are using ESP32 based sensors, navigate to the `firmware/` directory and flash the code via the Arduino IDE to your ESP32 boards.

### 5. Flutter App

Navigate to the `app/` directory and run the Flutter application:

```bash
cd app
flutter pub get
flutter run
```

## License

This project is licensed under the MIT License.
