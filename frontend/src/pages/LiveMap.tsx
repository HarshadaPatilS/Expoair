import React, { useState, useEffect, useRef } from "react";
import { apiService } from "../services/api";
import { Crosshair, MapPin, Eye, Settings, RefreshCw, Info } from "lucide-react";

export const LiveMap: React.FC = () => {
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedPoint, setSelectedPoint] = useState<any>(null);
  const [hoveredPoint, setHoveredPoint] = useState<any>(null);
  
  // Grid location (default Pune / Anand Vihar area coords)
  const [mapCenter, setMapCenter] = useState({ lat: 28.63, lng: 77.22 });
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const fetchHeatmap = async () => {
    setLoading(true);
    const data = await apiService.getHeatmap(mapCenter.lat, mapCenter.lng);
    setHeatmapData(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchHeatmap();
  }, [mapCenter]);

  // Render heat contours on canvas
  useEffect(() => {
    if (!canvasRef.current || heatmapData.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw stylized background grid lines
    ctx.strokeStyle = "rgba(100, 116, 139, 0.08)";
    ctx.lineWidth = 1;
    const gridSpacing = 40;
    for (let x = 0; x < canvas.width; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Map latitude/longitude to canvas XY coords
    // Let's establish bounding box based on coordinates
    const lats = heatmapData.map(p => p.lat);
    const lngs = heatmapData.map(p => p.lng);
    const minLat = Math.min(...lats) - 0.05;
    const maxLat = Math.max(...lats) + 0.05;
    const minLng = Math.min(...lngs) - 0.05;
    const maxLng = Math.max(...lngs) + 0.05;

    const getXY = (lat: number, lng: number) => {
      const x = ((lng - minLng) / (maxLng - minLng)) * canvas.width;
      const y = canvas.height - ((lat - minLat) / (maxLat - minLat)) * canvas.height; // invert Y
      return { x, y };
    };

    // Draw radial dispersion gradients (pollution contours)
    heatmapData.forEach(pt => {
      const { x, y } = getXY(pt.lat, pt.lng);
      const radius = 90; // dispersion size
      
      const grad = ctx.createRadialGradient(x, y, 2, x, y, radius);
      
      // Map AQI color scale
      let col = "0, 228, 0"; // Good green
      if (pt.aqi > 150) col = "139, 92, 246"; // Hazardous purple
      else if (pt.aqi > 100) col = "239, 68, 68"; // Unhealthy red
      else if (pt.aqi > 50) col = "245, 158, 11"; // Moderate amber
      
      grad.addColorStop(0, `rgba(${col}, ${pt.weight * 0.4})`);
      grad.addColorStop(0.5, `rgba(${col}, ${pt.weight * 0.15})`);
      grad.addColorStop(1, `rgba(${col}, 0)`);
      
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fill();
    });

    // Draw point markers
    heatmapData.forEach(pt => {
      const { x, y } = getXY(pt.lat, pt.lng);
      
      let baseCol = "#10b981";
      if (pt.aqi > 150) baseCol = "#8b5cf6";
      else if (pt.aqi > 100) baseCol = "#ef4444";
      else if (pt.aqi > 50) baseCol = "#f59e0b";

      // Outer rings
      ctx.strokeStyle = `${baseCol}50`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, 2 * Math.PI);
      ctx.stroke();

      // Inner core
      ctx.fillStyle = baseCol;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
    });

  }, [heatmapData]);

  // Click handler to match canvas coordinates to nearest data point
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || heatmapData.length === 0) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const lats = heatmapData.map(p => p.lat);
    const lngs = heatmapData.map(p => p.lng);
    const minLat = Math.min(...lats) - 0.05;
    const maxLat = Math.max(...lats) + 0.05;
    const minLng = Math.min(...lngs) - 0.05;
    const maxLng = Math.max(...lngs) + 0.05;

    let nearestPt = null;
    let minDist = 40; // max pixel threshold distance

    heatmapData.forEach(pt => {
      const x = ((pt.lng - minLng) / (maxLng - minLng)) * canvas.width;
      const y = canvas.height - ((pt.lat - minLat) / (maxLat - minLat)) * canvas.height;
      
      const dist = Math.sqrt((x - clickX) ** 2 + (y - clickY) ** 2);
      if (dist < minDist) {
        minDist = dist;
        nearestPt = pt;
      }
    });

    if (nearestPt) {
      setSelectedPoint(nearestPt);
    } else {
      setSelectedPoint(null);
    }
  };

  const getAqiColor = (aqi: number) => {
    if (aqi < 50) return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
    if (aqi < 100) return "text-amber-500 bg-amber-500/10 border-amber-500/20";
    if (aqi < 150) return "text-red-500 bg-red-500/10 border-red-500/20";
    return "text-purple-500 bg-purple-500/10 border-purple-500/20";
  };

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Geospatial AQI Heatmap</h2>
          <p className="text-xs text-muted-foreground">Interactive spatial dispersion grids & air quality contours</p>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={fetchHeatmap} 
            className="p-2 bg-muted hover:bg-muted/80 border border-border rounded-xl text-muted-foreground hover:text-foreground transition-all"
            title="Refresh Grid Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-1.5 bg-muted px-3 py-1.5 rounded-xl border border-border text-xs font-semibold">
            <Crosshair className="w-3.5 h-3.5" />
            <span>Center: {mapCenter.lat.toFixed(2)}, {mapCenter.lng.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Map Canvas HUD */}
        <div className="lg:col-span-3 bg-card p-4 rounded-3xl border border-border shadow-sm flex items-center justify-center relative min-h-[450px]">
          {loading && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10 rounded-3xl">
              <div className="text-sm font-semibold flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                Updating pollution layers...
              </div>
            </div>
          )}

          {/* Canvas for rendering vector contours */}
          <canvas 
            ref={canvasRef}
            width={650}
            height={400}
            onClick={handleCanvasClick}
            className="w-full h-auto bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-border/80 cursor-crosshair max-w-full"
          />

          {/* Compass Rose HUD helper */}
          <div className="absolute right-8 bottom-8 pointer-events-none select-none flex flex-col items-center">
            <div className="w-10 h-10 rounded-full border border-border bg-card/80 flex items-center justify-center shadow-md">
              <span className="font-bold text-xs text-muted-foreground">N</span>
            </div>
          </div>
        </div>

        {/* Info panel */}
        <div className="space-y-6">
          {/* Selected Station Popout */}
          <div className="bg-card p-5 rounded-3xl border border-border shadow-sm space-y-4">
            <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Inspection Details</h3>
            
            {selectedPoint ? (
              <div className="space-y-4">
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="font-bold text-sm">Grid Node Station</h4>
                    <p className="text-[11px] text-muted-foreground">Coords: {selectedPoint.lat.toFixed(4)}, {selectedPoint.lng.toFixed(4)}</p>
                  </div>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold tracking-tight">{Math.round(selectedPoint.aqi)}</span>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full border font-bold uppercase ${getAqiColor(selectedPoint.aqi)}`}>
                    AQI Value
                  </span>
                </div>

                <div className="space-y-2 text-xs border-t border-border pt-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Concentration Weight</span>
                    <span className="font-semibold">{Math.round(selectedPoint.weight * 100)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dispersion Status</span>
                    <span className="font-semibold text-emerald-500">Active</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 border border-dashed border-border rounded-2xl text-center space-y-2">
                <Crosshair className="w-8 h-8 mx-auto text-muted-foreground/60" />
                <p className="text-xs text-muted-foreground">Click on any contour focal node on the map to query grid telemetry details</p>
              </div>
            )}
          </div>

          {/* Map legend */}
          <div className="bg-card p-5 rounded-3xl border border-border shadow-sm space-y-3.5">
            <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Map Legend</h3>
            <div className="space-y-2.5 text-xs font-medium">
              <div className="flex items-center gap-3">
                <div className="w-3.5 h-3.5 rounded-full bg-emerald-500/20 border border-emerald-500" />
                <span>Good (0 - 50)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3.5 h-3.5 rounded-full bg-amber-500/20 border border-amber-500" />
                <span>Moderate (51 - 100)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3.5 h-3.5 rounded-full bg-red-500/20 border border-red-500" />
                <span>Unhealthy (101 - 150)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3.5 h-3.5 rounded-full bg-purple-500/20 border border-purple-500" />
                <span>Hazardous (150+)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
