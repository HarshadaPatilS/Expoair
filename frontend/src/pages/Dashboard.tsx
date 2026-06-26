import React, { useState, useEffect } from "react";
import { apiService } from "../services/api";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { AlertCircle, Wind, Thermometer, Droplets, Navigation, Filter } from "lucide-react";

export const Dashboard: React.FC = () => {
  const [stations, setStations] = useState<any[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<number>(1);
  const [currentAqi, setCurrentAqi] = useState<any>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [activePollutant, setActivePollutant] = useState<string>("pm25");
  const [timeRange, setTimeRange] = useState<number>(7); // days

  useEffect(() => {
    const fetchStations = async () => {
      const data = await apiService.getStations();
      setStations(data);
      if (data.length > 0) {
        setSelectedStationId(data[0].id);
      }
    };
    fetchStations();
  }, []);

  useEffect(() => {
    const loadStationData = async () => {
      const station = stations.find(s => s.id === selectedStationId);
      if (!station) return;
      
      // Fetch live AQI and history
      const live = await apiService.getLiveAQI(station.latitude, station.longitude);
      setCurrentAqi(live);

      const hist = await apiService.getHistory(selectedStationId, undefined, undefined, timeRange);
      setHistoryData(hist);
    };

    if (selectedStationId) {
      loadStationData();
    }
  }, [selectedStationId, stations, timeRange]);

  const getAqiColor = (aqi: number) => {
    if (aqi < 50) return "#10b981"; // Emerald
    if (aqi < 100) return "#f59e0b"; // Amber
    if (aqi < 150) return "#ef4444"; // Red
    return "#8b5cf6"; // Purple
  };

  const getAqiSeverity = (aqi: number) => {
    if (aqi < 50) return { label: "Good", desc: "Air quality is satisfactory." };
    if (aqi < 100) return { label: "Moderate", desc: "Acceptable quality; sensitive people should monitor." };
    if (aqi < 150) return { label: "Unhealthy for Sensitive Groups", desc: "Vulnerable groups may experience health effects." };
    return { label: "Hazardous", desc: "Health alert: everyone may experience serious effects." };
  };

  const selectedStation = stations.find(s => s.id === selectedStationId);

  return (
    <div className="space-y-6 text-left">
      {/* Station Selector Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Environmental Telemetry Center</h2>
          <p className="text-xs text-muted-foreground">Select local station or apply custom coordinates grid filters</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-lg border border-border">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select 
              value={selectedStationId} 
              onChange={(e) => setSelectedStationId(Number(e.target.value))}
              className="bg-transparent text-sm focus:outline-none font-medium cursor-pointer"
            >
              {stations.map(s => (
                <option key={s.id} value={s.id} className="bg-background text-foreground">{s.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-muted p-1 rounded-lg border border-border">
            {[7, 14, 30].map(days => (
              <button
                key={days}
                onClick={() => setTimeRange(days)}
                className={`text-xs px-2.5 py-1 rounded-md font-semibold transition-all ${timeRange === days ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {days}D
              </button>
            ))}
          </div>
        </div>
      </div>

      {currentAqi && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main AQI Display Card */}
          <div className="md:col-span-2 bg-card p-6 rounded-3xl border border-border shadow-sm flex flex-col justify-between relative overflow-hidden">
            <div className="absolute right-0 top-0 w-48 h-48 bg-gradient-to-bl from-blue-500/10 to-transparent pointer-events-none rounded-full" />
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">Current Air Quality</span>
                  <h3 className="text-2xl font-bold mt-0.5">{selectedStation?.name || "Active Grid Coordinates"}</h3>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  Live Feed
                </div>
              </div>

              <div className="flex items-baseline gap-6 my-4">
                <span className="text-6xl md:text-7xl font-extrabold tracking-tight" style={{ color: getAqiColor(currentAqi.aqi) }}>
                  {Math.round(currentAqi.aqi)}
                </span>
                <div>
                  <span className="text-sm font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border" style={{ color: getAqiColor(currentAqi.aqi), borderColor: `${getAqiColor(currentAqi.aqi)}40`, backgroundColor: `${getAqiColor(currentAqi.aqi)}10` }}>
                    {getAqiSeverity(currentAqi.aqi).label}
                  </span>
                  <p className="text-xs text-muted-foreground mt-2 max-w-sm">{getAqiSeverity(currentAqi.aqi).desc}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border/80">
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">PM2.5 (Fine Particulates)</span>
                <p className="text-lg font-bold">{currentAqi.pm25} µg/m³</p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">PM10 (Coarse Particulates)</span>
                <p className="text-lg font-bold">{currentAqi.pm10 || "—"} µg/m³</p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">NO2 (Nitrogen Dioxide)</span>
                <p className="text-lg font-bold">{currentAqi.no2 || "—"} ppb</p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">SO2 (Sulfur Dioxide)</span>
                <p className="text-lg font-bold">{currentAqi.so2 || "—"} ppb</p>
              </div>
            </div>
          </div>

          {/* Meteorological Observations */}
          <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-6">
            <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Weather Telemetry</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 bg-muted/50 p-3 rounded-2xl border border-border/60">
                <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg">
                  <Thermometer className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-muted-foreground block">Temperature</span>
                  <span className="text-base font-bold">{currentAqi.weather?.temperature || 26.5}°C</span>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-muted/50 p-3 rounded-2xl border border-border/60">
                <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
                  <Droplets className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-muted-foreground block">Humidity</span>
                  <span className="text-base font-bold">{currentAqi.weather?.humidity || 52}%</span>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-muted/50 p-3 rounded-2xl border border-border/60">
                <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
                  <Wind className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-muted-foreground block">Wind Speed</span>
                  <span className="text-base font-bold">{currentAqi.weather?.wind_speed || 12} km/h</span>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-muted/50 p-3 rounded-2xl border border-border/60">
                <div className="p-2 bg-purple-500/10 text-purple-500 rounded-lg">
                  <Navigation className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-muted-foreground block">Wind Dir</span>
                  <span className="text-base font-bold">{currentAqi.weather?.wind_direction || 270}°</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-blue-500/10 border border-blue-500/25 rounded-2xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <h5 className="text-xs font-bold text-blue-600 dark:text-blue-400">Weather-AQI Stagnation Index</h5>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Low wind speed of {currentAqi.weather?.wind_speed || 12} km/h is causing moderate particulate stagnation.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Historical Logs and Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Trend Area Chart */}
        <div className="md:col-span-2 bg-card p-6 rounded-3xl border border-border shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h4 className="text-lg font-bold">Historical Air Telemetry</h4>
              <p className="text-xs text-muted-foreground">Historical progression of selected pollutants</p>
            </div>
            
            <div className="flex items-center gap-2 bg-muted p-0.5 rounded-lg border border-border">
              {[
                { id: "pm25", label: "PM2.5" },
                { id: "aqi", label: "AQI" }
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setActivePollutant(opt.id)}
                  className={`text-xs px-3 py-1 rounded-md font-semibold transition-all ${activePollutant === opt.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={historyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={activePollutant === "aqi" ? "#8b5cf6" : "#2563eb"} stopOpacity={0.25}/>
                    <stop offset="95%" stopColor={activePollutant === "aqi" ? "#8b5cf6" : "#2563eb"} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="timestamp" 
                  tickFormatter={(val) => {
                    const d = new Date(val);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                  stroke="#888888"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="#888888"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip 
                  labelFormatter={(val) => new Date(val).toLocaleString()}
                  contentStyle={{ backgroundColor: "rgba(30, 30, 40, 0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }}
                />
                <Area type="monotone" dataKey={activePollutant} stroke={activePollutant === "aqi" ? "#8b5cf6" : "#2563eb"} fillOpacity={1} fill="url(#colorValue)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Diurnal Traffic vs Pollution Profile */}
        <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-4">
          <div>
            <h4 className="text-lg font-bold">Diurnal Source Allocation</h4>
            <p className="text-xs text-muted-foreground">Estimated source influence by hours of the day</p>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { hour: "Morning Peak", vehicular: 45, industrial: 20, biogenic: 15 },
                { hour: "Mid-Day", vehicular: 18, industrial: 24, biogenic: 12 },
                { hour: "Evening Peak", vehicular: 55, industrial: 22, biogenic: 16 },
                { hour: "Night Stable", vehicular: 25, industrial: 38, biogenic: 10 }
              ]}>
                <XAxis dataKey="hour" stroke="#888888" fontSize={9} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="vehicular" name="Traffic" fill="#3b82f6" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="industrial" name="Industry" fill="#ef4444" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="biogenic" name="Natural" fill="#10b981" stackId="a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
