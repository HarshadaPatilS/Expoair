import React, { useState, useEffect } from "react";
import { apiService } from "../services/api";
import { Wind, ShieldCheck, Route, Eye, HeartPulse, BrainCircuit, ArrowRight } from "lucide-react";

interface LandingProps {
  setCurrentPage: (page: string) => void;
  setUserRole: (role: string) => void;
}

export const Landing: React.FC<LandingProps> = ({ setCurrentPage, setUserRole }) => {
  const [stations, setStations] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Fetch live stations for the ticker
    const loadStations = async () => {
      const data = await apiService.getStations();
      const stationsWithAqi = await Promise.all(
        data.map(async (s) => {
          const live = await apiService.getLiveAQI(s.latitude, s.longitude);
          return { ...s, aqi: live.aqi };
        })
      );
      setStations(stationsWithAqi);
    };
    loadStations();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isLogin) {
        const res = await apiService.login(email, password);
        localStorage.setItem("token", res.access_token);
        setUserRole(res.role);
      } else {
        const res = await apiService.signup(email, password);
        localStorage.setItem("token", res.access_token);
        setUserRole(res.role);
      }
      setCurrentPage("dashboard");
    } catch (err: any) {
      setError(err.message || "Authentication failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const getAqiColorClass = (aqi: number) => {
    if (aqi < 50) return "text-emerald-500 bg-emerald-500/10 border-emerald-500/25";
    if (aqi < 100) return "text-amber-500 bg-amber-500/10 border-amber-500/25";
    return "text-red-500 bg-red-500/10 border-red-500/25";
  };

  return (
    <div className="space-y-16 py-4">
      {/* Live AQI Ticker */}
      <div className="w-full overflow-hidden py-3 border-y border-border/80 bg-card/50 backdrop-blur-sm relative">
        <div className="flex animate-[marquee_25s_linear_infinite] gap-12 whitespace-nowrap w-max px-6">
          {stations.length > 0 ? (
            [...stations, ...stations].map((s, idx) => (
              <div key={idx} className="inline-flex items-center gap-2">
                <span className="text-sm font-semibold">{s.name.split(" ")[0]}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${getAqiColorClass(s.aqi)}`}>
                  AQI {s.aqi}
                </span>
              </div>
            ))
          ) : (
            <div className="text-sm text-muted-foreground">Gathering live environmental feeds...</div>
          )}
        </div>
        {/* CSS animation inline for Vite compatibility */}
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes marquee {
            0% { transform: translate3d(0, 0, 0); }
            100% { transform: translate3d(-50%, 0, 0); }
          }
        `}} />
      </div>

      {/* Hero Section */}
      <div className="grid md:grid-cols-2 gap-12 items-center">
        <div className="space-y-6 text-left">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 dark:bg-emerald-500/10 text-blue-600 dark:text-emerald-400 px-3 py-1.5 rounded-full text-xs font-semibold border border-blue-500/20 dark:border-emerald-500/20">
            <Wind className="w-4 h-4 animate-pulse" />
            Next-Gen Environmental Decision Support System (EDSS)
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.1] text-foreground">
            AirSense AI
            <span className="block mt-2 text-2xl md:text-4xl font-semibold bg-gradient-to-r from-blue-500 to-emerald-500 bg-clip-text text-transparent">
              Predict. Understand. Breathe Better.
            </span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl">
            Beyond standard AQI dashboards, AirSense AI fuses real-time data to estimate exposure, compute low-pollution transit, evaluate health risks, and explain forecasts.
          </p>
          <div className="flex gap-4">
            <button 
              onClick={() => setCurrentPage("dashboard")}
              className="bg-blue-600 dark:bg-emerald-500 hover:opacity-90 text-white font-medium px-6 py-3 rounded-xl shadow-md flex items-center gap-2 group transition-all"
            >
              Explore Dashboard
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>

        {/* Animated Earth Graphic */}
        <div className="flex justify-center relative select-none">
          <div className="w-72 h-72 md:w-96 md:h-96 rounded-full bg-gradient-to-br from-blue-600/15 to-emerald-500/15 border-2 border-border/40 flex items-center justify-center relative shadow-2xl">
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-blue-500/10 via-transparent to-emerald-500/10 animate-pulse" />
            <svg viewBox="0 0 100 100" className="w-64 h-64 md:w-80 md:h-80 text-blue-500/40 dark:text-emerald-400/30 animate-spin-slow">
              <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3 3" />
              <path d="M 15 50 Q 50 15 85 50 Q 50 85 15 50" fill="none" stroke="currentColor" strokeWidth="0.5" />
              <path d="M 50 15 Q 15 50 50 85 Q 85 50 50 15" fill="none" stroke="currentColor" strokeWidth="0.5" />
              <line x1="50" y1="2" x2="50" y2="98" stroke="currentColor" strokeWidth="0.5" />
              <line x1="2" y1="50" x2="98" y2="50" stroke="currentColor" strokeWidth="0.5" />
            </svg>
            <div className="absolute flex flex-col items-center text-center">
              <Wind className="w-10 h-10 text-blue-600 dark:text-emerald-400 mb-2" />
              <span className="font-bold text-lg">AI Fusion</span>
              <span className="text-xs text-muted-foreground">Global Environmental Index</span>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Cards Grid */}
      <div className="space-y-6">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-center">Platform Capabilities</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl border border-border bg-card/40 hover:border-blue-500/30 dark:hover:border-emerald-500/30 hover:bg-card/70 transition-all text-left space-y-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 dark:bg-emerald-500/10 text-blue-600 dark:text-emerald-400 flex items-center justify-center">
              <BrainCircuit className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold">XAI Forecasting</h3>
            <p className="text-sm text-muted-foreground">
              Predict pollution levels using LSTM, XGBoost, and Random Forest. Examine feature contributions directly using interactive SHAP metrics.
            </p>
          </div>
          <div className="p-6 rounded-2xl border border-border bg-card/40 hover:border-blue-500/30 dark:hover:border-emerald-500/30 hover:bg-card/70 transition-all text-left space-y-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 dark:bg-emerald-500/10 text-blue-600 dark:text-emerald-400 flex items-center justify-center">
              <HeartPulse className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold">Health Assessment</h3>
            <p className="text-sm text-muted-foreground">
              Personalized risk scoring modeled on Apple Health style. Tailored advice for asthmatics, children, seniors, and cardio-sensitive groups.
            </p>
          </div>
          <div className="p-6 rounded-2xl border border-border bg-card/40 hover:border-blue-500/30 dark:hover:border-emerald-500/30 hover:bg-card/70 transition-all text-left space-y-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 dark:bg-emerald-500/10 text-blue-600 dark:text-emerald-400 flex items-center justify-center">
              <Route className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold">Low-Pollution Routes</h3>
            <p className="text-sm text-muted-foreground">
              Compare transit lines not just by travel speed, but by cumulative PM2.5 inhalation risk. Navigate safely and breathe cleaner.
            </p>
          </div>
        </div>
      </div>

      {/* Auth Panel */}
      <div className="max-w-md mx-auto p-8 rounded-3xl border border-border bg-card shadow-lg space-y-6">
        <div className="text-center space-y-2">
          <h3 className="text-2xl font-bold">{isLogin ? "Sign In" : "Create Account"}</h3>
          <p className="text-sm text-muted-foreground">
            {isLogin ? "Access your personal EDSS profile" : "Register to start mapping exposure and routing"}
          </p>
        </div>

        {error && <div className="text-sm p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive font-medium">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">EMAIL ADDRESS</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. user@airsense.ai" 
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-emerald-500 text-sm transition-all"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">PASSWORD</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" 
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-emerald-500 text-sm transition-all"
              required
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-3 rounded-xl bg-blue-600 dark:bg-emerald-500 hover:opacity-95 text-white font-medium shadow-sm transition-all disabled:opacity-50 text-sm"
          >
            {loading ? "Authenticating..." : isLogin ? "Sign In" : "Register"}
          </button>
        </form>

        <div className="text-center">
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="text-xs text-blue-600 dark:text-emerald-400 font-semibold hover:underline"
          >
            {isLogin ? "New to AirSense AI? Register account" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
};
