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
    
    @classmethod
    def initialize(cls):
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        models_dir = os.path.join(base_dir, "ml", "models_saved")
        
        lstm_path = os.path.join(models_dir, "lstm_aqi.h5")
        xgb_path = os.path.join(models_dir, "source_fingerprinter.json")
        scaler_path = os.path.join(models_dir, "scaler.pkl")
        meta_path = os.path.join(models_dir, "fingerprinter_meta.json")
        
        # Load LSTM
        try:
            from tensorflow.keras.models import load_model # lazy load to keep startup light if it fails
            cls._lstm_model = load_model(lstm_path)
            logger.info("MLService: Loaded LSTM sequence model.")
        except Exception as e:
            logger.warning(f"MLService: Failed to load LSTM model ({e}). Using rule-based fallback.")
            
        # Load XGBoost & Metadata
        try:
            from xgboost import XGBClassifier
            cls._xgb_model = XGBClassifier()
            cls._xgb_model.load_model(xgb_path)
            
            if os.path.exists(meta_path):
                with open(meta_path, "r") as f:
                    cls._metadata = json.load(f)
            logger.info("MLService: Loaded XGBoost fingerprinting model.")
        except Exception as e:
             logger.warning(f"MLService: Failed to load XGB model ({e}). Using rule-based fallback.")
             
        # Load Scalers
        try:
            cls._scalers = joblib.load(scaler_path)
            logger.info("MLService: Loaded inference scalers.")
        except Exception as e:
            logger.warning(f"MLService: Failed to load scalers ({e}).")

    @classmethod
    def predict_aqi_ahead(cls, features_24h: list[dict]) -> dict:
        """
        Takes 24 hours of feature dicts.
        Scales input, runs LSTM inference.
        Returns: { forecast: [{horizon_h: 1, aqi: 87}, ...], confidence: 0.84 }
        """
        # Feature columns based on trained notebook
        feature_cols = ['pm25', 'no2', 'wind_speed', 'wind_dir_sin', 'wind_dir_cos', 
                        'humidity', 'temp', 'traffic_index', 'hour_sin', 'hour_cos', 'day_of_week']
        
        if not cls._lstm_model or not cls._scalers or len(features_24h) < 24:
            # Rule-based fallback
            latest = features_24h[-1] if features_24h else {'aqi': 50}
            base = float(latest.get('pm25', latest.get('aqi', 50)))
            return {
                "forecast": [
                    {"horizon_h": 1, "aqi": round(base * 1.05)},
                    {"horizon_h": 3, "aqi": round(base * 1.1)},
                    {"horizon_h": 6, "aqi": round(base * 1.05)},
                    {"horizon_h": 12, "aqi": round(base * 0.9)},
                    {"horizon_h": 24, "aqi": round(base)}
                ],
                "confidence": 0.5,
                "note": "using rule-based fallback"
            }
            
        try:
            data = []
            for item in features_24h[-24:]:
                row = [float(item.get(c, 0.0)) for c in feature_cols]
                data.append(row)
            
            arr = np.array(data)
            scaled_X = cls._scalers['X'].transform(arr)
            prediction_scaled = cls._lstm_model.predict(np.expand_dims(scaled_X, axis=0), verbose=0)
            prediction = cls._scalers['y'].inverse_transform(prediction_scaled)[0]
            
            return {
                "forecast": [
                    {"horizon_h": 1, "aqi": round(float(prediction[0]), 2)},
                    {"horizon_h": 3, "aqi": round(float(prediction[1]), 2)},
                    {"horizon_h": 6, "aqi": round(float(prediction[2]), 2)},
                    {"horizon_h": 12, "aqi": round(float(prediction[3]), 2)},
                    {"horizon_h": 24, "aqi": round(float(prediction[4]), 2)}
                ],
                "confidence": 0.84
            }
        except Exception as e:
            logger.error(f"Inference error in LSTM: {e}")
            return {"forecast": [], "confidence": 0.0}

    @classmethod
    def fingerprint_source(cls, current_reading: dict) -> dict:
        """
        Input: {pm25, pm10, pm1, no2, so2, wind_dir_degrees, hour, month, is_weekend}
        Returns: { source: "Vehicular", confidence: 0.79, probabilities: {...} }
        """
        if not cls._xgb_model or not cls._metadata:
             return {
                 "source": "Unknown (Fallback)",
                 "confidence": 0.5,
                 "probabilities": {"Unknown": 1.0},
                 "note": "using rule-based fallback"
             }
        
        try:
             features = cls._metadata.get('features', [])
             labels = cls._metadata.get('labels', {})
             
             data = []
             for f in features:
                 # Default values mapped to 0 if absent
                 data.append(float(current_reading.get(f, 0.0)))
                 
             arr = np.array(data).reshape(1, -1)
             probs = cls._xgb_model.predict_proba(arr)[0]
             pred_idx = int(np.argmax(probs))
             source_name = labels.get(str(pred_idx), "Unknown")
             
             prob_dict = {labels.get(str(i), f"Class_{i}"): float(round(p, 4)) for i, p in enumerate(probs)}
             
             return {
                 "source": source_name,
                 "confidence": float(round(probs[pred_idx], 4)),
                 "probabilities": prob_dict
             }
        except Exception as e:
             logger.error(f"Inference error in XGBoost source extraction: {e}")
             return {
                 "source": "Error",
                 "confidence": 0.0,
                 "probabilities": {}
             }
