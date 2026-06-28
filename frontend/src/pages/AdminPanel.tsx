import React, { useState, useEffect } from "react";
import { apiService } from "../services/api";
import {
  Database, Cpu, RefreshCw, Terminal, CheckCircle2,
  XCircle, AlertCircle, Activity, Server, Wifi
} from "lucide-react";
import { SkeletonCard } from "../components/SkeletonCard";

interface SystemStatus {
  timestamp: string;
  database: {
    stations: number;
    aqi_records: number;
    predictions: number;
    users: number;
    records_24h: number;
    latest_record_at: string | null;
  };
  ml_models: {
    lstm_loaded: boolean;
    xgb_loaded: boolean;
    scalers_loaded: boolean;
    registered: { name: string; version: string; accuracy: number; status: string }[];
  };
  external_apis: {
    openaq: "reachable" | "unreachable";
    open_meteo: "reachable" | "unreachable";
  };
  mqtt?: {
    connected: boolean;
    mode: "hardware" | "simulator" | "offline";
  };
}

const StatusBadge: React.FC<{ ok: boolean; label?: string }> = ({ ok, label }) => (
  <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
    ok
      ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/25"
      : "text-red-500 bg-red-500/10 border-red-500/25"
  }`}>
    {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
    {label || (ok ? "Loaded" : "Not loaded")}
  </span>
);

export const AdminPanel: React.FC = () => {
  const [status, setStatus]       = useState<SystemStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [seeding, setSeeding]     = useState(false);
  const [seedMsg, setSeedMsg]     = useState("");

  const [trainingLog, setTrainingLog] = useState<string[]>([]);
  const [training, setTraining]       = useState(false);
  const [modelType, setModelType]     = useState("LSTM");
  const [epochs, setEpochs]           = useState(50);
  const [learningRate, setLearningRate] = useState(0.001);
  const [lossFn, setLossFn]           = useState("mse");

  const fetchStatus = async () => {
    setStatusLoading(true);
    const data = await apiService.getAdminStatus();
    setStatus(data);
    setStatusLoading(false);
  };

  useEffect(() => { fetchStatus(); }, []);

  const handleSeed = async () => {
    setSeeding(true);
    setSeedMsg("Seeding database with stations across Delhi, Pune, PCMC and Lonavala…");
    try {
      const res = await apiService.seedDatabase();
      setSeedMsg(res.message || "Database seeded successfully!");
      await fetchStatus(); // refresh status after seeding
    } catch (err: any) {
      setSeedMsg("Error: " + (err.message || "Failed. Is the backend running?"));
    } finally {
      setSeeding(false);
    }
  };

  const handleRetrain = () => {
    setTraining(true);
    setTrainingLog([
      `[INFO] Loading ${modelType} config — epochs=${epochs}, lr=${learningRate}, loss=${lossFn}`,
      `[INFO] CUDA not detected. Switching to CPU training.`,
    ]);
    let epoch = 1;
    const maxEpochs = Math.min(epochs, 5); // simulate up to 5
    const interval = setInterval(() => {
      if (epoch > maxEpochs) {
        clearInterval(interval);
        setTraining(false);
        setTrainingLog((prev) => [
          ...prev,
          `[DONE] Training complete — Val Loss: ${(0.18 - maxEpochs * 0.025).toFixed(4)}, R²: 0.88`,
          `[INFO] Model weights saved to ml/models_saved/${modelType.toLowerCase()}_aqi.keras`,
        ]);
      } else {
        const loss = (0.15 - epoch * 0.02).toFixed(4);
        const vloss = (0.18 - epoch * 0.025).toFixed(4);
        setTrainingLog((prev) => [
          ...prev,
          `[EPOCH ${epoch}/${maxEpochs}] loss=${loss} — val_loss=${vloss}`,
        ]);
        epoch++;
      }
    }, 900);
  };

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight">System Admin Console</h2>
          <p className="text-xs text-muted-foreground">
            Monitor system health, ML model status, and external API connectivity
          </p>
        </div>
        <button
          onClick={fetchStatus}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-muted hover:bg-muted/80 text-xs font-semibold transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${statusLoading ? "animate-spin" : ""}`} />
          Refresh Status
        </button>
      </div>

      {/* ── System Status Cards ──────────────────────────────────────── */}
      {status ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Database stats */}
          <div className="bg-card p-5 rounded-2xl border border-border shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-500" />
              <h3 className="font-bold text-sm uppercase tracking-wider">Database</h3>
            </div>
            <div className="space-y-2 text-xs divide-y divide-border">
              {[
                { label: "Stations",          val: status.database.stations },
                { label: "AQI Records",        val: status.database.aqi_records },
                { label: "Predictions",        val: status.database.predictions },
                { label: "Records (last 24h)", val: status.database.records_24h },
                { label: "Users",              val: status.database.users },
              ].map(({ label, val }) => (
                <div key={label} className="flex justify-between py-1.5">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-bold">{val.toLocaleString()}</span>
                </div>
              ))}
            </div>
            {status.database.latest_record_at && (
              <p className="text-[10px] text-muted-foreground">
                Latest record: {new Date(status.database.latest_record_at).toLocaleString()}
              </p>
            )}
          </div>

          {/* ML model status */}
          <div className="bg-card p-5 rounded-2xl border border-border shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-blue-500" />
              <h3 className="font-bold text-sm uppercase tracking-wider">ML Models</h3>
            </div>
            <div className="space-y-2.5 text-xs">
              {[
                { label: "LSTM (Keras .keras)", ok: status.ml_models.lstm_loaded },
                { label: "XGBoost Fingerprinter",ok: status.ml_models.xgb_loaded },
                { label: "Inference Scalers",    ok: status.ml_models.scalers_loaded },
              ].map(({ label, ok }) => (
                <div key={label} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{label}</span>
                  <StatusBadge ok={ok} />
                </div>
              ))}
            </div>
            {/* Registered model versions */}
            {status.ml_models.registered.length > 0 && (
              <div className="border-t border-border pt-2.5 space-y-1.5">
                {status.ml_models.registered.map((m) => (
                  <div key={m.name} className="flex justify-between items-center text-[10px]">
                    <span className="text-muted-foreground">{m.name} {m.version}</span>
                    <span className="text-emerald-500 font-bold">R² {m.accuracy}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* API connectivity */}
          <div className="bg-card p-5 rounded-2xl border border-border shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Wifi className="w-5 h-5 text-blue-500" />
              <h3 className="font-bold text-sm uppercase tracking-wider">External APIs</h3>
            </div>
            <div className="space-y-3 text-xs">
              {[
                { label: "OpenAQ v3 (Live AQI Data)", key: status.external_apis.openaq },
                { label: "Open-Meteo (Weather Data)", key: status.external_apis.open_meteo },
              ].map(({ label, key }) => (
                <div key={label} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-[11px]">{label}</span>
                  <StatusBadge ok={key === "reachable"} label={key} />
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-2.5 space-y-1 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Server className="w-3 h-3" />
                <span>FastAPI Backend · Render</span>
                <StatusBadge ok label="Online" />
              </div>
               <div className="flex items-center gap-1.5">
                <Activity className="w-3 h-3" />
                <span>MQTT Status</span>
                {status.mqtt ? (
                  <span className={`font-bold ml-1 ${
                    status.mqtt.mode === "hardware" ? "text-emerald-500" :
                    status.mqtt.mode === "simulator" ? "text-amber-500" : "text-red-500"
                  }`}>
                    {status.mqtt.mode === "hardware" ? "🟢 Live Hardware" :
                     status.mqtt.mode === "simulator" ? "🟡 Simulator" : "🔴 Offline"}
                  </span>
                ) : (
                  <span className="text-muted-foreground ml-1">Unknown</span>
                )}
              </div>
              <p className={`text-[10px] mt-1 ${
                status.mqtt?.mode === "hardware" ? "text-emerald-500" :
                status.mqtt?.mode === "simulator" ? "text-amber-500" : "text-red-500"
              }`}>
                {status.mqtt?.mode === "hardware" && "✔ ESP32 hardware online — receiving live telemetry via HiveMQ"}
                {status.mqtt?.mode === "simulator" && "⚠ ESP32 hardware offline — using synthetic telemetry via MQTT publisher simulator"}
                {status.mqtt?.mode === "offline" && "✖ MQTT service stopped or offline — no telemetry being received"}
              </p>
            </div>
          </div>
        </div>
      ) : statusLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SkeletonCard height="h-40" />
          <SkeletonCard height="h-40" />
          <SkeletonCard height="h-40" />
        </div>
      ) : (
        <div className="p-6 bg-card border border-border rounded-2xl text-sm text-muted-foreground flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500" /> Could not reach backend. Is it running on port 8000?
        </div>
      )}

      {/* ── Operations + Training ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hyperparameters + Seed */}
        <div className="space-y-5 bg-card p-6 rounded-3xl border border-border shadow-sm">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <Cpu className="w-5 h-5 text-blue-500" />
            <h3 className="font-bold text-sm uppercase tracking-wider">ML Hyperparameters</h3>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Model</label>
              <select value={modelType} onChange={(e) => setModelType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs">
                <option value="LSTM">LSTM Sequence Model (Keras)</option>
                <option value="XGBoost">XGBoost Regressor</option>
                <option value="RF">Random Forest Classifier</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Epochs</label>
              <input type="number" value={epochs} onChange={(e) => setEpochs(Number(e.target.value))}
                className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Learning Rate</label>
              <input type="number" value={learningRate} step="0.0001" onChange={(e) => setLearningRate(Number(e.target.value))}
                className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Loss Function</label>
              <select value={lossFn} onChange={(e) => setLossFn(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs">
                <option value="mse">Mean Squared Error (MSE)</option>
                <option value="mae">Mean Absolute Error (MAE)</option>
                <option value="huber">Huber Loss</option>
              </select>
            </div>
            <button onClick={handleRetrain} disabled={training}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:opacity-90 text-white font-semibold text-xs disabled:opacity-50 flex items-center justify-center gap-2">
              {training && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              Simulate Model Retraining
            </button>
          </div>

          {/* DB Seed section */}
          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-500" />
              <h4 className="font-bold text-xs uppercase tracking-wider">Database Seed</h4>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Seeds 12 stations across Delhi, Pune, PCMC & Lonavala with 7 days of synthetic AQI history records.
            </p>
            <button onClick={handleSeed} disabled={seeding}
              className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${seeding ? "animate-spin" : ""}`} />
              {seeding ? "Seeding…" : "Seed Database"}
            </button>
            {seedMsg && (
              <div className="p-3 bg-muted border border-border rounded-xl text-xs font-medium text-muted-foreground">
                {seedMsg}
              </div>
            )}
          </div>
        </div>

        {/* Training console */}
        <div className="lg:col-span-2 bg-card p-6 rounded-3xl border border-border shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-blue-500" />
            <h3 className="font-bold text-sm uppercase tracking-wider">Training Console</h3>
          </div>
          <div className="bg-slate-900 text-slate-100 p-5 rounded-2xl font-mono text-[11px] h-80 overflow-y-auto space-y-1.5 border border-slate-800 leading-relaxed">
            <div className="text-slate-500"># AirSense AI Model Training Engine v2.0</div>
            <div className="text-slate-500"># Platform: ExpoAir Environmental Decision Support System</div>
            <div className="text-slate-500"># Dataset: CPCB-linked station history (Delhi · Pune · PCMC · Lonavala)</div>
            <div className="text-slate-400 mt-2">
              # ML pipeline: PM2.5, NO₂, wind_speed, wind_dir (sin/cos), humidity, temp,
            </div>
            <div className="text-slate-400">
              #              traffic_index, hour_sin, hour_cos, day_of_week → AQI [1h,3h,6h,12h,24h]
            </div>
            <div className="mt-2" />
            {status && (
              <>
                <div className={status.ml_models.lstm_loaded ? "text-emerald-400" : "text-amber-400"}>
                  {status.ml_models.lstm_loaded
                    ? "[OK] LSTM model loaded from ml/models_saved/lstm_aqi.keras"
                    : "[WARN] LSTM model not loaded — TF/Keras init failed or file missing"}
                </div>
                <div className={status.ml_models.xgb_loaded ? "text-emerald-400" : "text-amber-400"}>
                  {status.ml_models.xgb_loaded
                    ? "[OK] XGBoost fingerprinter loaded from ml/models_saved/source_fingerprinter.json"
                    : "[WARN] XGBoost model not loaded"}
                </div>
                <div className={status.ml_models.scalers_loaded ? "text-emerald-400" : "text-amber-400"}>
                  {status.ml_models.scalers_loaded
                    ? "[OK] Inference scalers loaded from ml/models_saved/scaler.pkl"
                    : "[WARN] Scalers not loaded — rule-based fallback active"}
                </div>
                <div className="text-blue-400 mt-1">
                  [INFO] DB: {status.database.aqi_records} AQI records · {status.database.stations} stations · {status.database.records_24h} records in last 24h
                </div>
              </>
            )}
            <div className="mt-2" />
            {trainingLog.map((line, i) => (
              <div key={i}
                className={
                  line.includes("DONE") || line.includes("complete") ? "text-emerald-400 font-bold" :
                  line.includes("WARN")  ? "text-amber-400" :
                  line.includes("ERROR") ? "text-red-400" :
                  line.includes("EPOCH") ? "text-cyan-300" :
                  "text-slate-300"
                }
              >
                {line}
              </div>
            ))}
            {training && <div className="text-blue-400 animate-pulse">Running training cycles…</div>}
          </div>

          {/* Data source info */}
          <div className="p-4 bg-muted/50 border border-border rounded-2xl space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider">About This Platform's Data</h4>
            <div className="text-[11px] text-muted-foreground space-y-1 leading-relaxed">
              <p>
                <strong>Station data</strong> — seeded from CPCB-compatible monitoring sites. History records
                are generated via a diurnal AQI simulation model with realistic city-specific baselines
                (Delhi ~130–180 AQI; Pune ~55–90; PCMC ~65–110; Lonavala ~25–40).
              </p>
              <p>
                <strong>Live data</strong> — the <code>/api/aqi/live</code> endpoint queries OpenAQ v3 for
                nearby stations, then fuses results with Open-Meteo weather data and traffic congestion heuristics.
              </p>
              <p>
                <strong>ML models</strong> — LSTM trained on synthetic multi-station history (9-feature window,
                5 forecast horizons). XGBoost fingerprinter classifies emission source type (vehicular,
                industrial, biogenic) from pollutant ratios.
              </p>
              <p>
                <strong>ESP32 sensor</strong> — hardware currently offline; MQTT publisher simulator
                injects synthetic telemetry every 12 s to keep the IoT feed active for demonstration.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
