import React, { useState, useEffect } from "react";
import { apiService } from "../services/api";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { Sliders, CheckCircle2, Info, Fingerprint } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { SkeletonLayout } from "../components/SkeletonCard";
import { MapContainer, TileLayer, CircleMarker } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// ── City presets for the forecast location picker ─────────────────────────────
const LOCATIONS = [
  { label: "Delhi — Anand Vihar",           lat: 28.6469, lng: 77.3164 },
  { label: "Delhi — ITO",                   lat: 28.6280, lng: 77.2411 },
  { label: "Pune — Central Hub",            lat: 18.5204, lng: 73.8567 },
  { label: "PCMC — Pimpri-Chinchwad",       lat: 18.6298, lng: 73.7997 },
  { label: "Lonavala — Sinhgad Institute",  lat: 18.7530, lng: 73.4063 },
];

export const Forecast: React.FC = () => {
  const [forecastData, setForecastData]       = useState<any | null>(null);
  const [selectedLocation, setSelectedLocation] = useState(LOCATIONS[0]);
  const [loading, setLoading]                 = useState(false);
  const [isOffline, setIsOffline]             = useState(false);
  const [selectedModel, setSelectedModel]     = useState("LSTM Sequence Model");
  const [lstmLoaded, setLstmLoaded]           = useState<boolean>(false);

  useEffect(() => {
    const fetchMLStatus = async () => {
      try {
        const baseUrl = "https://expoair-airsense.onrender.com";
        const response = await fetch(`${baseUrl}/api/admin/model-status`);
        if (response.ok) {
          const data = await response.json();
          setLstmLoaded(data.lstm_loaded);
        }
      } catch (err) {
        console.error("Failed to fetch ML status", err);
      }
    };
    fetchMLStatus();
  }, []);

  // SHAP interactive sliders
  const [pm25Slider,  setPm25Slider]  = useState(45);
  const [windSlider,  setWindSlider]  = useState(8);
  const [tempSlider,  setTempSlider]  = useState(27);
  const humiditySlider = 55;

  const loadForecast = async (customFeatures?: any) => {
    setLoading(true);
    setIsOffline(false);
    const data = await apiService.getForecast(
      selectedLocation.lat,
      selectedLocation.lng,
      customFeatures,
    );
    if (data === null) {
      setIsOffline(true);
    } else {
      setForecastData(data);
    }
    setLoading(false);
  };

  useEffect(() => { loadForecast(); }, [selectedLocation]);

  const handleSliderChange = () => {
    loadForecast({ pm25: pm25Slider, wind_speed: windSlider, temperature: tempSlider, humidity: humiditySlider });
  };

  const getAqiClass = (aqi: number) => {
    if (aqi < 50)  return "text-emerald-500 bg-emerald-500/10 border-emerald-500/25";
    if (aqi < 100) return "text-amber-500 bg-amber-500/10 border-amber-500/25";
    if (aqi < 200) return "text-red-500 bg-red-500/10 border-red-500/25";
    return "text-purple-500 bg-purple-500/10 border-purple-500/25";
  };

  const activeModel = forecastData?.models?.find((m: any) => m.model_name === selectedModel);

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Explainable AI (XAI) Forecasting</h2>
          <p className="text-xs text-muted-foreground">
            Multi-model AQI forecasts with SHAP additive explanations — trained on CPCB station history
          </p>
        </div>

        {/* Location picker */}
        <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-lg border border-border shrink-0">
          <select
            value={`${selectedLocation.lat},${selectedLocation.lng}`}
            onChange={(e) => {
              const [lat, lng] = e.target.value.split(",").map(Number);
              const loc = LOCATIONS.find((l) => l.lat === lat && l.lng === lng) || LOCATIONS[0];
              setSelectedLocation(loc);
            }}
            className="bg-transparent text-sm focus:outline-none font-medium cursor-pointer"
          >
            {LOCATIONS.map((l) => (
              <option key={l.label} value={`${l.lat},${l.lng}`} className="bg-background text-foreground">
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Live map — key forces Leaflet remount when location changes */}
      <div className="rounded-3xl overflow-hidden border border-border shadow-sm" style={{ height: 280 }}>
        <MapContainer
          key={`${selectedLocation.lat}-${selectedLocation.lng}`}
          center={[selectedLocation.lat, selectedLocation.lng]}
          zoom={11}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <CircleMarker
            center={[selectedLocation.lat, selectedLocation.lng]}
            radius={14}
            pathOptions={{ color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.6 }}
          />
        </MapContainer>
      </div>

      {/* Data source badge */}
      {forecastData?.data_source && (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-600 dark:text-blue-400 font-medium">
          <Info className="w-4 h-4 shrink-0" />
          <span>Data source: {forecastData.data_source}</span>
        </div>
      )}

      {/* Skeleton during initial load (no data yet) */}
      {loading && !forecastData && <SkeletonLayout rows={2} />}

      {/* Spinner for re-fetch while data already exists */}
      {loading && forecastData && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          Running forecast models…
        </div>
      )}

      {/* Offline state */}
      {isOffline && !loading && (
        <EmptyState message="Backend offline — start the FastAPI server to run forecasts." />
      )}

      {forecastData && !isOffline && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Model comparison cards + timeline */}
          <div className="lg:col-span-2 space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              {forecastData.models.map((m: any) => {
                const isFingerprinter = m.model_name === "Pollution Source Fingerprinter";
                return (
                  <button
                    key={m.model_name}
                    onClick={() => setSelectedModel(m.model_name)}
                    className={`p-5 rounded-2xl border text-left transition-all relative overflow-hidden ${
                      selectedModel === m.model_name
                        ? "bg-card border-blue-500 dark:border-emerald-500 shadow-sm"
                        : "bg-card/40 border-border hover:border-border/80"
                    }`}
                  >
                    <div className="space-y-3">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                        {isFingerprinter ? "XGBoost Classifier" : "Predictive Model"}
                      </span>
                      <div className="flex flex-col gap-1.5">
                        <h4 className="font-bold text-sm">{m.model_name}</h4>
                        {!isFingerprinter && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border self-start max-w-full truncate ${
                            lstmLoaded
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                          }`}>
                            {lstmLoaded ? "✅ LSTM (lstm_aqi.keras)" : "⚠️ Rule-based fallback"}
                          </span>
                        )}
                      </div>

                      {isFingerprinter ? (
                        /* Source Fingerprinter card — shows classification output */
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Fingerprint className="w-4 h-4 text-violet-500" />
                            <span className="text-base font-extrabold text-violet-400 truncate">
                              {m.source_class ?? "—"}
                            </span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold border border-violet-500/30 text-violet-400 bg-violet-500/10">
                            {Math.round((m.source_confidence ?? 0) * 100)}% confidence
                          </span>
                        </div>
                      ) : (
                        /* LSTM card — shows AQI number */
                        <div className="flex justify-between items-baseline">
                          <span className="text-3xl font-extrabold tracking-tight">
                            {Math.round(m.prediction_tomorrow ?? 0)}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${getAqiClass(m.prediction_tomorrow ?? 0)}`}>
                            AQI
                          </span>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground border-t border-border pt-2.5">
                        <div>R²: <span className="font-bold text-foreground">{m.accuracy_r2}</span></div>
                        {!isFingerprinter && <div>MAE: <span className="font-bold text-foreground">{m.mae}</span></div>}
                        <div className="col-span-2">
                          Conf: <span className="font-bold text-foreground">{Math.round(m.confidence * 100)}%</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Detail panel — LSTM shows area chart; Fingerprinter shows probability bars */}
            {activeModel && (
              <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-4">
                {activeModel.model_name === "Pollution Source Fingerprinter" ? (
                  <>
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="text-base font-bold">Pollution Source Probability Breakdown</h4>
                        <p className="text-xs text-muted-foreground">XGBoost classifier output — not an AQI prediction</p>
                      </div>
                      <div className="text-xs font-semibold text-violet-400 bg-violet-500/10 px-2.5 py-1 rounded-lg border border-violet-500/20">
                        Source: {activeModel.source_class}
                      </div>
                    </div>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={Object.entries(activeModel.source_probabilities ?? {}).map(([name, prob]) => ({ name, prob: Math.round((prob as number) * 100) }))}
                          margin={{ top: 10, right: 10, left: -10, bottom: 40 }}
                          layout="vertical"
                        >
                          <XAxis type="number" domain={[0, 100]} stroke="#888" fontSize={10} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
                          <YAxis type="category" dataKey="name" stroke="#888" fontSize={10} width={130} tickLine={false} axisLine={false} />
                          <Tooltip formatter={(v: any) => `${v}%`} contentStyle={{ backgroundColor: "rgba(30,30,40,.9)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8 }} />
                          <Bar dataKey="prob" radius={[0, 4, 4, 0]}>
                            {Object.keys(activeModel.source_probabilities ?? {}).map((key, idx) => (
                              <Cell key={key} fill={idx === 0 ? "#7c3aed" : `hsl(${260 + idx * 30}, 70%, 60%)`} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="text-base font-bold">24-Hour Predictive Timeline</h4>
                        <p className="text-xs text-muted-foreground">Horizon forecast — {selectedModel}</p>
                      </div>
                      <div className="text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-lg border border-border">
                        Confidence: {Math.round(activeModel.confidence * 100)}%
                      </div>
                    </div>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={activeModel.forecast_24h} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="hour" stroke="#888" fontSize={10} tickFormatter={(v) => `+${v}h`} tickLine={false} axisLine={false} />
                          <YAxis stroke="#888" fontSize={10} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ backgroundColor: "rgba(30,30,40,.9)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8 }} />
                          <Area type="monotone" dataKey="aqi" stroke="#2563eb" fillOpacity={1} fill="url(#fg)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* SHAP panel */}
          <div className="space-y-6">
            <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-5">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-blue-500" />
                <h3 className="font-bold text-sm uppercase tracking-wider">Interactive SHAP Simulator</h3>
              </div>

              {/* Sliders */}
              <div className="space-y-4 border-b border-border pb-4">
                {[
                  { label: "Base PM2.5 (µg/m³)", val: pm25Slider, set: setPm25Slider, min: 5, max: 150 },
                  { label: "Wind Speed (km/h)",   val: windSlider, set: setWindSlider, min: 1, max: 30 },
                  { label: "Temperature (°C)",    val: tempSlider, set: setTempSlider, min: 5, max: 45 },
                ].map(({ label, val, set, min, max }) => (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span>{label}</span>
                      <span className="text-blue-500">{val}</span>
                    </div>
                    <input
                      type="range" min={min} max={max} value={val}
                      onChange={(e) => set(Number(e.target.value))}
                      onMouseUp={handleSliderChange} onTouchEnd={handleSliderChange}
                      className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                ))}
              </div>

              {/* SHAP contributions */}
              <div className="space-y-3.5">
                <div className="flex justify-between items-center gap-2">
                  <div className="flex items-center gap-1">
                    <h4 className="text-xs font-bold text-muted-foreground">Feature Attribution Analysis (SHAP-style)</h4>
                    <Info 
                      className="w-3.5 h-3.5 text-muted-foreground/60 cursor-help shrink-0" 
                      title="Approximated feature impact scores using deviation from 24h baseline. Not computed using SHAP library — educational approximation." 
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    Additive Property Met
                  </span>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {forecastData.shap_explanation.shap_contributions.map((s: any, idx: number) => {
                    const positive = s.shap_value > 0;
                    const barWidth = Math.min(100, Math.abs(s.shap_value) / Math.max(1, forecastData.predicted_aqi) * 200);
                    return (
                      <div key={idx} className="p-3 bg-muted/40 rounded-xl border border-border/80 text-xs space-y-1.5">
                        <div className="flex justify-between items-center font-bold">
                          <span className="capitalize">{s.feature.replace("_", " ")}</span>
                          <span className={positive ? "text-red-500" : "text-emerald-500"}>
                            {positive ? "+" : ""}{s.shap_value.toFixed(1)} pts
                          </span>
                        </div>
                        {/* Mini bar */}
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${positive ? "bg-red-400" : "bg-emerald-400"}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-normal">{s.description}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-3 border-t border-border space-y-1.5 text-xs">
                  <div className="flex justify-between items-baseline">
                    <span className="text-muted-foreground">Expected Base AQI (24h mean)</span>
                    <span className="font-bold">{forecastData.shap_explanation.base_value}</span>
                  </div>
                  <div className="flex justify-between items-baseline text-sm font-extrabold">
                    <span>Predicted Final AQI</span>
                    <span className="text-blue-600 dark:text-emerald-400">{Math.round(forecastData.predicted_aqi)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
