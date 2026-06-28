import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from "react-leaflet";
import { apiService } from "../services/api";
import { Clock, ShieldCheck, RefreshCw, Compass, Navigation } from "lucide-react";
import "leaflet/dist/leaflet.css";

// ── City presets ──────────────────────────────────────────────────────────────
const CITY_PRESETS = [
  { label: "Delhi — Anand Vihar → ITO",    sLat: 28.6469, sLng: 77.3164, eLat: 28.6280, eLng: 77.2411 },
  { label: "Pune — Central → Hinjewadi",   sLat: 18.5204, sLng: 73.8567, eLat: 18.5912, eLng: 73.7389 },
  { label: "PCMC — Pimpri → Bhosari",      sLat: 18.6298, sLng: 73.7997, eLat: 18.6476, eLng: 73.8536 },
  { label: "Lonavala — NH 48 stretch",     sLat: 18.7490, sLng: 73.4070, eLat: 18.7530, eLng: 73.4063 },
];

// ── Route colour map ──────────────────────────────────────────────────────────
const ROUTE_STYLES: Record<string, { color: string; label: string }> = {
  shortest:         { color: "#ef4444", label: "Shortest" },
  fastest:          { color: "#3b82f6", label: "Fastest" },
  lowest_pollution: { color: "#10b981", label: "Cleanest" },
  balanced:         { color: "#8b5cf6", label: "Balanced" },
};

function aqiColor(aqi: number) {
  if (aqi <= 50)  return "#10b981";
  if (aqi <= 100) return "#f59e0b";
  if (aqi <= 200) return "#ef4444";
  if (aqi <= 300) return "#8b5cf6";
  return "#6b21a8";
}

