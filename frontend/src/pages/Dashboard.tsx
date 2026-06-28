import React, { useState, useEffect } from "react";
import { apiService } from "../services/api";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from "recharts";
import { AlertCircle, Wind, Thermometer, Droplets, Navigation, Filter, Info } from "lucide-react";

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

export const Dashboard: React.FC = () => {
  const [stations, setStations]           = useState<any[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<number>(1);
  const [currentAqi, setCurrentAqi]       = useState<any>(null);
  const [historyData, setHistoryData]     = useState<any[]>([]);
  const [activePollutant, setActivePollutant] = useState("pm25");
  const [timeRange, setTimeRange]         = useState(7);
  const [diurnalData, setDiurnalData]     = useState<any[]>([]);

  // Load stations once
  useEffect(() => {
    const fetchStations = async () => {
      const data = await apiService.getStations();
      setStations(data);
      if (data.length > 0) setSelectedStationId(data[0].id);
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

      // Build diurnal source allocation from history
      buildDiurnal(hist);
    };
    if (selectedStationId && stations.length > 0) loadStationData();
  }, [selectedStationId, stations, timeRange]);

  // Compute diurnal profile from real history records
  function buildDiurnal(records: any[]) {
    if (!records.length) return;

    const buckets: Record<string, { vehicular: number[]; industrial: number[]; biogenic: number[] }> = {
      "Morning Peak": { vehicular: [], industrial: [], biogenic: [] },
      "Mid-Day":      { vehicular: [], industrial: [], biogenic: [] },
      "Evening Peak": { vehicular: [], industrial: [], biogenic: [] },
      "Night Stable": { vehicular: [], industrial: [], biogenic: [] },
    };

    records.forEach((r: any) => {
      const h = new Date(r.timestamp).getHours();
      let bucket: string;
      if (h >= 7  && h <= 10) bucket = "Morning Peak";
      else if (h >= 11 && h <= 16) bucket = "Mid-Day";
      else if (h >= 17 && h <= 21) bucket = "Evening Peak";
      else bucket = "Night Stable";

      const aqi = r.aqi || 0;
      // Heuristic apportionment: traffic dominates rush hours
      const veh_frac = (h >= 7 && h <= 10) || (h >= 17 && h <= 21) ? 0.55 : 0.25;
      const ind_frac = (h >= 9  && h <= 18) ? 0.28 : 0.42;
      const bio_frac = 1 - veh_frac - ind_frac;

      buckets[bucket].vehicular.push(aqi * veh_frac);
      buckets[bucket].industrial.push(aqi * ind_frac);
      buckets[bucket].biogenic.push(aqi * bio_frac);
    });

    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    setDiurnalData(
      Object.entries(buckets).map(([hour, vals]) => ({
        hour,
        vehicular:  avg(vals.vehicular),
        industrial: avg(vals.industrial),
        biogenic:   avg(vals.biogenic),
      }))
    );
  }

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

      {/* AQI + Weather row */}
      {currentAqi && (
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
                  <div className={`p-2 bg-${color}-500/10 text-${color}-500 rounded-lg`}>
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
            {historyData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No history data. Seed the database via Admin Panel.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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

        {/* Diurnal source allocation */}
        <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-4">
          <div>
            <h4 className="text-lg font-bold">Diurnal Source Allocation</h4>
            <p className="text-xs text-muted-foreground">
              Estimated emission source shares — computed from station history
            </p>
          </div>
          <div className="h-64">
            {diurnalData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Loading…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={diurnalData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                  <XAxis dataKey="hour" stroke="#888" fontSize={9} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="vehicular"  name="Traffic"    fill="#3b82f6" stackId="a" />
                  <Bar dataKey="industrial" name="Industry"   fill="#ef4444" stackId="a" />
                  <Bar dataKey="biogenic"   name="Natural"    fill="#10b981" stackId="a" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Apportionment estimated from AQI time-of-day patterns using traffic emission heuristics.
            Vehicular share peaks during commute hours; industrial share is higher mid-day.
          </p>
        </div>
      </div>
    </div>
  );
};
