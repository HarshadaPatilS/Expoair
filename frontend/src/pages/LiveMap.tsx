import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { apiService } from "../services/api";
import { Crosshair, RefreshCw, MapPin } from "lucide-react";
import "leaflet/dist/leaflet.css";
import { EmptyState } from "../components/EmptyState";
import { SkeletonLayout } from "../components/SkeletonCard";

// ── City centre presets ──────────────────────────────────────────────────────
const CITIES = [
  { name: "Delhi",    lat: 28.6139, lng: 77.2090, zoom: 11 },
  { name: "Pune",     lat: 18.5204, lng: 73.8567, zoom: 12 },
  { name: "PCMC",     lat: 18.6298, lng: 73.7997, zoom: 12 },
  { name: "Lonavala", lat: 18.7490, lng: 73.4070, zoom: 13 },
];

// ── AQI colour helpers ───────────────────────────────────────────────────────
function aqiColor(aqi: number): string {
  if (aqi <= 50)  return "#10b981";  // Good — emerald
  if (aqi <= 100) return "#f59e0b";  // Moderate — amber
  if (aqi <= 200) return "#ef4444";  // Unhealthy — red
  if (aqi <= 300) return "#8b5cf6";  // Very unhealthy — purple
  return "#6b21a8";                   // Hazardous — deep purple
}

function aqiLabel(aqi: number): string {
  if (aqi <= 50)  return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very Unhealthy";
  return "Hazardous";
}

// ── Map auto-recenter on city change ─────────────────────────────────────────
function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => { map.setView(center, zoom, { animate: true }); }, [center, zoom]);
  return null;
}

