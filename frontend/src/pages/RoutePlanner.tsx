import React, { useState, useEffect, useRef } from "react";
import { apiService } from "../services/api";
import { Clock, ShieldCheck, RefreshCw, Compass } from "lucide-react";

export const RoutePlanner: React.FC = () => {
  const [startLat, setStartLat] = useState<number>(28.63);
  const [startLng, setStartLng] = useState<number>(77.22);
  const [endLat, setEndLat] = useState<number>(28.75);
  const [endLng, setEndLng] = useState<number>(77.11);
  const [routes, setRoutes] = useState<any[]>([]);
  const [selectedRouteType, setSelectedRouteType] = useState<string>("lowest_pollution");
  const [loading, setLoading] = useState<boolean>(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const fetchRoutes = async () => {
    setLoading(true);
    const data = await apiService.getSafeRoutes(startLat, startLng, endLat, endLng);
    setRoutes(data.routes);
    setLoading(false);
  };

  useEffect(() => {
    fetchRoutes();
  }, [startLat, startLng, endLat, endLng]);

  // Render route shapes on canvas
  useEffect(() => {
    if (!canvasRef.current || routes.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Grid lines background
    ctx.strokeStyle = "rgba(100, 116, 139, 0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Coordinates bounding box
    const allLats: number[] = [];
    const allLngs: number[] = [];
    routes.forEach(r => {
      r.waypoints.forEach((w: number[]) => {
        allLats.push(w[0]);
        allLngs.push(w[1]);
      });
    });

    const minLat = Math.min(...allLats) - 0.02;
    const maxLat = Math.max(...allLats) + 0.02;
    const minLng = Math.min(...allLngs) - 0.02;
    const maxLng = Math.max(...allLngs) + 0.02;

    const getXY = (lat: number, lng: number) => {
      const x = ((lng - minLng) / (maxLng - minLng)) * (canvas.width - 60) + 30;
      const y = canvas.height - (((lat - minLat) / (maxLat - minLat)) * (canvas.height - 60) + 30);
      return { x, y };
    };

    // Draw all routes
    routes.forEach(r => {
      const isActive = r.route_type === selectedRouteType;
      
      ctx.beginPath();
      r.waypoints.forEach((w: number[], idx: number) => {
        const { x, y } = getXY(w[0], w[1]);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      if (isActive) {
        ctx.strokeStyle = r.route_type === "lowest_pollution" ? "#10b981" : "#3b82f6";
        ctx.lineWidth = 4;
        ctx.shadowColor = r.route_type === "lowest_pollution" ? "rgba(16, 185, 129, 0.4)" : "rgba(59, 130, 246, 0.4)";
        ctx.shadowBlur = 8;
      } else {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
        ctx.lineWidth = 2;
        ctx.shadowBlur = 0;
      }
      ctx.stroke();
    });

    // Reset shadow
    ctx.shadowBlur = 0;

    // Draw Start & End nodes
    if (routes[0]?.waypoints) {
      const start = routes[0].waypoints[0];
      const end = routes[0].waypoints[routes[0].waypoints.length - 1];
      
      const sPos = getXY(start[0], start[1]);
      const ePos = getXY(end[0], end[1]);

      // Start circle
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath(); ctx.arc(sPos.x, sPos.y, 7, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5; ctx.stroke();

      // End circle
      ctx.fillStyle = "#ef4444";
      ctx.beginPath(); ctx.arc(ePos.x, ePos.y, 7, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5; ctx.stroke();
    }

  }, [routes, selectedRouteType]);

  const getRouteColorClass = (type: string) => {
    switch (type) {
      case "lowest_pollution": return "border-emerald-500 bg-emerald-500/10 text-emerald-500";
      case "fastest": return "border-blue-500 bg-blue-500/10 text-blue-500";
      case "balanced": return "border-purple-500 bg-purple-500/10 text-purple-500";
      default: return "border-slate-500 bg-slate-500/10 text-slate-500";
    }
  };

  const selectedRoute = routes.find(r => r.route_type === selectedRouteType);

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Low-Pollution Route Planner</h2>
          <p className="text-xs text-muted-foreground">Compare transit exposure risks and select the healthiest commute alternative</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Destination inputs */}
        <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <Compass className="w-5 h-5 text-blue-500" />
            <h3 className="font-bold text-sm uppercase tracking-wider">Transit Waypoints</h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Start Latitude & Longitude</label>
              <div className="grid grid-cols-2 gap-2">
                <input 
                  type="number" value={startLat} step="0.01"
                  onChange={(e) => setStartLat(Number(e.target.value))}
                  className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs"
                />
                <input 
                  type="number" value={startLng} step="0.01"
                  onChange={(e) => setStartLng(Number(e.target.value))}
                  className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">End Latitude & Longitude</label>
              <div className="grid grid-cols-2 gap-2">
                <input 
                  type="number" value={endLat} step="0.01"
                  onChange={(e) => setEndLat(Number(e.target.value))}
                  className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs"
                />
                <input 
                  type="number" value={endLng} step="0.01"
                  onChange={(e) => setEndLng(Number(e.target.value))}
                  className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs"
                />
              </div>
            </div>

            <button 
              onClick={fetchRoutes}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:opacity-95 text-white font-medium text-xs mt-2"
            >
              Analyze Commutes
            </button>
          </div>

          {/* Comparative routes selection */}
          <div className="space-y-2.5">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Alternative Routes</h4>
            <div className="space-y-2">
              {routes.map((r: any) => (
                <button
                  key={r.route_type}
                  onClick={() => setSelectedRouteType(r.route_type)}
                  className={`w-full p-3.5 rounded-xl border text-left flex justify-between items-center transition-all ${
                    selectedRouteType === r.route_type
                      ? "bg-card border-blue-500 dark:border-emerald-500 shadow-sm"
                      : "bg-muted/40 border-border/80 hover:border-border"
                  }`}
                >
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold capitalize">{r.route_type.replace("_", " ")}</span>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-semibold">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {r.travel_time_minutes} mins
                      </span>
                      <span>•</span>
                      <span>AQI: {r.average_aqi}</span>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2.5 py-0.5 rounded-full border font-bold uppercase ${getRouteColorClass(r.route_type)}`}>
                    Select
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Route visualization panel */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card p-4 rounded-3xl border border-border shadow-sm relative min-h-[300px]">
            {loading && (
              <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10 rounded-3xl">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                  Drawing routes path maps...
                </div>
              </div>
            )}
            
            <canvas 
              ref={canvasRef}
              width={500}
              height={300}
              className="w-full h-auto bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-border/60 max-w-full"
            />
          </div>

          {selectedRoute && (
            <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-4">
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-500 text-xs font-bold uppercase">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    EDSS Decision Recommendation
                  </div>
                  <h4 className="text-lg font-bold capitalize mt-2">{selectedRouteType.replace("_", " ")} Route Insight</h4>
                  <p className="text-xs text-muted-foreground">{selectedRoute.recommendation}</p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Transit Exposure Score</span>
                  <span className="text-3xl font-extrabold block text-blue-600 dark:text-emerald-400 mt-1">{selectedRoute.exposure_score}</span>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
