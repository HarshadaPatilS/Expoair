import React, { useState, useEffect } from "react";
import { apiService } from "../services/api";
import { Heart, Activity, Flame, ShieldAlert, Baby, User } from "lucide-react";

export const Health: React.FC = () => {
  const [ageGroup, setAgeGroup] = useState<string>("adult");
  const [asthma, setAsthma] = useState<string>("none");
  const [pregnant, setPregnant] = useState<boolean>(false);
  const [cardiovascular, setCardiovascular] = useState<boolean>(false);
  const [aqiInput, setAqiInput] = useState<number>(115);
  const [assessment, setAssessment] = useState<any>(null);

  const fetchAssessment = async () => {
    const data = await apiService.getHealthAssessment({
      age_group: ageGroup,
      asthma,
      pregnant,
      cardiovascular,
      current_aqi: aqiInput
    });
    setAssessment(data);
  };

  useEffect(() => {
    fetchAssessment();
  }, [ageGroup, asthma, pregnant, cardiovascular, aqiInput]);

  const getSeverityIcon = (iconName: string) => {
    switch (iconName) {
      case "Flame": return Flame;
      case "ShieldAlert": return ShieldAlert;
      case "Baby": return Baby;
      default: return Activity;
    }
  };

  const getSeverityColors = (severity: string) => {
    switch (severity) {
      case "danger": return "border-red-500/25 bg-red-500/10 text-red-500";
      case "warning": return "border-amber-500/25 bg-amber-500/10 text-amber-500";
      case "success": return "border-emerald-500/25 bg-emerald-500/10 text-emerald-500";
      default: return "border-blue-500/25 bg-blue-500/10 text-blue-500";
    }
  };

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Personalized Health Risk Dashboard</h2>
          <p className="text-xs text-muted-foreground">Apple Health style environmental susceptibility scoring</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Questionnaire Panel */}
        <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <User className="w-5 h-5 text-blue-500" />
            <h3 className="font-bold text-sm uppercase tracking-wider">Health Profile Settings</h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Age Demographic</label>
              <select 
                value={ageGroup} 
                onChange={(e) => setAgeGroup(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="child">Child (Under 12)</option>
                <option value="adult">Adult (13 - 64)</option>
                <option value="senior">Senior Citizen (65+)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Asthma Diagnosis</label>
              <select 
                value={asthma} 
                onChange={(e) => setAsthma(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="none">No History</option>
                <option value="mild">Mild intermittent / seasonal</option>
                <option value="severe">Severe persistent</option>
              </select>
            </div>

            <div className="space-y-3 pt-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase block">Clinical Comorbidities</label>
              
              <label className="flex items-center gap-3 cursor-pointer text-sm font-medium">
                <input 
                  type="checkbox" 
                  checked={pregnant} 
                  onChange={(e) => setPregnant(e.target.checked)}
                  className="rounded border-border text-blue-600 focus:ring-blue-500"
                />
                <span>Active Pregnancy</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer text-sm font-medium">
                <input 
                  type="checkbox" 
                  checked={cardiovascular} 
                  onChange={(e) => setCardiovascular(e.target.checked)}
                  className="rounded border-border text-blue-600 focus:ring-blue-500"
                />
                <span>Cardiovascular condition</span>
              </label>
            </div>

            <div className="space-y-1.5 pt-3 border-t border-border">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-muted-foreground">Current Environmental AQI</span>
                <span className="text-blue-500">{aqiInput}</span>
              </div>
              <input 
                type="range" min="10" max="300" value={aqiInput}
                onChange={(e) => setAqiInput(Number(e.target.value))}
                className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>
          </div>
        </div>

        {/* Apple Health Cards Grid */}
        <div className="lg:col-span-2 space-y-6">
          {assessment && (
            <div className="space-y-6">
              
              {/* Score Header Card */}
              <div className="bg-card p-6 rounded-3xl border border-border shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-rose-500/20 bg-rose-500/10 text-rose-500 text-xs font-bold uppercase">
                    <Heart className="w-3.5 h-3.5 fill-rose-500 animate-pulse" />
                    Exposure Index
                  </div>
                  <h3 className="text-xl font-bold tracking-tight">Your Personal Safety Rating</h3>
                  <p className="text-xs text-muted-foreground max-w-md">{assessment.summary}</p>
                </div>

                <div className="flex flex-col items-center shrink-0">
                  <div className="w-24 h-24 rounded-full border-4 border-muted flex items-center justify-center relative">
                    {/* Ring Color depending on safety score */}
                    <div 
                      className={`absolute inset-0 rounded-full border-4 ${
                        assessment.safety_score > 75 ? "border-emerald-500" : assessment.safety_score > 40 ? "border-amber-500" : "border-red-500"
                      }`} 
                      style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)" }}
                    />
                    <span className="text-2xl font-extrabold">{assessment.safety_score}%</span>
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase mt-2">Safety Score</span>
                </div>
              </div>

              {/* Assessment Grid Cards */}
              <div className="grid md:grid-cols-2 gap-4">
                {assessment.cards.map((c: any, idx: number) => {
                  const CardIcon = getSeverityIcon(c.icon);
                  return (
                    <div 
                      key={idx} 
                      className="p-5 rounded-2xl border border-border bg-card shadow-sm flex flex-col justify-between gap-4 hover:shadow-md transition-shadow text-left"
                    >
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{c.title}</span>
                          <span className="text-lg font-bold">{c.value}</span>
                        </div>

                        <div className={`p-2.5 rounded-xl border ${getSeverityColors(c.severity)}`}>
                          <CardIcon className="w-5 h-5" />
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground leading-relaxed">{c.description}</p>
                    </div>
                  );
                })}
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  );
};