// ── Main Component ────────────────────────────────────────────────────────────
export const LiveMap: React.FC = () => {
  const [heatmapData, setHeatmapData] = useState<any[] | null>(null); // null=never loaded
  const [loading, setLoading]         = useState(true);
  const [selectedCity, setSelectedCity] = useState(CITIES[0]);   // Delhi default

  const fetchHeatmap = async () => {
    setLoading(true);
    const data = await apiService.getHeatmap(selectedCity.lat, selectedCity.lng);
    setHeatmapData(data);
    setLoading(false);
  };

  useEffect(() => { fetchHeatmap(); }, [selectedCity]);

  // Only show points near the selected city (within ~120 km)
  const visiblePoints = (heatmapData ?? []).filter((p) => {
    const dlat = p.lat - selectedCity.lat;
    const dlng = p.lng - selectedCity.lng;
    return Math.sqrt(dlat * dlat + dlng * dlng) < 1.5;
  });

  // Station-only points (those with a station_name)
  const stationPoints = visiblePoints.filter((p) => p.station_name);

  // If backend is offline, show EmptyState instead of map
  const isOffline = !loading && heatmapData === null;

  // Show skeleton only on the very first load (heatmapData still null = never fetched)
  if (loading && heatmapData === null) return <SkeletonLayout rows={2} />;

  return (
    <div className="space-y-4 text-left">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Live AQI Map</h2>
          <p className="text-xs text-muted-foreground">
            Real-time air quality monitoring stations — OpenAQ + Local IoT Network
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* City picker */}
          <div className="flex gap-1 bg-muted p-1 rounded-xl border border-border">
            {CITIES.map((c) => (
              <button
                key={c.name}
                onClick={() => setSelectedCity(c)}
                className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  selectedCity.name === c.name
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <button
            onClick={fetchHeatmap}
            className="p-2 bg-muted hover:bg-muted/80 border border-border rounded-xl text-muted-foreground hover:text-foreground transition-all"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Map + legend grid or offline state */}
      {isOffline ? (
        <EmptyState message="Backend offline — start the FastAPI server to see the live AQI map." />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Leaflet Map */}
        <div className="lg:col-span-3 rounded-3xl overflow-hidden border border-border shadow-sm" style={{ height: "min(60vh, 500px)" }}>
          {/* Responsive height: max 60vh on mobile, 500px on desktop */}
          <MapContainer
            center={[selectedCity.lat, selectedCity.lng]}
            zoom={selectedCity.zoom}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
            />
            <MapController center={[selectedCity.lat, selectedCity.lng]} zoom={selectedCity.zoom} />

            {/* Heatmap blob (large semi-transparent circles) */}
            {visiblePoints.map((pt, idx) => (
              <CircleMarker
                key={`blob-${idx}`}
                center={[pt.lat, pt.lng]}
                radius={60}
                pathOptions={{
                  color: "transparent",
                  fillColor: aqiColor(pt.aqi),
                  fillOpacity: 0.06 + pt.weight * 0.10,
                }}
              />
            ))}

            {/* Station markers (only named stations) */}
            {stationPoints.map((pt, idx) => (
              <CircleMarker
                key={`station-${idx}`}
                center={[pt.lat, pt.lng]}
                radius={10}
                pathOptions={{
                  color: aqiColor(pt.aqi),
                  fillColor: aqiColor(pt.aqi),
                  fillOpacity: 0.9,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="min-w-[180px] space-y-1.5 text-sm font-sans">
                    <div className="font-bold text-base leading-tight">{pt.station_name}</div>
                    <div className="text-xs text-gray-500">{pt.city}</div>
                    <div
                      className="text-2xl font-extrabold"
                      style={{ color: aqiColor(pt.aqi) }}
                    >
                      AQI {Math.round(pt.aqi)}
                    </div>
                    <div
                      className="text-xs font-semibold px-2 py-0.5 rounded-full inline-block text-white"
                      style={{ backgroundColor: aqiColor(pt.aqi) }}
                    >
                      {aqiLabel(pt.aqi)}
                    </div>
                    <div className="text-xs text-gray-400 pt-1">
                      {pt.lat.toFixed(4)}°N, {pt.lng.toFixed(4)}°E
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          {/* Stats */}
          <div className="bg-card p-5 rounded-3xl border border-border shadow-sm space-y-3">
            <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-500" /> {selectedCity.name} Overview
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Stations visible</span>
                <span className="font-bold">{stationPoints.length}</span>
              </div>
              {stationPoints.length > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mean AQI</span>
                    <span className="font-bold">
                      {Math.round(stationPoints.reduce((a, b) => a + b.aqi, 0) / stationPoints.length)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Peak AQI</span>
                    <span className="font-bold" style={{ color: aqiColor(Math.max(...stationPoints.map((p) => p.aqi))) }}>
                      {Math.round(Math.max(...stationPoints.map((p) => p.aqi)))}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Station list */}
          <div className="bg-card p-5 rounded-3xl border border-border shadow-sm space-y-2.5 max-h-72 overflow-y-auto">
            <h3 className="font-bold text-xs uppercase tracking-wider text-muted-foreground sticky top-0 bg-card pb-1">
              Stations
            </h3>
            {stationPoints.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No stations near {selectedCity.name}. Try seeding the database via Admin Panel.
              </p>
            )}
            {stationPoints.map((pt, idx) => (
              <div key={idx} className="flex items-center justify-between p-2.5 bg-muted/40 rounded-xl border border-border/60 text-xs">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <p className="font-semibold truncate">{pt.station_name}</p>
                  <p className="text-muted-foreground text-[10px]">{pt.city}</p>
                </div>
                <span
                  className="text-xs font-extrabold ml-2 shrink-0 px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: aqiColor(pt.aqi) }}
                >
                  {Math.round(pt.aqi)}
                </span>
              </div>
            ))}
          </div>

          {/* AQI Legend */}
          <div className="bg-card p-5 rounded-3xl border border-border shadow-sm space-y-2.5">
            <h3 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Legend</h3>
            {[
              { label: "Good",            range: "0–50",   color: "#10b981" },
              { label: "Moderate",        range: "51–100", color: "#f59e0b" },
              { label: "Unhealthy",       range: "101–200",color: "#ef4444" },
              { label: "Very Unhealthy",  range: "201–300",color: "#8b5cf6" },
              { label: "Hazardous",       range: "300+",   color: "#6b21a8" },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-2.5 text-xs font-medium">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                <span>{l.label}</span>
                <span className="text-muted-foreground ml-auto">{l.range}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}{/* end isOffline ternary */}
    </div>
  );
};
