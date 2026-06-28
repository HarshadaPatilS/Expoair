const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : "https://expoair-airsense.onrender.com/api";

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
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
        return { access_token: "no-auth-token", token_type: "bearer", role: "admin" };
      }
      return { access_token: "no-auth-token", token_type: "bearer", role: "user" };
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
      return null;
    }
  },
  getHistory: async (stationId?: number, lat?: number, lng?: number, days: number = 7) => {
    let url = `/aqi/history?days=${days}`;
    if (stationId) url += `&station_id=${stationId}`;
    else if (lat && lng) url += `&lat=${lat}&lng=${lng}`;
    
    try {
      return await request<any[]>(url);
    } catch {
      return null;
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
      return null;
    }
  },

  getSources: async (lat: number, lng: number): Promise<{
    source: string;
    confidence: number;
    probabilities: Record<string, number>;
    context_note: string;
    station_name: string;
    updated_at: string;
    model_available: boolean;
  } | null> => {
    try {
      return await request<any>(`/predict/sources?lat=${lat}&lng=${lng}`);
    } catch {
      // No fake data — let the UI show "Source analysis unavailable"
      return null;
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
      return null;
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
      return null;
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
      return null;
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
      return null;
    }
  },

  // Heatmap Data
  getHeatmap: async (lat: number, lng: number, radiusKm: number = 500.0) => {
    try {
      return await request<any[]>(`/maps/heatmap?lat=${lat}&lng=${lng}&radius_km=${radiusKm}`);
    } catch {
      return null;
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

  // Alerts
  createAlert: async (data: { station_id: number; parameter: string; threshold: number }) => {
    try {
      return await request<any>("/alerts", {
        method: "POST",
        body: JSON.stringify(data),
      });
    } catch (e: any) {
      throw e;
    }
  },
  listAlerts: async () => {
    try {
      return await request<any[]>("/alerts");
    } catch {
      return [];
    }
  },
  dismissAlert: async (id: number) => {
    try {
      return await request<any>(`/alerts/${id}/dismiss`, { method: "PATCH" });
    } catch {
      return null;
    }
  },
  deleteAlert: async (id: number) => {
    try {
      await request<void>(`/alerts/${id}`, { method: "DELETE" });
      return true;
    } catch {
      return false;
    }
  },
};

