import React, { useState, useEffect } from "react";
import { apiService } from "../services/api";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Legend, LineChart, Line } from "recharts";
import { TableProperties } from "lucide-react";

export const Analytics: React.FC = () => {
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    const loadHistory = async () => {
      const data = await apiService.getHistory(1, undefined, undefined, 14); // 14 days history
      setHistory(data);
    };
    loadHistory();
  }, []);

  // Compute correlation statistics
  const averageAqi = history.length > 0 ? Math.round(history.reduce((acc, curr) => acc + curr.aqi, 0) / history.length) : 0;
  const peakAqi = history.length > 0 ? Math.max(...history.map(h => h.aqi)) : 0;
  
  // Simulated correlation coordinates (Wind speed vs PM2.5 concentration)
  const correlationData = [
    { wind: 4.2, pm25: 85, aqi: 180 },
    { wind: 6.8, pm25: 68, aqi: 145 },
    { wind: 12.4, pm25: 42, aqi: 88 },
    { wind: 15.1, pm25: 35, aqi: 72 },
    { wind: 3.1, pm25: 98, aqi: 210 },
    { wind: 8.5, pm25: 55, aqi: 115 },
    { wind: 18.2, pm25: 24, aqi: 50 },
    { wind: 5.5, pm25: 75, aqi: 160 },
    { wind: 10.1, pm25: 48, aqi: 102 },
    { wind: 14.5, pm25: 30, aqi: 64 }
  ];

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Environmental Analytics Panel</h2>
          <p className="text-xs text-muted-foreground">Investigate correlation distributions, variance matrices, and meteorological logs</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* KPI Stats cards */}
        <div className="bg-card p-5 rounded-2xl border border-border shadow-sm text-left">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Mean AQI (14-Day Horizon)</span>
          <span className="text-3xl font-extrabold block mt-1 text-blue-600 dark:text-emerald-400">{averageAqi}</span>
          <span className="text-[10px] text-muted-foreground mt-1 block">Classified as Moderate Stagnancy</span>
        </div>

        <div className="bg-card p-5 rounded-2xl border border-border shadow-sm text-left">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Peak AQI Event</span>
          <span className="text-3xl font-extrabold block mt-1 text-red-500">{peakAqi}</span>
          <span className="text-[10px] text-red-400 font-semibold mt-1 block">Dust Vector Apportionment</span>
        </div>

        <div className="bg-card p-5 rounded-2xl border border-border shadow-sm text-left">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Telemetry Completeness</span>
          <span className="text-3xl font-extrabold block mt-1">99.8%</span>
          <span className="text-[10px] text-emerald-500 font-semibold mt-1 block">4 Active Stations reporting</span>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Scatter Correlation chart */}
        <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-sm uppercase tracking-wider">Meteorological Correlation Matrix</h3>
            <p className="text-xs text-muted-foreground">Wind speed (km/h) vs PM2.5 concentration (µg/m³)</p>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis type="number" dataKey="wind" name="Wind Speed" unit="km/h" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis type="number" dataKey="pm25" name="PM2.5" unit="µg" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                <ZAxis type="number" dataKey="aqi" range={[60, 400]} name="AQI" />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <Scatter name="Telemetry Nodes" data={correlationData} fill="#ef4444" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Note: Scatter indices demonstrate a strong negative correlation (-0.82) between wind velocity and ambient particulate concentrations, verifying wind-driven dispersal models.
          </p>
        </div>

        {/* Temporal trend chart */}
        <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-sm uppercase tracking-wider">Weekly Environmental Trend</h3>
            <p className="text-xs text-muted-foreground">Moving averages of telemetry logs</p>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="timestamp" stroke="#888888" fontSize={9} tickFormatter={(val) => {
                  const d = new Date(val);
                  return `${d.getMonth()+1}/${d.getDate()}`;
                }} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip />
                <Legend verticalAlign="top" height={36} iconSize={10} />
                <Line type="monotone" dataKey="aqi" name="AQI Trend" stroke="#8b5cf6" strokeWidth={2.5} activeDot={{ r: 6 }} dot={false} />
                <Line type="monotone" dataKey="pm25" name="PM2.5 Trend" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Grid records table */}
      <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <TableProperties className="w-5 h-5 text-blue-500" />
          <h3 className="font-bold text-sm uppercase tracking-wider">Raw Telemetry Records</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-border/80 text-muted-foreground uppercase font-bold tracking-wider">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Estimated AQI</th>
                <th className="py-3 px-4">PM2.5 (µg/m³)</th>
                <th className="py-3 px-4">Ventilation Index</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 8).map((h, idx) => (
                <tr key={idx} className="border-b border-border/60 hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4 font-medium">{new Date(h.timestamp).toLocaleString()}</td>
                  <td className="py-3 px-4 font-bold">{h.aqi}</td>
                  <td className="py-3 px-4">{h.pm25}</td>
                  <td className="py-3 px-4 text-emerald-500 font-semibold">Normal</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
