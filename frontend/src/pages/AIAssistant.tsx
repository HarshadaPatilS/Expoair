import React, { useState, useRef, useEffect } from "react";
import { apiService } from "../services/api";
import { Send, Sparkles, User, Bot, WifiOff } from "lucide-react";
import { EmptyState } from "../components/EmptyState";

interface Message {
  sender: "user" | "bot";
  text: string;
  timestamp: Date;
}

export const AIAssistant: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: "bot",
      text: "Hello! I am your AirSense AI environmental decision support assistant. Ask me questions about rising AQI, forecasting, best exercise hours, or SHAP prediction explainer insights.",
      timestamp: new Date()
    }
  ]);
  const [inputVal, setInputVal] = useState<string>("");
  const [sending, setSending] = useState<boolean>(false);
  
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const presets = [
    "Why is AQI rising?",
    "Will tomorrow be better?",
    "Safest exercise window?",
    "Explain prediction SHAP"
  ];

  const handleSend = async (text: string) => {
    if (!text.trim() || sending) return;

    // Add user message
    const userMsg: Message = { sender: "user", text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInputVal("");
    setSending(true);

    const res = await apiService.sendMessage(text);
    if (res === null) {
      // Backend is offline
      const offlineMsg: Message = {
        sender: "bot",
        text: "📵 Cannot reach the AI backend. Please start the FastAPI server and try again.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, offlineMsg]);
    } else {
      const botMsg: Message = {
        sender: "bot",
        text: res.answer,
        timestamp: new Date(res.timestamp || Date.now()),
      };
      setMessages(prev => [...prev, botMsg]);
    }
    setSending(false);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="space-y-6 text-left max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Environmental Decision Support Chat</h2>
          <p className="text-xs text-muted-foreground">Conversational assistant for real-time explanations and health advisories</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* Preset suggestions list */}
        <div className="md:col-span-1 bg-card p-5 rounded-3xl border border-border shadow-sm space-y-4 h-fit">
          <div className="flex items-center gap-2 pb-2.5 border-b border-border">
            <Sparkles className="w-4.5 h-4.5 text-blue-500" />
            <h3 className="font-bold text-xs uppercase tracking-wider">Suggested Queries</h3>
          </div>
          
          <div className="space-y-2">
            {presets.map((p, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(p)}
                className="w-full p-2.5 text-left text-xs bg-muted/40 hover:bg-muted border border-border/80 hover:border-border rounded-xl font-medium transition-all"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Chat screen pane */}
        <div className="md:col-span-3 bg-card rounded-3xl border border-border shadow-sm flex flex-col h-[500px]">
          
          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map((m, idx) => {
              const isUser = m.sender === "user";
              return (
                <div key={idx} className={`flex gap-3.5 max-w-[85%] ${isUser ? "ml-auto flex-row-reverse" : "mr-auto"}`}>
                  <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center font-bold text-white text-xs ${isUser ? "bg-blue-600" : "bg-emerald-600"}`}>
                    {isUser ? <User className="w-4.5 h-4.5" /> : <Bot className="w-4.5 h-4.5" />}
                  </div>

                  <div className={`p-4 rounded-2xl border text-xs leading-relaxed ${
                    isUser 
                      ? "bg-blue-600/10 border-blue-500/20 text-foreground" 
                      : "bg-muted/40 border-border/80 text-foreground"
                  }`}>
                    {m.text}
                    <span className="block text-[8px] text-muted-foreground font-semibold tracking-wider text-right mt-2 uppercase">
                      {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input box */}
          <div className="p-4 border-t border-border bg-card/60 backdrop-blur-sm rounded-b-3xl">
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleSend(inputVal);
              }}
              className="flex gap-2"
            >
              <input 
                type="text" 
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Ask AirSense AI: 'Why is pollution rising today?'"
                className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={sending}
              />
              <button 
                type="submit" 
                disabled={!inputVal.trim() || sending}
                className="p-2.5 bg-blue-600 text-white hover:opacity-90 rounded-xl transition-all disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>

        </div>

      </div>
    </div>
  );
};
