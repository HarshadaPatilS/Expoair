import React, { useState, useEffect } from "react";
import { 
  LayoutDashboard, Map, TrendingUp, Activity, User, Route, 
  MessageSquare, BarChart3, ShieldAlert, Sun, Moon, LogOut, LogIn, Menu, X, Wind
} from "lucide-react";

interface MainLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  setCurrentPage: (page: string) => void;
  userRole: string;
  setUserRole: (role: string) => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ 
  children, 
  currentPage, 
  setCurrentPage, 
  userRole, 
  setUserRole 
}) => {
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

  useEffect(() => {
    // Apply theme
    const root = window.document.documentElement;
    if (darkMode) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [darkMode]);

  const navItems = [
    { id: "landing", label: "Home", icon: Wind },
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "map", label: "Live Map", icon: Map },
    { id: "forecast", label: "Forecasting & XAI", icon: TrendingUp },
    { id: "health", label: "Health Score", icon: Activity },
    { id: "exposure", label: "Personal Exposure", icon: User },
    { id: "routes", label: "Route Optimizer", icon: Route },
    { id: "chat", label: "AI Assistant", icon: MessageSquare },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    ...(userRole === "admin" ? [{ id: "admin", label: "Admin Panel", icon: ShieldAlert }] : []),
  ];

  const handleLogout = () => {
    localStorage.removeItem("token");
    setUserRole("");
    setCurrentPage("landing");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground transition-colors duration-300">
      {/* Header */}
      <header className="h-16 border-b border-border flex items-center justify-between px-6 sticky top-0 bg-background/80 backdrop-blur-md z-40">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-muted rounded-md md:hidden"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentPage("landing")}>
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold text-lg shadow-sm shadow-emerald-500/30">
              A
            </div>
            <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-blue-500 to-emerald-500 bg-clip-text text-transparent">
              AirSense AI
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 hover:bg-muted rounded-full transition-colors"
            title="Toggle Theme"
          >
            {darkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-slate-700" />}
          </button>

          {userRole ? (
            <div className="flex items-center gap-3">
              <span className="hidden md:inline text-sm font-medium text-muted-foreground">
                Role: <span className="text-foreground capitalize font-semibold">{userRole}</span>
              </span>
              <button 
                onClick={handleLogout}
                className="flex items-center gap-2 text-sm bg-destructive/10 hover:bg-destructive/20 text-destructive px-3.5 py-1.5 rounded-lg font-medium transition-all"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden md:inline">Sign Out</span>
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setCurrentPage("landing")}
              className="flex items-center gap-2 text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium shadow-sm hover:opacity-90 transition-all"
            >
              <LogIn className="w-4 h-4" />
              <span>Get Started</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 relative">
        {/* Sidebar */}
        <aside className={`
          fixed md:sticky top-16 left-0 h-[calc(100vh-4rem)] border-r border-border bg-background z-30
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? "w-64" : "w-0 md:w-16 overflow-hidden"}
        `}>
          <div className="flex flex-col h-full py-4 justify-between">
            <nav className="space-y-1.5 px-3">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentPage(item.id);
                      if (window.innerWidth < 768) setSidebarOpen(false);
                    }}
                    className={`
                      w-full flex items-center gap-3.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
                      ${isActive 
                        ? "bg-blue-600/10 dark:bg-emerald-500/10 text-blue-600 dark:text-emerald-400 border border-blue-600/20 dark:border-emerald-500/20" 
                        : "hover:bg-muted text-muted-foreground hover:text-foreground border border-transparent"}
                    `}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? "text-blue-500 dark:text-emerald-400" : "text-muted-foreground"}`} />
                    <span className={sidebarOpen ? "opacity-100" : "opacity-0 md:hidden"}>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="px-4 text-center">
              <p className="text-[10px] text-muted-foreground tracking-wider font-semibold">
                ENVIRONMENTAL EDSS v2.0
              </p>
            </div>
          </div>
        </aside>

        {/* Backdrop for mobile */}
        {sidebarOpen && (
          <div 
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/40 z-20 md:hidden top-16"
          />
        )}

        {/* Content Pane */}
        <main className="flex-1 overflow-x-hidden min-h-[calc(100vh-4rem)]">
          <div className="p-6 md:p-8 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
