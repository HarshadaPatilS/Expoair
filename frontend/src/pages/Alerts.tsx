import React, { useState, useEffect, useCallback } from "react";
import { apiService } from "../services/api";
import {
  Bell, BellOff, BellRing, Plus, Trash2, XCircle, RefreshCw,
  CheckCircle2, AlertTriangle, Activity,
} from "lucide-react";
import { SkeletonLayout } from "../components/SkeletonCard";

interface AlertItem {
  id: number;
  user_id: number | null;
  station_id: number | null;
  station_name: string | null;
  parameter: string;
  threshold: number;
  current_value: number | null;
  status: "active" | "triggered" | "dismissed";
  created_at: string;
}

interface Station {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
}

const PARAM_LABELS: Record<string, string> = {
  aqi:  "AQI",
  pm25: "PM2.5 (µg/m³)",
  pm10: "PM10 (µg/m³)",
  no2:  "NO₂ (µg/m³)",
  so2:  "SO₂ (µg/m³)",
};

const StatusBadge: React.FC<{ status: AlertItem["status"] }> = ({ status }) => {
  if (status === "triggered") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 animate-pulse">
        <BellRing className="w-3 h-3" /> Triggered
      </span>
    );
  }
  if (status === "dismissed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30">
        <BellOff className="w-3 h-3" /> Dismissed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
      <CheckCircle2 className="w-3 h-3" /> Watching
    </span>
  );
};

export const Alerts: React.FC = () => {
  const [alerts, setAlerts]     = useState<AlertItem[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");

  // Form state
  const [stationId, setStationId]   = useState("");
  const [parameter, setParameter]   = useState("aqi");
  const [threshold, setThreshold]   = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    const [alertData, stationData] = await Promise.all([
      apiService.listAlerts(),
      apiService.getStations(),
    ]);
    setAlerts(alertData as AlertItem[]);
    setStations(stationData as Station[]);
    if (!stationId && stationData.length > 0) setStationId(String(stationData[0].id));
    setLoading(false);
  }, [stationId]);

  useEffect(() => { loadData(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!stationId || !threshold) { setError("Fill in all fields."); return; }
    setSaving(true);
    try {
      await apiService.createAlert({
        station_id: Number(stationId),
        parameter,
        threshold: Number(threshold),
      });
      setSuccess("Alert created! It will trigger when the threshold is exceeded.");
      setThreshold("");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to create alert. Is the backend running?");
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = async (id: number) => {
    await apiService.dismissAlert(id);
    await loadData();
  };

  const handleDelete = async (id: number) => {
    await apiService.deleteAlert(id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const triggered  = alerts.filter((a) => a.status === "triggered");
  const active     = alerts.filter((a) => a.status === "active");
  const dismissed  = alerts.filter((a) => a.status === "dismissed");

  return (
    <div className="space-y-6 text-left">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-500" /> Alert Configuration
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Set AQI / pollutant thresholds per station — alerts update automatically with each sensor reading
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-muted hover:bg-muted/80 text-xs font-semibold transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Triggered",  value: triggered.length,  color: "text-red-400",     icon: <BellRing className="w-5 h-5" /> },
          { label: "Watching",   value: active.length,     color: "text-emerald-400", icon: <Activity className="w-5 h-5" /> },
          { label: "Dismissed",  value: dismissed.length,  color: "text-slate-400",   icon: <BellOff className="w-5 h-5" /> },
        ].map((s) => (
          <div key={s.label} className="bg-card p-4 rounded-2xl border border-border shadow-sm text-center">
            <div className={`flex justify-center mb-1 ${s.color}`}>{s.icon}</div>
            <span className={`text-2xl font-extrabold block ${s.color}`}>{s.value}</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Create Form ──────────────────────────────────────────────── */}
        <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <Plus className="w-4 h-4 text-blue-500" />
            <h3 className="font-bold text-sm uppercase tracking-wider">Create Alert</h3>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                Station
              </label>
              <select
                id="alert-station"
                value={stationId}
                onChange={(e) => setStationId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs"
              >
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                Parameter
              </label>
              <select
                id="alert-parameter"
                value={parameter}
                onChange={(e) => setParameter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs"
              >
                {Object.entries(PARAM_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                Threshold Value
              </label>
              <input
                id="alert-threshold"
                type="number"
                min={0}
                step="any"
                placeholder={`e.g. 150 for AQI`}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Alert triggers when {PARAM_LABELS[parameter]} ≥ this value
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-xs text-red-400">
                <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
              </div>
            )}
            {success && (
              <div className="flex items-start gap-2 p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-xs text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {success}
              </div>
            )}

            <button
              type="submit"
              id="create-alert-btn"
              disabled={saving}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:opacity-90 text-white font-semibold text-xs disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
              {saving ? "Creating…" : "Create Alert"}
            </button>
          </form>

          {/* hint */}
          <div className="p-3 bg-muted/50 border border-border rounded-xl text-[10px] text-muted-foreground leading-relaxed space-y-1">
            <p className="font-semibold text-foreground">How it works</p>
            <p>Every MQTT telemetry cycle (~12 s), the backend checks whether any active alert threshold has been exceeded and updates the status to <strong>Triggered</strong>.</p>
            <p>You can dismiss a triggered alert to re-arm it or delete it permanently.</p>
          </div>
        </div>

        {/* ── Alert List ───────────────────────────────────────────────── */}
        <div className="lg:col-span-2 bg-card p-6 rounded-3xl border border-border shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="font-bold text-sm uppercase tracking-wider">Active & Triggered Alerts</h3>
            <span className="text-[10px] text-muted-foreground ml-auto">{alerts.length} total</span>
          </div>

          {loading ? (
            <SkeletonLayout rows={2} />
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <BellOff className="w-10 h-10 opacity-30" />
              <p className="text-sm font-medium">No alerts configured</p>
              <p className="text-xs opacity-60">Use the form to create your first threshold alert.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Triggered first */}
              {[...triggered, ...active, ...dismissed].map((alert) => (
                <div
                  key={alert.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border transition-all ${
                    alert.status === "triggered"
                      ? "border-red-500/40 bg-red-500/5"
                      : alert.status === "dismissed"
                      ? "border-border/50 bg-muted/30 opacity-60"
                      : "border-border bg-muted/10"
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={alert.status} />
                      <span className="text-xs font-bold truncate">
                        {PARAM_LABELS[alert.parameter] ?? alert.parameter} ≥ {alert.threshold}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      📍 {alert.station_name ?? `Station #${alert.station_id}`}
                    </p>
                    {alert.current_value !== null && (
                      <p className={`text-[11px] font-semibold ${alert.status === "triggered" ? "text-red-400" : "text-muted-foreground"}`}>
                        Current: {Math.round(alert.current_value * 10) / 10}
                        {alert.status === "triggered" && " ⚠ Threshold exceeded"}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      Created {new Date(alert.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {alert.status === "triggered" && (
                      <button
                        onClick={() => handleDismiss(alert.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-[11px] font-semibold transition-all"
                      >
                        <BellOff className="w-3 h-3" /> Dismiss
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(alert.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-[11px] font-semibold transition-all"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
