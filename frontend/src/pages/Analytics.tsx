import React, { useState, useEffect } from "react";
import { apiService } from "../services/api";
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  Tooltip, LineChart, Line, Legend,
} from "recharts";
import { TableProperties, TrendingUp, Download } from "lucide-react";

import { EmptyState } from "../components/EmptyState";
import { SkeletonLayout } from "../components/SkeletonCard";

export const Analytics: React.FC = () => {
  const [history, setHistory] = useState<any[] | null>([]);
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

  // ── CSV Export ────────────────────────────────────────────────────────────
  const downloadCSV = () => {
    if (!history || history.length === 0) return;
    const csv = [
      "timestamp,aqi,pm25,pm10,no2,so2,temp,humidity,wind_speed",
      ...history.map((r) =>
        [
          r.timestamp,
          r.aqi ?? "",
          r.pm25 ?? "",
          r.pm10 ?? "",
          r.no2 ?? "",
          r.so2 ?? "",
          r.temp ?? "",
          r.humidity ?? "",
          r.wind_speed ?? "",
        ].join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `expoair_history_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Compute stats from real data ──────────────────────────────────────────
  const avgAqi  = history && history.length > 0 ? Math.round(history.reduce((a, b) => a + b.aqi, 0)  / history.length) : 0;
  const avgPm25 = history && history.length > 0 ? Math.round(history.reduce((a, b) => a + b.pm25, 0) / history.length) : 0;
  const peakAqi = history && history.length > 0 ? Math.max(...history.map((h) => h.aqi)) : 0;

  // ── Subsample for trend chart (max 60 points for readability) ─────────────
  const trendData = history ? history.filter((_, i) => {
    const step = Math.max(1, Math.floor(history.length / 60));
    return i % step === 0;
  }) : [];

  // ── Build wind vs PM2.5 scatter from real records ─────────────────────────
  // Use real wind speed when available, fallback to proxy when null.
  const correlationData = trendData
    .map((r) => {
      const h = new Date(r.timestamp).getHours();
      const hasRealWind = r.wind_speed !== null && r.wind_speed !== undefined;
      const windValue = hasRealWind ? r.wind_speed : 4 + 8 * Math.sin(Math.PI * h / 24);
      return {
        wind: Math.round(windValue * 10) / 10,
        pm25: r.pm25,
        aqi: r.aqi,
        windLabel: hasRealWind ? `${Math.round(windValue * 10) / 10} km/h` : `${Math.round(windValue * 10) / 10} km/h (Estimated)`
      };
    })
    .slice(0, 30);  // 30 scatter points max

  // ── Record count by source ────────────────────────────────────────────────
  const stationFeedCount = history ? history.filter((h) => h.aqi > 0).length : 0;

  if (loading) return <SkeletonLayout rows={2} />;

  if (!loading && history === null) {
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
        <EmptyState message="Backend offline — start the FastAPI server to see live data." />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Environmental Analytics Panel</h2>
          <p className="text-xs text-muted-foreground">
            14-day trend analysis, meteorological correlation, and station telemetry records
          </p>
        </div>
        <button
          id="export-csv-btn"
          onClick={downloadCSV}
          disabled={!history || history.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          📥 Export CSV
        </button>
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
                  <Tooltip 
                    cursor={{ strokeDasharray: "3 3" }} 
                    formatter={(value: any, name: any, props: any) => {
                      if (name === "Wind Speed") {
                        return [props.payload.windLabel || `${value} km/h`, name];
                      }
                      return [value, name];
                    }}
                  />
                  <Scatter name="Telemetry Nodes" data={correlationData} fill="#ef4444" />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Expected negative correlation: higher wind speeds disperse particulate matter, reducing PM2.5.
            Real wind speeds are plotted where available; missing values display as "(Estimated)" using a diurnal weather proxy model.
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
              {(!history || history.length === 0) && (
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
