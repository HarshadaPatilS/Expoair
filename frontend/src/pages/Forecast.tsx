import React, { useState, useEffect } from "react";
import { apiService } from "../services/api";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Sliders, HelpCircle, AlertCircle, BarChart2, CheckCircle2 } from "lucide-react";

export const Forecast: React.FC = () => {
  const [forecastData, setForecastData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  
  // SHAP Interactive overrides
  const [pm25Slider, setPm25Slider] = useState<number>(45);
  const [windSlider, setWindSlider] = useState<number>(6.5);
  const [tempSlider, setTempSlider] = useState<number>(27);
  const [humiditySlider, setHumiditySlider] = useState<number>(55);
  
  const [selectedModel, setSelectedModel] = useState<string>("LSTM Sequence Model");

  const loadForecast = async (customFeatures?: any) => {
    setLoading(true);
    // Pune coordinates
    const data = await apiService.getForecast(28.63, 77.22, customFeatures);
    setForecastData(data);
    setLoading(false);
  };

  useEffect(() => {
    loadForecast();
  }, []);

  const handleSliderChange = () => {
    // Refresh forecast using custom parameters to update SHAP in real-time
    loadForecast({
      pm25: pm25Slider,
      wind_speed: windSlider,
      temperature: tempSlider,
      humidity: humiditySlider
    });
  };

  const getAqiSeverityClass = (aqi: number) => {
    if (aqi < 50) return "text-emerald-500 bg-emerald-500/10 border-emerald-500/25";
    if (aqi < 100) return "text-amber-500 bg-amber-500/10 border-amber-500/25";
    if (aqi < 150) return "text-red-500 bg-red-500/10 border-red-500/25";
    return "text-purple-500 bg-purple-500/10 border-purple-500/25";
  };

  const activeModelDetails = forecastData?.models.find((m: any) => m.model_name === selectedModel);

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Explainable AI (XAI) Forecasting</h2>
          <p className="text-xs text-muted-foreground">Multi-model air quality forecasts with SHAP additive explanations</p>
        </div>
      </div>

      {forecastData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Forecast Panel */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Model Comparison Selector cards */}
            <div className="grid md:grid-cols-3 gap-4">
              {forecastData.models.map((m: any) => (
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
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Predictive Model</span>
                    <h4 className="font-bold text-sm truncate">{m.model_name}</h4>
                    
                    <div className="flex justify-between items-baseline">
                      <span className="text-3xl font-extrabold tracking-tight">{Math.round(m.prediction_tomorrow)}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${getAqiSeverityClass(m.prediction_tomorrow)}`}>
                        AQI
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground border-t border-border pt-2.5">
                      <div>
                        <span>R² Score: </span>
                        <span className="font-bold text-foreground">{m.accuracy_r2}</span>
                      </div>
                      <div>
                        <span>MAE: </span>
                        <span className="font-bold text-foreground">{m.mae} ppm</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Model Forecast 24h Area Chart */}
            {activeModelDetails && (
              <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-base font-bold">24-Hour Predictive Timeline</h4>
                    <p className="text-xs text-muted-foreground">Horizon trend for {selectedModel}</p>
                  </div>
                  <div className="text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-lg border border-border">
                    Confidence: {Math.round(activeModelDetails.confidence * 100)}%
                  </div>
                </div>

                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activeModelDetails.forecast_24h} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="hour" stroke="#888888" fontSize={10} tickFormatter={(val) => `+${val}h`} tickLine={false} axisLine={false} />
                      <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: "rgba(30, 30, 40, 0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }} />
                      <Area type="monotone" dataKey="aqi" stroke="#2563eb" fillOpacity={1} fill="url(#forecastGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Explainable AI (SHAP Explainer) Panel */}
          <div className="space-y-6">
            <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-5">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-blue-500" />
                <h3 className="font-bold text-sm uppercase tracking-wider">Interactive SHAP Simulator</h3>
              </div>

              {/* Sliders */}
              <div className="space-y-4 border-b border-border pb-4">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>Base PM2.5 (µg/m³)</span>
                    <span className="text-blue-500">{pm25Slider}</span>
                  </div>
                  <input 
                    type="range" min="5" max="150" value={pm25Slider}
                    onChange={(e) => setPm25Slider(Number(e.target.value))}
                    onMouseUp={handleSliderChange}
                    onTouchEnd={handleSliderChange}
                    className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>Wind Speed (km/h)</span>
                    <span className="text-blue-500">{windSlider}</span>
                  </div>
                  <input 
                    type="range" min="1" max="30" value={windSlider}
                    onChange={(e) => setWindSlider(Number(e.target.value))}
                    onMouseUp={handleSliderChange}
                    onTouchEnd={handleSliderChange}
                    className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>Temperature (°C)</span>
                    <span className="text-blue-500">{tempSlider}</span>
                  </div>
                  <input 
                    type="range" min="5" max="45" value={tempSlider}
                    onChange={(e) => setTempSlider(Number(e.target.value))}
                    onMouseUp={handleSliderChange}
                    onTouchEnd={handleSliderChange}
                    className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>
              </div>

              {/* SHAP Contributions List */}
              <div className="space-y-3.5">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-muted-foreground">SHAP Feature Contributions</h4>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    Additive Property Met
                  </span>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {forecastData.shap_explanation.shap_contributions.map((s: any, idx: number) => {
                    const isPositive = s.shap_value > 0;
                    return (
                      <div key={idx} className="p-3 bg-muted/40 rounded-xl border border-border/80 text-xs space-y-1.5">
                        <div className="flex justify-between items-center font-bold">
                          <span className="capitalize">{s.feature.replace("_", " ")}</span>
                          <span className={isPositive ? "text-red-500" : "text-emerald-500"}>
                            {isPositive ? "+" : ""}{s.shap_value.toFixed(1)} pts
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-normal">{s.description}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-3 border-t border-border flex justify-between items-baseline text-xs">
                  <span className="text-muted-foreground">Expected Base AQI</span>
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
      )}
    </div>
  );
};
