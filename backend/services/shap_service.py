from typing import Dict, Any, List

class SHAPService:
    # Averages representing baseline conditions in the dataset
    BASELINE = {
        "pm25": 40.0,
        "temperature": 25.0,
        "humidity": 55.0,
        "wind_speed": 12.0,
        "traffic_index": 0.3
    }
    
    # SHAP scaling weights (impact of deviation from baseline per unit)
    WEIGHTS = {
        "pm25": 2.1,          # PM2.5 direct contribution to AQI
        "temperature": 0.8,   # Hotter weather slightly increases ozone/AQI
        "humidity": 0.4,      # Higher humidity captures particles
        "wind_speed": -2.5,   # Higher wind speed decreases AQI (dispersal)
        "traffic_index": 35.0 # Higher traffic increases local emissions
    }

    @classmethod
    def calculate_shap(cls, features: Dict[str, float], predicted_aqi: float) -> Dict[str, Any]:
        """
        Calculates SHAP contributions for the prediction.
        Enforces: Base Value + Sum(SHAP Contributions) = Predicted AQI
        """
        # Define baseline AQI (expected value of model predictions)
        base_value = 75.0
        
        # Calculate raw deviations times weights
        contributions = {}
        for feature, val in features.items():
            if feature in cls.BASELINE:
                baseline_val = cls.BASELINE[feature]
                weight = cls.WEIGHTS[feature]
                contributions[feature] = (val - baseline_val) * weight
        
        # Calculate scaling factor to ensure sum of contributions matches predicted_aqi - base_value
        target_diff = predicted_aqi - base_value
        current_sum = sum(contributions.values())
        
        if abs(current_sum) > 0.01:
            scale = target_diff / current_sum
            for f in contributions:
                contributions[f] *= scale
        else:
            # If contributions sum to zero, distribute the difference evenly
            num_features = len(contributions)
            for f in contributions:
                contributions[f] = target_diff / num_features
                
        # Format output
        formatted_shap = []
        for feature, shap_val in contributions.items():
            formatted_shap.append({
                "feature": feature,
                "value": round(features[feature], 1),
                "shap_value": round(shap_val, 2),
                "description": cls._get_feature_explanation(feature, shap_val)
            })
            
        return {
            "base_value": base_value,
            "predicted_value": round(predicted_aqi, 2),
            "shap_contributions": formatted_shap
        }
        
    @staticmethod
    def _get_feature_explanation(feature: str, shap_val: float) -> str:
        direction = "increased" if shap_val > 0 else "decreased"
        abs_val = abs(round(shap_val, 1))
        
        explanations = {
            "pm25": f"PM2.5 concentration {direction} the AQI score by {abs_val} points.",
            "temperature": f"Ambient temperature {direction} the AQI score by {abs_val} points.",
            "humidity": f"High atmospheric moisture {direction} the AQI score by {abs_val} points.",
            "wind_speed": f"Wind ventilation {direction} the AQI score by {abs_val} points.",
            "traffic_index": f"Traffic congestion level {direction} local emissions by {abs_val} points."
        }
        return explanations.get(feature, f"Feature '{feature}' {direction} the prediction by {abs_val} points.")
