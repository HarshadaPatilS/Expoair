import os
import json
import logging
import joblib
import numpy as np

logger = logging.getLogger(__name__)


class MLService:
    _lstm_model = None
    _xgb_model = None
    _scalers = None
    _metadata = None
    _lstm_loaded = False
    _xgb_loaded = False

    @classmethod
    def initialize(cls):
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        models_dir = os.path.join(base_dir, "ml", "models_saved")

        # ── Try all plausible LSTM file names ─────────────────────────────
        for fname in ("lstm_aqi.keras", "lstm_aqi.h5"):
            lstm_path = os.path.join(models_dir, fname)
            if os.path.exists(lstm_path):
                cls._load_lstm(lstm_path)
                break
        else:
            logger.warning("MLService: No LSTM model file found. Using rule-based fallback.")

        # ── XGBoost source fingerprinter ──────────────────────────────────
        xgb_path  = os.path.join(models_dir, "source_fingerprinter.json")
        meta_path = os.path.join(models_dir, "fingerprinter_meta.json")
        cls._load_xgb(xgb_path, meta_path)

        # ── Scalers ───────────────────────────────────────────────────────
        scaler_path = os.path.join(models_dir, "scaler.pkl")
        cls._load_scalers(scaler_path)

    # ── Private loaders ────────────────────────────────────────────────────

    @classmethod
    def _load_lstm(cls, path: str):
        """Load LSTM model with a subprocess safety check for TF Access Violations."""
        import subprocess, sys
        try:
            res = subprocess.run(
                [sys.executable, "-c", "import tensorflow"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15,
            )
            if res.returncode != 0:
                logger.warning(f"MLService: TensorFlow test import failed (code {res.returncode}). Using fallback.")
                return
        except Exception as e:
            logger.warning(f"MLService: TensorFlow subprocess check failed: {e}. Using fallback.")
            return

        try:
            from tensorflow.keras.models import load_model
            cls._lstm_model = load_model(path)
            cls._lstm_loaded = True
            logger.info(f"MLService: LSTM model loaded from {path}.")
        except Exception as e:
            logger.warning(f"MLService: Failed to load LSTM ({e}). Using rule-based fallback.")

    @classmethod
    def _load_xgb(cls, xgb_path: str, meta_path: str):
        try:
            from xgboost import XGBClassifier
            if not os.path.exists(xgb_path):
                logger.warning(f"MLService: XGBoost model file not found at {xgb_path}.")
                return
            cls._xgb_model = XGBClassifier()
            cls._xgb_model.load_model(xgb_path)
            cls._xgb_loaded = True
            if os.path.exists(meta_path):
                with open(meta_path) as f:
                    cls._metadata = json.load(f)
            logger.info("MLService: XGBoost fingerprinting model loaded.")
        except Exception as e:
            logger.warning(f"MLService: Failed to load XGBoost ({e}).")

    @classmethod
    def _load_scalers(cls, path: str):
        try:
            if not os.path.exists(path):
                logger.warning(f"MLService: Scaler file not found at {path}.")
                return
            cls._scalers = joblib.load(path)
            logger.info("MLService: Inference scalers loaded.")
        except Exception as e:
            logger.warning(f"MLService: Failed to load scalers ({e}).")

    # ── Public inference ───────────────────────────────────────────────────

    @classmethod
    def status(cls) -> dict:
        return {
            "lstm_loaded": cls._lstm_loaded,
            "xgb_loaded":  cls._xgb_loaded,
            "scalers_loaded": cls._scalers is not None,
        }

    @classmethod
    def predict_aqi_ahead(cls, features_24h: list) -> dict:
        """
        Input : list of 24 feature dicts with keys:
                pm25, no2, wind_speed, wind_dir_sin, wind_dir_cos,
                humidity, temp, traffic_index, hour_sin, hour_cos, day_of_week
        Output: { forecast: [{horizon_h, aqi}, ...], confidence: float }
        """
        feature_cols = [
            "pm25", "no2", "wind_speed", "wind_dir_sin", "wind_dir_cos",
            "humidity", "temp", "traffic_index", "hour_sin", "hour_cos", "day_of_week",
        ]

        # ── LSTM inference path ────────────────────────────────────────────
        if cls._lstm_model and cls._scalers and len(features_24h) >= 24:
            try:
                data = []
                for item in features_24h[-24:]:
                    row = [float(item.get(c, 0.0)) for c in feature_cols]
                    data.append(row)

                arr = np.array(data)
                scaled_X = cls._scalers["X"].transform(arr)
                pred_scaled = cls._lstm_model.predict(
                    np.expand_dims(scaled_X, axis=0), verbose=0
                )
                prediction = cls._scalers["y"].inverse_transform(pred_scaled)[0]

                return {
                    "forecast": [
                        {"horizon_h": 1,  "aqi": round(float(prediction[0]), 1)},
                        {"horizon_h": 3,  "aqi": round(float(prediction[1]), 1)},
                        {"horizon_h": 6,  "aqi": round(float(prediction[2]), 1)},
                        {"horizon_h": 12, "aqi": round(float(prediction[3]), 1)},
                        {"horizon_h": 24, "aqi": round(float(prediction[4]), 1)},
                    ],
                    "confidence": 0.84,
                    "source": "lstm_model",
                }
            except Exception as e:
                logger.error(f"LSTM inference error: {e}")

        # ── Rule-based fallback ────────────────────────────────────────────
        latest = features_24h[-1] if features_24h else {}
        base = float(latest.get("pm25", 45.0))
        # Apply a simple diurnal decay / rise pattern
        return {
            "forecast": [
                {"horizon_h": 1,  "aqi": round(base * 1.04)},
                {"horizon_h": 3,  "aqi": round(base * 1.09)},
                {"horizon_h": 6,  "aqi": round(base * 1.05)},
                {"horizon_h": 12, "aqi": round(base * 0.92)},
                {"horizon_h": 24, "aqi": round(base * 0.98)},
            ],
            "confidence": 0.50,
            "source": "rule_based_fallback",
        }

    @classmethod
    def fingerprint_source(cls, reading: dict) -> dict:
        """
        Input : {pm25, pm10, pm1, no2, so2, wind_dir_degrees, hour, month, is_weekend}
        Output: {source, confidence, probabilities}
        """
        if cls._xgb_model and cls._metadata:
            try:
                features = cls._metadata.get("features", [])
                labels   = cls._metadata.get("labels", {})
                data = [float(reading.get(f, 0.0)) for f in features]
                arr  = np.array(data).reshape(1, -1)
                probs = cls._xgb_model.predict_proba(arr)[0]
                idx   = int(np.argmax(probs))
                source = labels.get(str(idx), "Unknown")
                prob_dict = {
                    labels.get(str(i), f"Class_{i}"): float(round(p, 4))
                    for i, p in enumerate(probs)
                }
                return {"source": source, "confidence": round(float(probs[idx]), 4), "probabilities": prob_dict}
            except Exception as e:
                logger.error(f"XGBoost fingerprint error: {e}")

        # ── Heuristic fallback based on reading values ─────────────────────
        pm25 = float(reading.get("pm25", 0))
        no2  = float(reading.get("no2", 0))
        hour = int(reading.get("hour", 12))

        if no2 > 40 and 7 <= hour <= 21:
            source, conf = "Vehicular Emissions", 0.72
        elif pm25 > 100:
            source, conf = "Industrial / Dust", 0.65
        else:
            source, conf = "Mixed / Background", 0.55

        return {
            "source": source,
            "confidence": conf,
            "probabilities": {source: conf, "Other": round(1 - conf, 2)},
            "note": "heuristic_fallback",
        }
