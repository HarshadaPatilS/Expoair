class ExposureService:
    ACTIVITY_MULTIPLIERS = {
        "resting": 1.0,
        "walking": 1.4,
        "cycling": 1.8,
        "jogging": 2.2,
        "commuting_vehicle": 1.2
    }
    
    WHO_DAILY_LIMIT_PM25 = 15.0  # µg/m³ (24-hr mean)

    @classmethod
    def calculate_dose(cls, readings: list[dict]) -> dict:
        """
        Parses a list of tracking intervals calculating the localized equivalent PM2.5 dosage
        taking exertion and temporal parameters into account.
        """
        total_dose = 0.0
        total_minutes = 0.0
        peak_aqi = -1.0
        peak_location = {"lat": None, "lng": None}
        
        for reading in readings:
            aqi = float(reading.get('aqi', 0.0))
            duration = float(reading.get('duration_minutes', 0.0))
            activity = str(reading.get('activity', 'resting')).lower()
            
            lat = reading.get('lat')
            lng = reading.get('lng')
            
            # Match multiplier or fallback to 1.0 (resting)
            mult = cls.ACTIVITY_MULTIPLIERS.get(activity, 1.0)
            
            dose_per_reading = aqi * duration * mult
            
            total_dose += dose_per_reading
            total_minutes += duration
            
            if aqi > peak_aqi:
                peak_aqi = aqi
                peak_location = {"lat": lat, "lng": lng}
                
        equivalent_pm25 = (total_dose / total_minutes) if total_minutes > 0 else 0.0
        
        # Metric clamping Health index naturally up to 100 max
        health_index = min(100.0, (equivalent_pm25 / cls.WHO_DAILY_LIMIT_PM25) * 100.0)
        
        return {
            "total_dose": round(total_dose, 2),
            "equivalent_pm25_ugm3": round(equivalent_pm25, 2),
            "health_index_0_to_100": round(health_index, 2),
            "peak_reading": round(peak_aqi, 2) if peak_aqi >= 0 else None,
            "peak_location": peak_location
        }

    @classmethod
    def get_safety_score(cls, aqi: float, health_profile: dict) -> dict:
        """
        Calculates safe-to-exert boundaries considering pre-existing underlying patient demographics.
        """
        age_group = str(health_profile.get("age_group", "adult")).lower()
        asthma = str(health_profile.get("asthma", "none")).lower()
        pregnant = bool(health_profile.get("pregnant", False))
        cardiovascular = bool(health_profile.get("cardiovascular", False))
        
        # Calculate base safety score (ideal safe condition logic translates AQI mappings from 0->300+)
        safety_score = max(0.0, 100.0 - (aqi / 2.5)) 
        
        # Personalize vulnerability threshold
        vulnerability_factor = 1.0
        
        if age_group in ["child", "senior"]:
            vulnerability_factor *= 1.2
            
        if asthma == "severe":
            vulnerability_factor *= 1.5
        elif asthma == "mild":
            vulnerability_factor *= 1.2
            
        if pregnant:
            vulnerability_factor *= 1.1
            
        if cardiovascular:
            vulnerability_factor *= 1.3
            
        # Re-scale effective exposure boundaries to map vulnerability penalties
        effective_aqi = aqi * vulnerability_factor
        
        if effective_aqi < 50:
            risk_level = "safe"
            message = "Air quality is favorable. Good for outdoor activities."
            recommended_action = "Enjoy your day outside without restrictions."
        elif effective_aqi < 100:
            risk_level = "moderate"
            message = "Acceptable air quality, but sensitive demographics could be affected."
            recommended_action = "General public is fine. Exceptionally sensitive groups should watch for symptoms."
        elif effective_aqi < 150:
            risk_level = "high"
            message = "Air quality is poor and potentially impacting for your specific health bracket."
            recommended_action = "Limit prolonged exertion outside. If asthmatic, keep your inhaler nearby."
            safety_score -= 15.0
        else:
            risk_level = "hazardous"
            message = "Current ambient air poses a significant localized threat to your established health profile."
            recommended_action = "Stay indoors. Close windows/doors and utilize an air purifier if available."
            safety_score -= 35.0
            
        # Bound
        safety_score = max(0.0, min(100.0, safety_score))
        
        return {
            "safety_score_0_to_100": round(safety_score, 1),
            "risk_level": risk_level,
            "message": message,
            "recommended_action": recommended_action
        }