// ── Map auto-fit to route bounds ──────────────────────────────────────────────
function FitBounds({ waypoints }: { waypoints: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (waypoints.length >= 2) {
      map.fitBounds(waypoints, { padding: [40, 40] });
    }
  }, [waypoints]);
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────
export const RoutePlanner: React.FC = () => {
  const [startLat, setStartLat] = useState(28.6469);
  const [startLng, setStartLng] = useState(77.3164);
  const [endLat,   setEndLat]   = useState(28.6280);
  const [endLng,   setEndLng]   = useState(77.2411);
  const [routes, setRoutes]     = useState<any[]>([]);
  const [selectedType, setSelectedType] = useState("lowest_pollution");
  const [loading, setLoading]   = useState(false);
  const [vehicle, setVehicle]   = useState("car");

  const fetchRoutes = async () => {
    setLoading(true);
    try {
      const data = await apiService.getSafeRoutes(startLat, startLng, endLat, endLng, vehicle);
      setRoutes(data.routes || []);
    } catch {
      setRoutes([]);
    }
    setLoading(false);
  };

  // Apply a city preset
  const applyPreset = (preset: typeof CITY_PRESETS[0]) => {
    setStartLat(preset.sLat); setStartLng(preset.sLng);
    setEndLat(preset.eLat);   setEndLng(preset.eLng);
  };

  // All waypoints of the active route (for map fitting)
  const activeRoute = routes.find((r) => r.route_type === selectedType);
  const allWPs: [number, number][] = activeRoute
    ? activeRoute.waypoints.map((wp: number[]) => [wp[0], wp[1]] as [number, number])
    : [];

  // Centre map on midpoint of start→end
  const mapCenter: [number, number] = [
    (startLat + endLat) / 2,
    (startLng + endLng) / 2,
  ];

  return (
    <div className="space-y-4 text-left">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Low-Pollution Route Planner</h2>
          <p className="text-xs text-muted-foreground">
            Compare transit routes by AQI exposure — powered by real station data
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Controls panel ─────────────────────────────────────────── */}
        <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <Compass className="w-5 h-5 text-blue-500" />
            <h3 className="font-bold text-sm uppercase tracking-wider">Journey Settings</h3>
          </div>

          {/* Presets */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase">Quick Presets</label>
            <div className="space-y-1.5">
              {CITY_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  className="w-full text-left px-3 py-2 text-xs rounded-xl border border-border bg-muted/40 hover:bg-muted font-medium transition-all truncate"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Coordinates */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase">Start (Lat, Lng)</label>
            <div className="grid grid-cols-2 gap-1.5">
              <input type="number" value={startLat} step="0.001" onChange={(e) => setStartLat(+e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs" />
              <input type="number" value={startLng} step="0.001" onChange={(e) => setStartLng(+e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase">End (Lat, Lng)</label>
            <div className="grid grid-cols-2 gap-1.5">
              <input type="number" value={endLat} step="0.001" onChange={(e) => setEndLat(+e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs" />
              <input type="number" value={endLng} step="0.001" onChange={(e) => setEndLng(+e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs" />
            </div>
          </div>

          {/* Vehicle */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase">Vehicle</label>
            <select value={vehicle} onChange={(e) => setVehicle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs">
              <option value="car">Car</option>
              <option value="bike">Bike / 2-Wheeler</option>
              <option value="walk">Walking</option>
            </select>
          </div>

          <button
            onClick={fetchRoutes}
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:opacity-95 text-white font-semibold text-xs mt-2 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            Analyse Routes
          </button>

          {/* Route selector */}
          {routes.length > 0 && (
            <div className="space-y-2 border-t border-border pt-4">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase">Select Route</h4>
              {routes.map((r) => {
                const style = ROUTE_STYLES[r.route_type] || { color: "#888", label: r.route_type };
                return (
                  <button
                    key={r.route_type}
                    onClick={() => setSelectedType(r.route_type)}
                    className={`w-full p-3 rounded-xl border text-left transition-all flex justify-between items-start gap-2 ${
                      selectedType === r.route_type
                        ? "border-blue-500 bg-card shadow-sm"
                        : "border-border bg-muted/40 hover:bg-muted/60"
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: style.color }} />
                        <span className="text-xs font-bold">{style.label}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground flex gap-2 pl-4">
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-3 h-3" /> {r.travel_time_minutes} min
                        </span>
                        <span>•</span>
                        <span>AQI {r.average_aqi}</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold shrink-0" style={{ color: aqiColor(r.average_aqi) }}>
                      Exp {r.exposure_score}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Map + info ──────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Leaflet map */}
          <div className="rounded-3xl overflow-hidden border border-border shadow-sm" style={{ height: 400 }}>
            {routes.length === 0 && !loading ? (
              <div className="w-full h-full bg-muted/40 flex flex-col items-center justify-center gap-3 rounded-3xl">
                <Navigation className="w-10 h-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground font-medium">
                  Select a preset or enter coordinates, then click <strong>Analyse Routes</strong>
                </p>
              </div>
            ) : (
              <MapContainer center={mapCenter} zoom={11} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
                />
                {allWPs.length >= 2 && <FitBounds waypoints={allWPs} />}

                {/* Draw all routes; active one is thicker */}
                {routes.map((r) => {
                  const style = ROUTE_STYLES[r.route_type] || { color: "#888" };
                  const isActive = r.route_type === selectedType;
                  const latlngs: [number, number][] = r.waypoints.map((wp: number[]) => [wp[0], wp[1]]);
                  return (
                    <Polyline
                      key={r.route_type}
                      positions={latlngs}
                      pathOptions={{
                        color: style.color,
                        weight: isActive ? 5 : 2,
                        opacity: isActive ? 0.95 : 0.35,
                        dashArray: isActive ? undefined : "6 4",
                      }}
                    />
                  );
                })}

                {/* Start marker */}
                <CircleMarker center={[startLat, startLng]} radius={9}
                  pathOptions={{ color: "#fff", fillColor: "#3b82f6", fillOpacity: 1, weight: 2 }}>
                  <Popup><strong>Start</strong><br />{startLat.toFixed(4)}, {startLng.toFixed(4)}</Popup>
                </CircleMarker>

                {/* End marker */}
                <CircleMarker center={[endLat, endLng]} radius={9}
                  pathOptions={{ color: "#fff", fillColor: "#ef4444", fillOpacity: 1, weight: 2 }}>
                  <Popup><strong>Destination</strong><br />{endLat.toFixed(4)}, {endLng.toFixed(4)}</Popup>
                </CircleMarker>
              </MapContainer>
            )}
          </div>

          {/* Active route recommendation */}
          {activeRoute && (
            <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-4">
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-500 text-xs font-bold uppercase">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    EDSS Recommendation
                  </div>
                  <h4 className="text-lg font-bold capitalize mt-2">
                    {(ROUTE_STYLES[activeRoute.route_type]?.label || activeRoute.route_type)} Route
                  </h4>
                  <p className="text-xs text-muted-foreground max-w-lg">{activeRoute.recommendation}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase block">Exposure Score</span>
                  <span className="text-3xl font-extrabold text-blue-600 dark:text-emerald-400">
                    {activeRoute.exposure_score}
                  </span>
                  <span className="text-[10px] text-muted-foreground block">min × AQI/100</span>
                </div>
              </div>

              {/* Route stats row */}
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border text-center">
                {[
                  { label: "Travel Time",  value: `${activeRoute.travel_time_minutes} min` },
                  { label: "Avg AQI",      value: activeRoute.average_aqi, color: aqiColor(activeRoute.average_aqi) },
                  { label: "Route Type",   value: ROUTE_STYLES[activeRoute.route_type]?.label || activeRoute.route_type },
                ].map((s) => (
                  <div key={s.label} className="space-y-1">
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase">{s.label}</p>
                    <p className="text-lg font-extrabold" style={s.color ? { color: s.color } : {}}>
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
