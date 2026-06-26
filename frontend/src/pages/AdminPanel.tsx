import React, { useState } from "react";
import { Database, Cpu, RefreshCw, Terminal } from "lucide-react";

export const AdminPanel: React.FC = () => {
  const [modelType, setModelType] = useState<string>("LSTM");
  const [epochs, setEpochs] = useState<number>(50);
  const [learningRate, setLearningRate] = useState<number>(0.001);
  const [lossFn, setLossFn] = useState<string>("mse");
  
  const [seeding, setSeeding] = useState<boolean>(false);
  const [seedStatus, setSeedStatus] = useState<string>("");
  const [trainingLog, setTrainingLog] = useState<string[]>([]);
  const [training, setTraining] = useState<boolean>(false);

  const handleSeeding = async () => {
    setSeeding(true);
    setSeedStatus("Executing seed script database/seeds/seed_data.py...");
    
    // Simulate database seeding completion
    setTimeout(() => {
      setSeedStatus("Database seeded successfully! Created 4 stations, 1,000 telemetry entries, and initial model versions.");
      setSeeding(false);
    }, 2000);
  };

  const handleRetrain = () => {
    setTraining(true);
    setTrainingLog([]);
    let currentEpoch = 1;
    
    const interval = setInterval(() => {
      if (currentEpoch > 5) {
        clearInterval(interval);
        setTraining(false);
        setTrainingLog(prev => [...prev, `[INFO] Model training complete! Validation loss: 0.042, R² accuracy: 0.88`]);
      } else {
        setTrainingLog(prev => [
          ...prev, 
          `[EPOCH ${currentEpoch}/5] Loss: ${(0.15 - currentEpoch*0.02).toFixed(4)} - Val Loss: ${(0.18 - currentEpoch*0.025).toFixed(4)}`
        ]);
        currentEpoch++;
      }
    }, 800);
  };

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight">System Admin Console</h2>
          <p className="text-xs text-muted-foreground">Override model configurations, initiate ML trainings, and monitor database pipelines</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Model Hyperparameters override */}
        <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <Cpu className="w-5 h-5 text-blue-500" />
            <h3 className="font-bold text-sm uppercase tracking-wider">ML Hyperparameters</h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Target Framework Model</label>
              <select 
                value={modelType} 
                onChange={(e) => setModelType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs"
              >
                <option value="LSTM">LSTM Sequence Model (Keras)</option>
                <option value="XGBoost">XGBoost Regressor</option>
                <option value="RF">Random Forest Classifier</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Epochs</label>
              <input 
                type="number" value={epochs}
                onChange={(e) => setEpochs(Number(e.target.value))}
                className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Learning Rate</label>
              <input 
                type="number" value={learningRate} step="0.0001"
                onChange={(e) => setLearningRate(Number(e.target.value))}
                className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Loss Function</label>
              <select 
                value={lossFn} 
                onChange={(e) => setLossFn(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs"
              >
                <option value="mse">Mean Squared Error (MSE)</option>
                <option value="mae">Mean Absolute Error (MAE)</option>
                <option value="huber">Huber Loss</option>
              </select>
            </div>

            <button 
              onClick={handleRetrain}
              disabled={training}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:opacity-95 text-white font-medium text-xs mt-2 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {training ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
              Trigger Model Retraining
            </button>
          </div>
        </div>

        {/* Database Pipeline Controls */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border">
              <Database className="w-5 h-5 text-blue-500" />
              <h3 className="font-bold text-sm uppercase tracking-wider">Database Operations</h3>
            </div>
            
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div>
                <h4 className="font-bold text-sm">Synchronize & Seed Datasets</h4>
                <p className="text-xs text-muted-foreground max-w-md">Creates core schemas and seeds historical air records, local stations, and initial user tables.</p>
              </div>

              <button
                onClick={handleSeeding}
                disabled={seeding}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all disabled:opacity-50 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${seeding ? "animate-spin" : ""}`} />
                Seed Database
              </button>
            </div>

            {seedStatus && (
              <div className="p-3 bg-muted border border-border rounded-xl text-xs font-medium text-muted-foreground">
                {seedStatus}
              </div>
            )}
          </div>

          {/* Real-time console logs */}
          <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-blue-500" />
              <h3 className="font-bold text-sm uppercase tracking-wider">Training Console Logs</h3>
            </div>

            <div className="bg-slate-900 text-slate-100 p-4 rounded-2xl font-mono text-[11px] h-48 overflow-y-auto space-y-1.5 border border-slate-800">
              <div className="text-slate-400"># AirSense AI Model Training Engine v2.0</div>
              <div className="text-slate-400"># Initializing TensorFlow and PyTorch device maps... CUDA not detected, falling back to CPU.</div>
              {trainingLog.map((log, idx) => (
                <div key={idx} className={log.includes("complete") ? "text-emerald-400 font-bold" : ""}>{log}</div>
              ))}
              {training && <div className="text-blue-400 animate-pulse">Running training cycles...</div>}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
