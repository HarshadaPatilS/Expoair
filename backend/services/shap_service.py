from typing import Dict, Any, List
from sqlalchemy.orm import Session


class SHAPService:
    """
    Computes additive SHAP-style feature contributions for AQI predictions.

    base_value = mean AQI from the last 24 h of DB records  (dynamic)
    base_value + Σ contributions ≡ predicted_aqi            (enforced)
    """

    # Impact weights (contribution per unit deviation from baseline)
    BASELINE = {
        "pm25":          40.0,
        "temperature":   25.0,
        "humidity":      55.0,
        "wind_speed":    12.0,
        "traffic_index":  0.3,
    }

    WEIGHTS = {
        "pm25":          2.10,   # direct PM2.5 → AQI driver
        "temperature":   0.80,   # hotter → slight ozone/AQI increase
        "humidity":      0.40,   # moisture traps particles
        "wind_speed":   -2.50,   # wind disperses particulates
        "traffic_index": 35.0,   # congestion → local emissions spike
    }

    @classmethod
    def get_dynamic_base(cls, db: Session) -> float:
        """
        Returns the mean AQI over the last 24 h from the DB.
        Falls back to 75.0 if DB has no recent records.
        """
        try:
            from datetime import datetime, timedelta
            from database.schema import AQIRecord
            cutoff = datetime.utcnow() - timedelta(hours=24)
            records = (
                db.query(AQIRecord)
                .filter(AQIRecord.timestamp >= cutoff)
                .all()
            )
            if records:
                mean_aqi = sum(r.aqi for r in records) / len(records)
                return round(mean_aqi, 1)
        except Exception:
            pass
        return 75.0

    @classmethod
    def calculate_shap(
        cls,
        features: Dict[str, float],
        predicted_aqi: float,
        db: Session = None,
    ) -> Dict[str, Any]:
        """
        Parameters
        ----------
        features       : dict with keys matching BASELINE / WEIGHTS
        predicted_aqi  : the model's final AQI prediction
        db             : optional SQLAlchemy session for dynamic base_value

        Returns
        -------
        {base_value, predicted_value, shap_contributions: [{feature, value, shap_value, description}]}
        """
        base_value = cls.get_dynamic_base(db) if db is not None else 75.0

        # Raw deviations × weights
        raw: Dict[str, float] = {}
        for feat, val in features.items():
            if feat in cls.BASELINE:
                raw[feat] = (val - cls.BASELINE[feat]) * cls.WEIGHTS[feat]

        # Scale so contributions sum exactly to (predicted_aqi - base_value)
        target_diff = predicted_aqi - base_value
        current_sum = sum(raw.values())

        if abs(current_sum) > 0.01:
            scale = target_diff / current_sum
            for f in raw:
                raw[f] *= scale
        else:
            n = max(len(raw), 1)
            for f in raw:
                raw[f] = target_diff / n

        shap_list: List[Dict[str, Any]] = []
        for feat, shap_val in sorted(raw.items(), key=lambda x: -abs(x[1])):
            shap_list.append({
                "feature":     feat,
                "value":       round(features[feat], 2),
                "shap_value":  round(shap_val, 2),
                "description": cls._explain(feat, shap_val),
            })

        return {
            "base_value":         base_value,
            "predicted_value":    round(predicted_aqi, 2),
            "shap_contributions": shap_list,
        }

    @staticmethod
    def _explain(feature: str, shap_val: float) -> str:
        direction = "increased" if shap_val > 0 else "decreased"
        pts = abs(round(shap_val, 1))
        msgs = {
            "pm25":
                f"PM2.5 concentration {direction} the AQI score by {pts} points.",
            "temperature":
                f"Ambient temperature {direction} the AQI by {pts} points "
                f"({'warming promotes ozone formation' if shap_val > 0 else 'cooler air reduces ozone'}).",
            "humidity":
                f"Atmospheric moisture {direction} the AQI by {pts} points "
                f"({'hygroscopic growth traps particles' if shap_val > 0 else 'dry air disperses finer particles'}).",
            "wind_speed":
                f"Wind ventilation {direction} the AQI by {pts} points "
                f"({'low winds cause stagnation' if shap_val > 0 else 'strong winds disperse pollutants'}).",
            "traffic_index":
                f"Traffic congestion {direction} local emissions by {pts} points.",
        }
        return msgs.get(feature, f"'{feature}' {direction} the prediction by {pts} points.")
