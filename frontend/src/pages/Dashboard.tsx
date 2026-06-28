import React, { useState, useEffect } from "react";
import { apiService } from "../services/api";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { AlertCircle, Wind, Thermometer, Droplets, Navigation, Filter, Info, Factory, Car, Leaf, HelpCircle } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { SkeletonLayout } from "../components/SkeletonCard";

// ── City groups for the station picker ───────────────────────────────────────
const CITY_GROUPS: Record<string, string[]> = {
  Delhi:    ["Delhi", "delhi"],
  Pune:     ["Pune", "pune", "Hinjewadi", "Katraj"],
  PCMC:     ["PCMC", "Pimpri", "Bhosari"],
  Lonavala: ["Lonavala", "Sinhgad", "ESP32"],
};

function stationCity(name: string): string {
  for (const [city, keywords] of Object.entries(CITY_GROUPS)) {
    if (keywords.some((kw) => name.includes(kw))) return city;
  }
  return "Other";
}

// ── Source confidence badge helper ──────────────────────────────────────────
function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 0.85)
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
        Confirmed
      </span>
    );
  if (confidence >= 0.65)
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
        Likely
      </span>
    );
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-500/15 text-zinc-400 border border-zinc-500/30">
      Uncertain
    </span>
  );
}

// ── Source icon helper ────────────────────────────────────────────────────────
function sourceIcon(source: string) {
  const s = source.toLowerCase();
  if (s.includes("vehicular") || s.includes("traffic") || s.includes("road")) return Car;
  if (s.includes("industrial") || s.includes("dust")) return Factory;
  if (s.includes("biomass") || s.includes("burning") || s.includes("biogenic")) return Leaf;
  return HelpCircle;
}

// ── Weather card color lookup — full class names required for Tailwind JIT ────
const WEATHER_COLOR_MAP: Record<string, string> = {
  amber:   "bg-amber-500/10 text-amber-500",
  blue:    "bg-blue-500/10 text-blue-500",
  emerald: "bg-emerald-500/10 text-emerald-500",
  purple:  "bg-purple-500/10 text-purple-500",
};

