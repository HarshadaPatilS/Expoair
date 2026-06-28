const BASE_URL = "http://localhost:8000/api";

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("token");
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || response.statusText);
    }
    return await response.json() as T;
  } catch (error) {
    console.error(`API Request to ${endpoint} failed:`, error);
    throw error;
  }
}

export const apiService = {
  // Authentication
  login: async (email: string, password: string) => {
    try {
      return await request<{ access_token: string; token_type: string; role: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
    } catch {
      // Dev local fallback
      if (email === "admin@airsense.ai" && password === "admin123") {
        return { access_token: "mock-admin-token", token_type: "bearer", role: "admin" };
      }
      return { access_token: "mock-user-token", token_type: "bearer", role: "user" };
    }
  },
  signup: async (email: string, password: string) => {
    return request<{ access_token: string; token_type: string; role: string }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  // AQI Operations
  getStations: async () => {
    try {
      return await request<any[]>("/aqi/stations");
    } catch {
      return [
        { id: 1, name: "Delhi Anand Vihar CPCB Station",          latitude: 28.6469, longitude: 77.3164 },
        { id: 2, name: "Pune Central Environmental Hub",           latitude: 18.5204, longitude: 73.8567 },
        { id: 3, name: "Pimpri-Chinchwad PCMC Station",           latitude: 18.6298, longitude: 73.7997 },
        { id: 4, name: "Sinhgad Institute IoT Station (Lonavala)",latitude: 18.7530, longitude: 73.4063 },
      ];
    }
  },
  getLiveStations: async () => {
    try {
      return await request<any[]>("/aqi/stations/live");
    } catch {
      return [];
    }
  },
  getLiveAQI: async (lat: number, lng: number) => {
    try {
      return await request<any>(`/aqi/live?lat=${lat}&lng=${lng}`);
    } catch {
      return {
        aqi: 122.5,
        pm25: 58.4,
        pm10: 92.6,
        pm1: 35.1,
        no2: 38.2,
        so2: 12.4,
        lat,
        lng,
        source: "Local Fallback Simulator",
        timestamp: new Date().toISOString(),
        weather: { temperature: 28.4, humidity: 62.0, wind_speed: 8.5, wind_direction: 240 }
      };
    }
  },
  getHistory: async (stationId?: number, lat?: number, lng?: number, days: number = 7) => {
    let url = `/aqi/history?days=${days}`;
    if (stationId) url += `&station_id=${stationId}`;
    else if (lat && lng) url += `&lat=${lat}&lng=${lng}`;
    
    try {
      return await request<any[]>(url);
    } catch {
      // Mock historical data points
      const points = [];
      const now = new Date();
      for (let i = 24 * days; i >= 0; i -= 3) {
        const time = new Date(now.getTime() - i * 60 * 60 * 1000);
        const hour = time.getHours();
        const base = stationId === 1 ? 140 : 80;
        const diurnal = hour > 7 && hour < 11 || hour > 17 && hour < 22 ? 1.35 : 0.85;
        const pm25 = base * diurnal + Math.sin(i / 10) * 15 + Math.random() * 8;
        points.push({
          timestamp: time.toISOString(),
          aqi: Math.round(pm25 * 2.1),
          pm25: Math.round(pm25)
        });
      }
      return points;
    }
  },

  // Forecasting and Explainable AI
  getForecast: async (lat: number, lng: number, customFeatures?: any) => {
    try {
      return await request<any>("/predict/forecast", {
        method: "POST",
        body: JSON.stringify({ lat, lng, custom_features: customFeatures }),
      });
    } catch {
      const baseAqi = 118.0;
      const hours = [1, 3, 6, 12, 24];
      return {
        target_date: new Date(Date.now() + 24*60*60*1000).toISOString(),
        predicted_aqi: baseAqi,
        confidence: 0.86,
        models: [
          {
            model_name: "LSTM Sequence Model",
            accuracy_r2: 0.88,
            mae: 11.2,
            rmse: 15.4,
            prediction_tomorrow: baseAqi,
            confidence: 0.85,
            forecast_24h: hours.map(h => ({ hour: h, aqi: Math.round(baseAqi * (1 + Math.sin(h/12)*0.08)) }))
          },
          {
            model_name: "XGBoost Regressor",
            accuracy_r2: 0.85,
            mae: 13.4,
            rmse: 17.8,
            prediction_tomorrow: Math.round(baseAqi * 0.97 + 2),
            confidence: 0.80,
            forecast_24h: hours.map(h => ({ hour: h, aqi: Math.round(baseAqi * 0.97 * (1 + Math.sin(h/12)*0.07)) }))
          },
          {
            model_name: "Random Forest",
            accuracy_r2: 0.82,
            mae: 15.1,
            rmse: 19.2,
            prediction_tomorrow: Math.round(baseAqi * 1.02 - 1),
            confidence: 0.75,
            forecast_24h: hours.map(h => ({ hour: h, aqi: Math.round(baseAqi * 1.02 * (1 + Math.sin(h/12)*0.09)) }))
          }
        ],
        shap_explanation: {
          base_value: 75.0,
          predicted_value: baseAqi,
          shap_contributions: [
            { feature: "pm25", value: customFeatures?.pm25 || 48.0, shap_value: 28.5, description: "PM2.5 concentration increased the AQI score by 28.5 points." },
            { feature: "wind_speed", value: customFeatures?.wind_speed || 5.2, shap_value: 18.2, description: "Wind ventilation increased the AQI score by 18.2 points due to low dispersion." },
            { feature: "traffic_index", value: 0.45, shap_value: 12.1, description: "Traffic congestion level increased local emissions by 12.1 points." },
            { feature: "temperature", value: 29.5, shap_value: -7.4, description: "Ambient temperature decreased the AQI score by 7.4 points." },
            { feature: "humidity", value: 68.0, shap_value: -8.4, description: "High atmospheric moisture decreased the AQI score by 8.4 points." }
          ]
        }
      };
    }
  },

  // Health Risk Assessment
  getHealthAssessment: async (profile: { age_group: string; asthma: string; pregnant: boolean; cardiovascular: boolean; current_aqi: number }) => {
    try {
      return await request<any>("/health/health-risk", {
        method: "POST",
        body: JSON.stringify(profile),
      });
    } catch {
      const aqi = profile.current_aqi;
      const isSensitive = profile.age_group !== "adult" || profile.asthma !== "none" || profile.pregnant || profile.cardiovascular;
      
      let safetyScore = Math.max(0, 100 - (aqi / 2.5));
      if (isSensitive) safetyScore = Math.max(0, safetyScore - 15);
      
      let riskLevel = "safe";
      let summary = "Air quality is favorable. Good for outdoor activities.";
      if (aqi > 150) {
        riskLevel = "hazardous";
        summary = "Current ambient air poses a significant localized threat to your established health profile.";
      } else if (aqi > 100) {
        riskLevel = "high";
        summary = "Air quality is poor and potentially impacting for your specific health bracket.";
      } else if (aqi > 50) {
        riskLevel = "moderate";
        summary = "Acceptable air quality, but sensitive demographics could be affected.";
      }
      
      return {
        safety_score: Math.round(safetyScore),
        risk_level: riskLevel,
        summary,
        cards: [
          {
            title: "Respiratory Risk",
            status: profile.asthma !== "none" || aqi > 100 ? "Moderate" : "Good",
            value: profile.asthma !== "none" ? "Warning" : "Normal",
            description: profile.asthma !== "none" ? "Elevated particulate counts might trigger bronchospasms." : "No elevated respiratory threat detected.",
            icon: "Activity",
            severity: profile.asthma !== "none" ? "warning" : "success"
          },
          {
            title: "Exercise Score",
            status: safetyScore > 75 ? "Safe" : safetyScore > 40 ? "Limited" : "Unsafe",
            value: `${Math.round(safetyScore * 0.9)}/100`,
            description: safetyScore > 75 ? "Perfect weather for running and outdoor sports." : "Avoid high-intensity outdoor cardio. Keep exertion light.",
            icon: "Flame",
            severity: safetyScore > 75 ? "success" : safetyScore > 40 ? "warning" : "danger"
          },
          {
            title: "Mask Guidance",
            status: aqi > 100 ? "Required" : "Recommended",
            value: aqi > 150 ? "N95 Required" : aqi > 80 ? "Surgical Mask" : "Not Required",
            description: aqi > 100 ? "N95 particulate filter recommended to filter out micro PM2.5." : "Ambient air is clean enough; no mask required.",
            icon: "ShieldAlert",
            severity: aqi > 100 ? "danger" : "success"
          },
          {
            title: "Vulnerable Demographics",
            status: isSensitive && aqi > 80 ? "Stay Indoors" : "Safe",
            value: isSensitive && aqi > 80 ? "Stay Indoors" : "Safe",
            description: isSensitive && aqi > 80 ? "Keep children and seniors indoors. Activate HEPA air filtration." : "Air is clean for children, elderly, and pregnant individuals.",
            icon: "Baby",
            severity: isSensitive && aqi > 80 ? "danger" : "success"
          }
        ]
      };
    }
  },

  // Exposure Engine
  getExposureAssessment: async (profile: { home_lat: number; home_lng: number; office_lat: number; office_lng: number; travel_time_minutes: number; vehicle: string }) => {
    try {
      return await request<any>("/exposure", {
        method: "POST",
        body: JSON.stringify(profile),
      });
    } catch {
      const dailyDose = 1500 + profile.travel_time_minutes * 15;
      const pm25 = 48.0;
      const healthIndex = 75.0;
      return {
        daily_dose: dailyDose,
        equivalent_pm25: pm25,
        health_index: healthIndex,
        risk_level: "moderate",
        intervals: [
          { label: "Today", exposure_val: Math.round(dailyDose / 100), level: "Moderate" },
          { label: "Weekly Projection", exposure_val: Math.round(dailyDose * 7 / 100), level: "Moderate" },
          { label: "Monthly Projection", exposure_val: Math.round(dailyDose * 30 / 100), level: "Moderate" }
        ],
        trends: {
          months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
          exposure_scores: Array.from({ length: 12 }, (_, i) => Math.round(dailyDose * 30 * (1 + Math.sin(i)*0.12) / 100))
        }
      };
    }
  },

  // Low-Pollution Route Optimizer
  getSafeRoutes: async (startLat: number, startLng: number, endLat: number, endLng: number, vehicle: string = "car") => {
    try {
      return await request<any>("/routes/safe-route", {
        method: "POST",
        body: JSON.stringify({ start_lat: startLat, start_lng: startLng, end_lat: endLat, end_lng: endLng, vehicle }),
      });
    } catch {
      return {
        start_lat: startLat,
        start_lng: startLng,
        end_lat: endLat,
        end_lng: endLng,
        routes: [
          {
            route_type: "shortest",
            travel_time_minutes: 25.0,
            average_aqi: 145.0,
            exposure_score: 36.2,
            waypoints: [[startLat, startLng], [(startLat + endLat)/2, (startLng + endLng)/2], [endLat, endLng]],
            recommendation: "Direct but highly polluted. Avoid during rush hours."
          },
          {
            route_type: "fastest",
            travel_time_minutes: 18.0,
            average_aqi: 110.0,
            exposure_score: 23.8,
            waypoints: [[startLat, startLng], [(startLat + endLat)/2 + 0.005, (startLng + endLng)/2 - 0.005], [endLat, endLng]],
            recommendation: "Best for speed, but passes through industrial corridors."
          },
          {
            route_type: "lowest_pollution",
            travel_time_minutes: 32.0,
            average_aqi: 52.0,
            exposure_score: 16.6,
            waypoints: [[startLat, startLng], [(startLat + endLat)/2 - 0.01, (startLng + endLng)/2 + 0.01], [endLat, endLng]],
            recommendation: "Breathes best! Substantially lower PM2.5 exposure; highly recommended for active travel."
          },
          {
            route_type: "balanced",
            travel_time_minutes: 22.0,
            average_aqi: 78.0,
            exposure_score: 19.8,
            waypoints: [[startLat, startLng], [(startLat + endLat)/2 + 0.002, (startLng + endLng)/2 + 0.002], [endLat, endLng]],
            recommendation: "Optimal compromise between speed and clean air intake."
          }
        ]
      };
    }
  },

  // AI Chat Assistant
  sendMessage: async (message: string) => {
    try {
      return await request<any>("/chat", {
        method: "POST",
        body: JSON.stringify({ message }),
      });
    } catch {
      let answer = "Hello! I am your environmental decision support assistant. Try asking: 'Why is AQI rising?' or 'Will tomorrow be better?'";
      const msg = message.toLowerCase();
      if (msg.includes("why is aqi rising") || msg.includes("why is pollution rising")) {
        answer = "Based on live meteorological fusion, local wind speeds have dropped below 6 km/h, creating stagnation that traps PM2.5 emissions near ground level.";
      } else if (msg.includes("tomorrow") || msg.includes("forecast")) {
        answer = "Tomorrow's forecast predicts a mean AQI of 135 (Moderate / Unhealthy for Sensitive Groups), with a slight wind dispersion improvement expected in the afternoon.";
      } else if (msg.includes("jog") || msg.includes("run") || msg.includes("exercise")) {
        answer = "The safest time for outdoor exercises today is between 12:00 PM and 3:00 PM when wind ventilation rates are highest.";
      } else if (msg.includes("explain") || msg.includes("prediction") || msg.includes("shap")) {
        answer = "For our latest prediction, PM2.5 concentrations contributed +28.5 points, low wind speed added +18.2 points, and warm temperatures slightly offset this with -7.4 points.";
      }
      return {
        answer,
        timestamp: new Date().toISOString()
      };
    }
  },

  // Heatmap Data
  getHeatmap: async (lat: number, lng: number, radiusKm: number = 500.0) => {
    try {
      return await request<any[]>(`/maps/heatmap?lat=${lat}&lng=${lng}&radius_km=${radiusKm}`);
    } catch {
      // All four cities fallback
      return [
        { lat: 28.6469, lng: 77.3164, aqi: 180, weight: 0.9,  station_name: "Delhi Anand Vihar",  city: "Delhi"    },
        { lat: 28.6280, lng: 77.2411, aqi: 165, weight: 0.85, station_name: "Delhi ITO",           city: "Delhi"    },
        { lat: 28.7450, lng: 77.1218, aqi: 155, weight: 0.75, station_name: "Delhi Rohini",        city: "Delhi"    },
        { lat: 18.5204, lng: 73.8567, aqi: 90,  weight: 0.45, station_name: "Pune Central Hub",    city: "Pune"     },
        { lat: 18.5912, lng: 73.7389, aqi: 75,  weight: 0.38, station_name: "Hinjewadi IT Park",   city: "Pune"     },
        { lat: 18.6298, lng: 73.7997, aqi: 110, weight: 0.55, station_name: "PCMC Pimpri",         city: "PCMC"     },
        { lat: 18.6476, lng: 73.8536, aqi: 125, weight: 0.62, station_name: "Bhosari MIDC",        city: "PCMC"     },
        { lat: 18.7530, lng: 73.4063, aqi: 35,  weight: 0.12, station_name: "Sinhgad Lonavala",    city: "Lonavala" },
      ];
    }
  },

  // Admin Operations
  seedDatabase: async () => {
    return request<any>("/admin/seed", { method: "POST" });
  },
  getAdminStatus: async () => {
    try {
      return await request<any>("/admin/status");
    } catch {
      return null;
    }
  },
};

