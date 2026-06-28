import React, { useState, useEffect } from "react";
import { apiService } from "../services/api";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Clock, WifiOff } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { SkeletonLayout } from "../components/SkeletonCard";

export const Exposure: React.FC = () => {
  const [homeCoords, setHomeCoords]       = useState({ lat: 28.63, lng: 77.22 });
  const [officeCoords, setOfficeCoords]   = useState({ lat: 28.75, lng: 77.11 });
  const [commuteMinutes, setCommuteMinutes] = useState<number>(35);
  const [transitType, setTransitType]     = useState<string>("car");
  const [exposureData, setExposureData]   = useState<any>(null);
  const [offlineMode, setOfflineMode]     = useState<boolean>(false);
  const [dataNote, setDataNote]           = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const calculateExposure = async () => {
    try {
      const data = await apiService.getExposureAssessment({
        home_lat:             homeCoords.lat,
        home_lng:             homeCoords.lng,
        office_lat:           officeCoords.lat,
        office_lng:           officeCoords.lng,
        travel_time_minutes:  commuteMinutes,
        vehicle:              transitType,
      });
      if (data === null) {
        setOfflineMode(true);
        setExposureData(null);
        setDataNote(null);
      } else {
        setExposureData(data);
        setOfflineMode(false);
        setDataNote((data as any).data_note ?? null);
      }
    } catch {
      setOfflineMode(true);
      setExposureData(null);
      setDataNote(null);
    } finally {
      setInitialLoading(false);
    }
  };

  // Re-run whenever any commute parameter changes (including coordinates)
  useEffect(() => {
    calculateExposure();
  }, [homeCoords.lat, homeCoords.lng, officeCoords.lat, officeCoords.lng, commuteMinutes, transitType]);

  const getRiskColor = (level: string) => {
    switch (level.toLowerCase()) {
      case "low":  return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
      case "high": return "text-red-500 bg-red-500/10 border-red-500/20";
      default:     return "text-amber-500 bg-amber-500/10 border-amber-500/20";
    }
  };

  if (initialLoading) return <SkeletonLayout rows={2} />;

  return (
    <div className="space-y-6 text-left">

      {/* Page header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Personal Telemetry &amp; Exposure Engine</h2>
          <p className="text-xs text-muted-foreground">Estimate your cumulative micro-particulate intake dosage based on daily routines</p>
        </div>

        {/* Offline / data-note banner */}
        {(offlineMode || dataNote) && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs font-semibold shrink-0">
            <WifiOff className="w-3.5 h-3.5" />
            {dataNote ?? "Using estimated AQI — connect for live data"}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Commute Profiles Questionnaire ──────────────────────────── */}
        <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <Clock className="w-5 h-5 text-blue-500" />
            <h3 className="font-bold text-sm uppercase tracking-wider">Commute Profile</h3>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Home Lat</label>
                <input
                  type="number" value={homeCoords.lat} step="0.01"
                  onChange={(e) => setHomeCoords({ ...homeCoords, lat: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Home Lng</label>
                <input
                  type="number" value={homeCoords.lng} step="0.01"
                  onChange={(e) => setHomeCoords({ ...homeCoords, lng: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Office Lat</label>
                <input
                  type="number" value={officeCoords.lat} step="0.01"
                  onChange={(e) => setOfficeCoords({ ...officeCoords, lat: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Office Lng</label>
                <input
                  type="number" value={officeCoords.lng} step="0.01"
                  onChange={(e) => setOfficeCoords({ ...officeCoords, lng: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Transit Duration (Minutes)</label>
              <select
                value={commuteMinutes}
                onChange={(e) => setCommuteMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm"
              >
                <option value={15}>15 Minutes</option>
                <option value={30}>30 Minutes</option>
                <option value={45}>45 Minutes</option>
                <option value={60}>60 Minutes</option>
                <option value={90}>90 Minutes</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Vehicle Mode</label>
              <select
                value={transitType}
                onChange={(e) => setTransitType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm"
              >
                <option value="car">Personal Car (AC/Filtered)</option>
                <option value="bus">Public Bus (Semi-filtered)</option>
                <option value="cycling">Bicycle (High ventilation rate)</option>
                <option value="walking">Walking (Direct exposure)</option>
              </select>
            </div>

            <button
              onClick={calculateExposure}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:opacity-95 text-white font-medium text-xs mt-2"
            >
              Re-Calculate Dosages
            </button>
          </div>
        </div>

        {/* ── Projections & Graphs ─────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {offlineMode && !exposureData && (
            <EmptyState message="Backend offline — start the FastAPI server to calculate your exposure assessment." />
          )}
          {exposureData && (
            <div className="space-y-6">

              {/* Stats Summary cards */}
              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-card p-5 rounded-2xl border border-border shadow-sm text-left">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Daily Particulate Intake</span>
                  <span className="text-2xl font-extrabold block mt-1">{Math.round(exposureData.daily_dose)} µg</span>
                  <p className="text-[10px] text-muted-foreground mt-1">Equivalent to constant {exposureData.equivalent_pm25} µg/m³</p>
                </div>

                <div className="bg-card p-5 rounded-2xl border border-border shadow-sm text-left">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">EDSS Health Score</span>
                  <span className="text-2xl font-extrabold block mt-1">{Math.round(exposureData.health_index)}/100</span>
                  <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase mt-1 ${getRiskColor(exposureData.risk_level)}`}>
                    {exposureData.risk_level} Risk
                  </span>
                </div>

                <div className="bg-card p-5 rounded-2xl border border-border shadow-sm text-left">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Monthly Dose equivalent</span>
                  <span className="text-2xl font-extrabold block mt-1">{Math.round(exposureData.daily_dose * 30 / 1000)} mg</span>
                  <p className="text-[10px] text-emerald-500 font-bold mt-1">Within normal ranges</p>
                </div>
              </div>

              {/* Intervals projections */}
              <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-4">
                <h3 className="font-bold text-sm uppercase tracking-wider">Exposure Intervals Projections</h3>
                <div className="space-y-3">
                  {exposureData.intervals.map((int: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-3.5 bg-muted/40 rounded-xl border border-border/80 text-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold">
                          {idx + 1}
                        </div>
                        <div>
                          <span className="font-bold block">{int.label}</span>
                          <span className="text-[10px] text-muted-foreground">Cumulative relative index</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-extrabold block">{int.exposure_val} pts</span>
                        <span className="text-[10px] text-amber-500 font-semibold">{int.level}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Exposure Lifetime Trends Chart */}
              <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-4">
                <div>
                  <h3 className="font-bold text-sm uppercase tracking-wider">Annual Dose Trend Projections</h3>
                  <p className="text-xs text-muted-foreground">12-Month simulated environmental intake</p>
                </div>

                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={exposureData.trends.exposure_scores.map((val: number, idx: number) => ({ month: `M${idx + 1}`, value: val }))}
                      margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="exposGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="month" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Area type="monotone" dataKey="value" stroke="#10b981" fillOpacity={1} fill="url(#exposGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  );
};
