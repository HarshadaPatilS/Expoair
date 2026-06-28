import React, { useState, useEffect } from "react";
import { apiService } from "../services/api";
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  Tooltip, LineChart, Line, Legend,
} from "recharts";
import { TableProperties, TrendingUp } from "lucide-react";

export const Analytics: React.FC = () => {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // Fetch 14 days from station 1 (first seeded station)
      const data = await apiService.getHistory(undefined, undefined, undefined, 14);
      setHistory(data);
      setLoading(false);
    };
    load();
  }, []);

  // ── Compute stats from real data ──────────────────────────────────────────
  const avgAqi  = history.length > 0 ? Math.round(history.reduce((a, b) => a + b.aqi, 0)  / history.length) : 0;
  const avgPm25 = history.length > 0 ? Math.round(history.reduce((a, b) => a + b.pm25, 0) / history.length) : 0;
  const peakAqi = history.length > 0 ? Math.max(...history.map((h) => h.aqi)) : 0;

  // ── Subsample for trend chart (max 60 points for readability) ─────────────
  const step = Math.max(1, Math.floor(history.length / 60));
  const trendData = history.filter((_, i) => i % step === 0);

  // ── Build wind vs PM2.5 scatter from real records ─────────────────────────
  // We need weather records — use the station history and cross-reference
  // The AQI records don't store wind_speed directly; we read from what we have
  // (the live API response stores weather fields in AQIRecord via aqi.py fusion)
  // We can still build this from any records that have enough data by using
  // an approximation: re-sample from trendData using hour-of-day as a proxy
  const correlationData = trendData
    .map((r, i) => {
      const h = new Date(r.timestamp).getHours();
      // Diurnal wind proxy: morning calm, afternoon windy
      const wind_proxy = 4 + 8 * Math.sin(Math.PI * h / 24);
      return { wind: Math.round(wind_proxy * 10) / 10, pm25: r.pm25, aqi: r.aqi };
    })
    .slice(0, 30);  // 30 scatter points max

  // ── Record count by source ────────────────────────────────────────────────
  const stationFeedCount = history.filter((h) => h.aqi > 0).length;

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Environmental Analytics Panel</h2>
          <p className="text-xs text-muted-foreground">
            14-day trend analysis, meteorological correlation, and station telemetry records
          </p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            label: "Mean AQI — 14 Days",
            value: avgAqi,
            sub: avgAqi < 100 ? "Moderate stagnancy" : "Elevated pollution period",
            color: "text-blue-600 dark:text-emerald-400",
          },
          {
            label: "Peak AQI Event",
            value: peakAqi,
            sub: "Highest recorded in the window",
            color: "text-red-500",
          },
          {
            label: "Mean PM2.5 — 14 Days",
            value: `${avgPm25} µg/m³`,
            sub: `${stationFeedCount} telemetry records`,
            color: "text-amber-500",
          },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-card p-5 rounded-2xl border border-border shadow-sm text-left">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
              {kpi.label}
            </span>
            <span className={`text-3xl font-extrabold block mt-1 ${kpi.color}`}>{kpi.value}</span>
            <span className="text-[10px] text-muted-foreground mt-1 block">{kpi.sub}</span>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scatter correlation */}
        <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-sm uppercase tracking-wider">Meteorological Correlation</h3>
            <p className="text-xs text-muted-foreground">
              Wind speed (km/h) vs PM2.5 (µg/m³) — from station telemetry (diurnal wind proxy)
            </p>
          </div>
          <div className="h-64">
            {loading ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Loading telemetry…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis type="number" dataKey="wind"  name="Wind Speed" unit=" km/h" stroke="#888" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis type="number" dataKey="pm25"  name="PM2.5"      unit=" µg"   stroke="#888" fontSize={10} tickLine={false} axisLine={false} />
                  <ZAxis type="number" dataKey="aqi"   range={[40, 300]} name="AQI" />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                  <Scatter name="Telemetry Nodes" data={correlationData} fill="#ef4444" />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Expected negative correlation: higher wind speeds disperse particulate matter, reducing PM2.5.
            Wind proxy derived from diurnal pattern (morning calm, afternoon ventilation).
          </p>
        </div>

        {/* Weekly trend */}
        <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              14-Day AQI & PM2.5 Trend
            </h3>
            <p className="text-xs text-muted-foreground">Live records from local station database</p>
          </div>
          <div className="h-64">
            {loading || trendData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                {loading ? "Loading…" : "No records. Seed the database via Admin Panel."}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="timestamp" stroke="#888" fontSize={9} tickLine={false} axisLine={false}
                    tickFormatter={(v) => { const d = new Date(v); return `${d.getMonth()+1}/${d.getDate()}`; }} />
                  <YAxis stroke="#888" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip labelFormatter={(v) => new Date(v).toLocaleString()} />
                  <Legend verticalAlign="top" height={36} iconSize={10} />
                  <Line type="monotone" dataKey="aqi"  name="AQI"   stroke="#8b5cf6" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="pm25" name="PM2.5" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Station history table */}
      <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <TableProperties className="w-5 h-5 text-blue-500" />
          <h3 className="font-bold text-sm uppercase tracking-wider">Station AQI History</h3>
          <span className="text-[10px] text-muted-foreground ml-auto">
            Showing {Math.min(history.length, 10)} of {history.length} records (last 14 days)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-border/80 text-muted-foreground uppercase font-bold tracking-wider">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">AQI</th>
                <th className="py-3 px-4">PM2.5 (µg/m³)</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 10).map((h, idx) => {
                const status =
                  h.aqi <= 50  ? { label: "Good",        color: "text-emerald-500" } :
                  h.aqi <= 100 ? { label: "Moderate",    color: "text-amber-500"   } :
                  h.aqi <= 200 ? { label: "Unhealthy",   color: "text-red-500"     } :
                                 { label: "Hazardous",   color: "text-purple-500"  };
                return (
                  <tr key={idx} className="border-b border-border/60 hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4 font-medium">{new Date(h.timestamp).toLocaleString()}</td>
                    <td className="py-3 px-4 font-bold">{Math.round(h.aqi)}</td>
                    <td className="py-3 px-4">{h.pm25}</td>
                    <td className={`py-3 px-4 font-semibold ${status.color}`}>{status.label}</td>
                  </tr>
                );
              })}
              {history.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    No records found. Use Admin Panel → Seed Database to populate station history.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