export const Dashboard: React.FC = () => {
  const [stations, setStations]           = useState<any[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<number>(1);
  const [currentAqi, setCurrentAqi]       = useState<any>(undefined); // undefined=loading, null=offline, object=data
  const [historyData, setHistoryData]     = useState<any[] | null>([]);
  const [activePollutant, setActivePollutant] = useState("pm25");
  const [timeRange, setTimeRange]         = useState(7);
  const [sourcesData, setSourcesData]     = useState<any>(undefined); // undefined = loading, null = error
  const [stationsLoading, setStationsLoading] = useState(true);

  // Load stations once
  useEffect(() => {
    const fetchStations = async () => {
      setStationsLoading(true);
      const data = await apiService.getStations();
      setStations(data);
      if (data.length > 0) setSelectedStationId(data[0].id);
      setStationsLoading(false);
    };
    fetchStations();
  }, []);

  // Load data when station or time range changes
  useEffect(() => {
    const loadStationData = async () => {
      const station = stations.find((s) => s.id === selectedStationId);
      if (!station) return;

      const [live, hist] = await Promise.all([
        apiService.getLiveAQI(station.latitude, station.longitude),
        apiService.getHistory(selectedStationId, undefined, undefined, timeRange),
      ]);
      setCurrentAqi(live);
      setHistoryData(hist);
    };
    if (selectedStationId && stations.length > 0) loadStationData();
  }, [selectedStationId, stations, timeRange]);

  // Fetch pollution sources whenever selected station changes
  useEffect(() => {
    const station = stations.find((s) => s.id === selectedStationId);
    if (!station) return;
    setSourcesData(undefined); // reset to loading
    apiService.getSources(station.latitude, station.longitude).then(setSourcesData);
  }, [selectedStationId, stations]);

  const getAqiColor = (aqi: number) => {
    if (aqi < 50)  return "#10b981";
    if (aqi < 100) return "#f59e0b";
    if (aqi < 200) return "#ef4444";
    return "#8b5cf6";
  };

  const getAqiSeverity = (aqi: number) => {
    if (aqi < 50)  return { label: "Good",                           desc: "Air quality is satisfactory." };
    if (aqi < 100) return { label: "Moderate",                       desc: "Acceptable for most; sensitive groups should monitor." };
    if (aqi < 200) return { label: "Unhealthy",                      desc: "Health effects possible for all; sensitive groups at risk." };
    if (aqi < 300) return { label: "Very Unhealthy",                 desc: "Health alert — avoid prolonged outdoor exposure." };
    return           { label: "Hazardous",                           desc: "Emergency conditions — everyone may experience serious effects." };
  };

  const selectedStation = stations.find((s) => s.id === selectedStationId);

  // Group stations by city for picker
  const grouped: Record<string, any[]> = {};
  stations.forEach((s) => {
    const city = stationCity(s.name);
    grouped[city] = grouped[city] || [];
    grouped[city].push(s);
  });

  // Show skeleton while initial station list is loading
  if (stationsLoading) return <SkeletonLayout rows={2} />;

  return (
    <div className="space-y-6 text-left">
      {/* Station selector bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Environmental Telemetry Centre</h2>
          <p className="text-xs text-muted-foreground">
            Live AQI readings from CPCB-linked stations across Delhi, Pune, PCMC & Lonavala
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Station picker grouped by city */}
          <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-lg border border-border">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select
              value={selectedStationId}
              onChange={(e) => setSelectedStationId(Number(e.target.value))}
              className="bg-transparent text-sm focus:outline-none font-medium cursor-pointer"
            >
              {Object.entries(grouped).map(([city, sts]) => (
                <optgroup key={city} label={`── ${city} ──`}>
                  {sts.map((s) => (
                    <option key={s.id} value={s.id} className="bg-background text-foreground">
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Time range */}
          <div className="flex items-center gap-1.5 bg-muted p-1 rounded-lg border border-border">
            {[7, 14, 30].map((days) => (
              <button
                key={days}
                onClick={() => setTimeRange(days)}
                className={`text-xs px-2.5 py-1 rounded-md font-semibold transition-all ${
                  timeRange === days
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {days}D
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Offline state */}
      {currentAqi === null && (
        <EmptyState message="Backend offline — start the FastAPI server to see live data." />
      )}

      {/* AQI loading skeleton */}
      {currentAqi === undefined && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 h-52 rounded-3xl border border-border bg-card animate-pulse" />
          <div className="h-52 rounded-3xl border border-border bg-card animate-pulse" />
        </div>
      )}

      {/* AQI + Weather row */}
      {currentAqi && currentAqi !== null && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main AQI card */}
          <div className="md:col-span-2 bg-card p-6 rounded-3xl border border-border shadow-sm flex flex-col justify-between relative overflow-hidden">
            <div className="absolute right-0 top-0 w-48 h-48 bg-gradient-to-bl from-blue-500/10 to-transparent pointer-events-none rounded-full" />
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
                    Current Air Quality
                  </span>
                  <h3 className="text-2xl font-bold mt-0.5">{selectedStation?.name || "Active Station"}</h3>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  Live Feed
                </div>
              </div>

              <div className="flex items-baseline gap-6 my-4">
                <span
                  className="text-6xl md:text-7xl font-extrabold tracking-tight"
                  style={{ color: getAqiColor(currentAqi.aqi) }}
                >
                  {Math.round(currentAqi.aqi)}
                </span>
                <div>
                  <span
                    className="text-sm font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border"
                    style={{
                      color: getAqiColor(currentAqi.aqi),
                      borderColor: `${getAqiColor(currentAqi.aqi)}40`,
                      backgroundColor: `${getAqiColor(currentAqi.aqi)}10`,
                    }}
                  >
                    {getAqiSeverity(currentAqi.aqi).label}
                  </span>
                  <p className="text-xs text-muted-foreground mt-2 max-w-sm">
                    {getAqiSeverity(currentAqi.aqi).desc}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1 italic">
                    Source: {currentAqi.source}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border/80">
              {[
                { label: "PM2.5", value: `${currentAqi.pm25} µg/m³` },
                { label: "PM10",  value: currentAqi.pm10 ? `${currentAqi.pm10} µg/m³` : "—" },
                { label: "NO₂",   value: currentAqi.no2  ? `${currentAqi.no2} ppb`    : "—" },
                { label: "SO₂",   value: currentAqi.so2  ? `${currentAqi.so2} ppb`    : "—" },
              ].map((p) => (
                <div key={p.label} className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {p.label}
                  </span>
                  <p className="text-lg font-bold">{p.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Weather telemetry */}
          <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-6">
            <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Live Weather · Open-Meteo
            </h4>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: Thermometer, color: "amber",   label: "Temperature", value: `${currentAqi.weather?.temperature ?? "—"}°C` },
                { icon: Droplets,   color: "blue",    label: "Humidity",    value: `${currentAqi.weather?.humidity ?? "—"}%` },
                { icon: Wind,       color: "emerald", label: "Wind Speed",  value: `${currentAqi.weather?.wind_speed ?? "—"} km/h` },
                { icon: Navigation, color: "purple",  label: "Wind Dir",    value: `${currentAqi.weather?.wind_direction_sector || currentAqi.weather?.wind_direction || "—"}` },
              ].map(({ icon: Icon, color, label, value }) => (
                <div key={label} className={`flex items-center gap-3 bg-muted/50 p-3 rounded-2xl border border-border/60`}>
                  <div className={`p-2 rounded-lg ${WEATHER_COLOR_MAP[color] ?? "bg-zinc-500/10 text-zinc-500"}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-muted-foreground block">{label}</span>
                    <span className="text-base font-bold">{value}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* ESP32 notice */}
            {selectedStation?.name?.includes("ESP32") && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground">
                  <span className="font-bold text-amber-500">ESP32 IoT Node</span> — Hardware uses MQ135 CO₂
                  sensor + DHT22. Data is currently simulated via MQTT telemetry (hardware offline).
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Trend chart */}
        <div className="md:col-span-2 bg-card p-6 rounded-3xl border border-border shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h4 className="text-lg font-bold">Historical AQI Trend</h4>
              <p className="text-xs text-muted-foreground">Station telemetry from local database + API fusion</p>
            </div>
            <div className="flex items-center gap-2 bg-muted p-0.5 rounded-lg border border-border">
              {[{ id: "pm25", label: "PM2.5" }, { id: "aqi", label: "AQI" }].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setActivePollutant(opt.id)}
                  className={`text-xs px-3 py-1 rounded-md font-semibold transition-all ${
                    activePollutant === opt.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-64">
            {!historyData || historyData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No history data. Seed the database via Admin Panel.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historyData || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={activePollutant === "aqi" ? "#8b5cf6" : "#2563eb"} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={activePollutant === "aqi" ? "#8b5cf6" : "#2563eb"} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="timestamp" stroke="#888" fontSize={10} tickLine={false} axisLine={false}
                    tickFormatter={(v) => { const d = new Date(v); return `${d.getMonth()+1}/${d.getDate()}`; }} />
                  <YAxis stroke="#888" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip labelFormatter={(v) => new Date(v).toLocaleString()}
                    contentStyle={{ backgroundColor: "rgba(30,30,40,.9)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8 }} />
                  <Area type="monotone" dataKey={activePollutant}
                    stroke={activePollutant === "aqi" ? "#8b5cf6" : "#2563eb"}
                    fillOpacity={1} fill="url(#colorValue)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── Pollution Sources Card (XGBoost) ─────────────────────────── */}
        <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-lg font-bold">Pollution Source Analysis</h4>
              <p className="text-xs text-muted-foreground">XGBoost source-fingerprinting classifier</p>
            </div>
            {sourcesData && sourcesData.model_available && (
              <ConfidenceBadge confidence={sourcesData.confidence} />
            )}
          </div>

          {/* Loading */}
          {sourcesData === undefined && (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground animate-pulse">
              Analysing pollution fingerprint…
            </div>
          )}

          {/* Backend offline or model unavailable */}
          {(sourcesData === null || (sourcesData && !sourcesData.model_available && !Object.keys(sourcesData.probabilities ?? {}).length)) && (
            <div className="h-48 flex flex-col items-center justify-center gap-3 text-center">
              <div className="p-3 bg-zinc-500/10 rounded-full">
                <HelpCircle className="w-7 h-7 text-zinc-500" />
              </div>
              <p className="text-sm font-semibold text-muted-foreground">Source analysis unavailable</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                {sourcesData?.context_note ?? "Backend offline or XGBoost model not loaded."}
              </p>
            </div>
          )}

          {/* Real data from model */}
          {sourcesData && sourcesData.probabilities && Object.keys(sourcesData.probabilities).length > 0 && (
            <div className="space-y-4">
              {/* Dominant source row */}
              <div className="flex items-center gap-3 p-3 bg-muted/60 rounded-2xl border border-border/60">
                {(() => {
                  const Icon = sourceIcon(sourcesData.source);
                  return <div className="p-2 bg-primary/10 text-primary rounded-xl"><Icon className="w-5 h-5" /></div>;
                })()}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{sourcesData.source}</p>
                  <p className="text-[10px] text-muted-foreground">Dominant source · {(sourcesData.confidence * 100).toFixed(1)}% confidence</p>
                </div>
              </div>

              {/* Probability bars */}
              <div className="space-y-2.5">
                {Object.entries(sourcesData.probabilities as Record<string, number>)
                  .sort(([, a], [, b]) => b - a)
                  .map(([label, prob]) => {
                    const pct = Math.round(prob * 100);
                    const Icon = sourceIcon(label);
                    const barColor =
                      label.toLowerCase().includes("vehicular") || label.toLowerCase().includes("traffic")
                        ? "bg-blue-500"
                        : label.toLowerCase().includes("industrial") || label.toLowerCase().includes("dust")
                        ? "bg-rose-500"
                        : label.toLowerCase().includes("biomass") || label.toLowerCase().includes("burning")
                        ? "bg-amber-500"
                        : "bg-violet-500";
                    return (
                      <div key={label}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium">{label}</span>
                          </div>
                          <span className="text-xs font-bold tabular-nums">{pct}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Context note */}
              {sourcesData.context_note && (
                <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border/60 pt-3">
                  {sourcesData.context_note}
                </p>
              )}

              {/* Last updated */}
              <p className="text-[10px] text-muted-foreground/60">
                Last updated{" "}
                {sourcesData.updated_at
                  ? (() => {
                      const diff = Math.round((Date.now() - new Date(sourcesData.updated_at).getTime()) / 60000);
                      return diff < 2 ? "just now" : `${diff} min ago`;
                    })()
                  : "—"}
                {" · "}{sourcesData.station_name}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
