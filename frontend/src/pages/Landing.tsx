import React, { useState, useEffect, useCallback } from "react";
import { apiService } from "../services/api";
import { Wind, Route, HeartPulse, BrainCircuit, ArrowRight, Info, X } from "lucide-react";

interface LandingProps {
  setCurrentPage: (page: string) => void;
  setUserRole:    (role: string) => void;
}

export const Landing: React.FC<LandingProps> = ({ setCurrentPage, setUserRole }) => {
  const [stations, setStations] = useState<any[]>([]);
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [isLogin,  setIsLogin]  = useState(true);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    // Fetch live stations for the ticker
    const load = async () => {
      try {
        const data = await apiService.getLiveStations();
        setStations(data.filter((s: any) => s.aqi != null));
      } catch {
        // try fallback
        try {
          const data = await apiService.getStations();
          const withAqi = await Promise.all(
            data.slice(0, 6).map(async (s: any) => {
              try {
                const live = await apiService.getLiveAQI(s.latitude, s.longitude);
                return { ...s, aqi: live.aqi, city: s.name.includes("Delhi") ? "Delhi" : "Pune" };
              } catch { return { ...s, aqi: null }; }
            })
          );
          setStations(withAqi.filter((s) => s.aqi != null));
        } catch { }
      }
    };
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = isLogin
        ? await apiService.login(email, password)
        : await apiService.signup(email, password);
      localStorage.setItem("token", res.access_token);
      setUserRole(res.role);
      setCurrentPage("dashboard");
    } catch (err: any) {
      setError(err.message || "Authentication failed. Please try again.");
    } finally { setLoading(false); }
  };

  const aqiBadgeClass = (aqi: number) =>
    aqi < 50  ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/25" :
    aqi < 100 ? "text-amber-500 bg-amber-500/10 border-amber-500/25" :
    aqi < 200 ? "text-red-500 bg-red-500/10 border-red-500/25" :
                "text-purple-500 bg-purple-500/10 border-purple-500/25";

  return (
    <div className="space-y-16 py-4">
      {/* Live AQI Ticker */}
      <div className="w-full overflow-hidden py-3 border-y border-border/80 bg-card/50 backdrop-blur-sm relative">
        <div className="flex animate-[marquee_30s_linear_infinite] gap-10 whitespace-nowrap w-max px-6">
          {stations.length > 0 ? (
            [...stations, ...stations].map((s, idx) => (
              <div key={idx} className="inline-flex items-center gap-2">
                <span className="text-sm font-semibold truncate max-w-[140px]">
                  {s.name?.split(" ").slice(0, 2).join(" ")}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${aqiBadgeClass(s.aqi)}`}>
                  AQI {Math.round(s.aqi)}
                </span>
              </div>
            ))
          ) : (
            <div className="text-sm text-muted-foreground px-4">
              Gathering live environmental feeds — seed database via Admin Panel if empty…
            </div>
          )}
        </div>
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes marquee {
            0%   { transform: translate3d(0,0,0); }
            100% { transform: translate3d(-50%,0,0); }
          }
        `}} />
      </div>

      {/* Hero */}
      <div className="grid md:grid-cols-2 gap-12 items-center">
        <div className="space-y-6 text-left">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 dark:bg-emerald-500/10 text-blue-600 dark:text-emerald-400 px-3 py-1.5 rounded-full text-xs font-semibold border border-blue-500/20 dark:border-emerald-500/20">
            <Wind className="w-4 h-4 animate-pulse" />
            Environmental Decision Support System (EDSS)
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.1]">
            AirSense AI
            <span className="block mt-2 text-2xl md:text-4xl font-semibold bg-gradient-to-r from-blue-500 to-emerald-500 bg-clip-text text-transparent">
              Predict. Understand. Breathe Better.
            </span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl">
            Real-time AQI data from Delhi, Pune, PCMC & Lonavala — fused with LSTM forecasts,
            SHAP explainability, health risk scoring, and low-pollution route planning.
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setCurrentPage("dashboard")}
              className="bg-blue-600 dark:bg-emerald-500 hover:opacity-90 text-white font-medium px-6 py-3 rounded-xl shadow-md flex items-center gap-2 group transition-all"
            >
              Explore Dashboard
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => setShowAuth(true)}
              className="border border-border bg-muted hover:bg-card text-foreground font-medium px-6 py-3 rounded-xl transition-all text-sm flex items-center gap-2"
            >
              Sign In / Register
              <Info className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Why sign in? */}
          <div className="flex items-start gap-2 p-3 bg-muted/50 border border-border rounded-xl text-xs text-muted-foreground max-w-md">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
            <span>
              <strong>Why create an account?</strong> Sign in to save your personal health profile
              (asthma, age group, cardiovascular risk), track cumulative exposure history, and receive
              personalised route recommendations. All platform features work without an account.
            </span>
          </div>
        </div>

        {/* Animated globe */}
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
              <span className="text-xs text-muted-foreground">Delhi · Pune · PCMC · Lonavala</span>
            </div>
          </div>
        </div>
      </div>

      {/* Feature cards */}
      <div className="space-y-6">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-center">Platform Capabilities</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: BrainCircuit, title: "XAI Forecasting",
              desc: "LSTM sequence model predicts AQI at 1h, 3h, 6h, 12h, 24h horizons. Interactive SHAP sliders let you see how PM2.5, wind speed, and traffic each shift the prediction.",
            },
            {
              icon: HeartPulse, title: "Health Assessment",
              desc: "Personalised risk scoring for asthmatics, children, seniors, and cardio-sensitive groups. Includes safe exercise window advisory based on current AQI.",
            },
            {
              icon: Route, title: "Low-Pollution Routes",
              desc: "Compare Shortest / Fastest / Cleanest / Balanced commute alternatives. Each route samples AQI from monitoring stations along the path. Exposure score = time × AQI/100.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="p-6 rounded-2xl border border-border bg-card/40 hover:border-blue-500/30 dark:hover:border-emerald-500/30 hover:bg-card/70 transition-all text-left space-y-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 dark:bg-emerald-500/10 text-blue-600 dark:text-emerald-400 flex items-center justify-center">
                <Icon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold">{title}</h3>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Auth modal */}
      {showAuth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="max-w-md w-full p-8 rounded-3xl border border-border bg-card shadow-2xl space-y-6 relative">
            <button onClick={() => setShowAuth(false)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-muted">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold">{isLogin ? "Sign In" : "Create Account"}</h3>
              <p className="text-sm text-muted-foreground">
                {isLogin
                  ? "Access your personal health profile & exposure history"
                  : "Register to save routes, health profiles, and exposure tracking"}
              </p>
            </div>
            {error && (
              <div className="text-sm p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive font-medium">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4 text-left">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">EMAIL</label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@airsense.ai" required
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">PASSWORD</label>
                <input
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" required
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <button
                type="submit" disabled={loading}
                className="w-full py-3 rounded-xl bg-blue-600 dark:bg-emerald-500 hover:opacity-95 text-white font-medium disabled:opacity-50 text-sm"
              >
                {loading ? "Authenticating…" : isLogin ? "Sign In" : "Register"}
              </button>
            </form>
            <div className="text-center space-y-2">
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="text-xs text-blue-600 dark:text-emerald-400 font-semibold hover:underline"
              >
                {isLogin ? "New to AirSense? Register account" : "Already have an account? Sign in"}
              </button>
              <div className="text-[10px] text-muted-foreground">
                Demo: admin@airsense.ai / admin123
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
