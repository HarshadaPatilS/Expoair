import { useState } from "react";
import { MainLayout } from "./layouts/MainLayout";
import { Landing } from "./pages/Landing";
import { Dashboard } from "./pages/Dashboard";
import { LiveMap } from "./pages/LiveMap";
import { Forecast } from "./pages/Forecast";
import { Health } from "./pages/Health";
import { Exposure } from "./pages/Exposure";
import { RoutePlanner } from "./pages/RoutePlanner";
import { AIAssistant } from "./pages/AIAssistant";
import { Analytics } from "./pages/Analytics";
import { AdminPanel } from "./pages/AdminPanel";
import { Alerts } from "./pages/Alerts";

import "./App.css";

function App() {
  const [currentPage, setCurrentPage] = useState<string>("landing");
  const [userRole, setUserRole] = useState<string>("");

  const renderPage = () => {
    switch (currentPage) {
      case "landing":
        return <Landing setCurrentPage={setCurrentPage} setUserRole={setUserRole} />;
      case "dashboard":
        return <Dashboard />;
      case "map":
        return <LiveMap />;
      case "forecast":
        return <Forecast />;
      case "health":
        return <Health />;
      case "exposure":
        return <Exposure />;
      case "routes":
        return <RoutePlanner />;
      case "chat":
        return <AIAssistant />;
      case "analytics":
        return <Analytics />;
      case "alerts":
        return <Alerts />;
      case "admin":
        return <AdminPanel />;
      default:
        return <Landing setCurrentPage={setCurrentPage} setUserRole={setUserRole} />;
    }
  };

  return (
    <MainLayout 
      currentPage={currentPage} 
      setCurrentPage={setCurrentPage}
      userRole={userRole}
      setUserRole={setUserRole}
    >
      {renderPage()}
    </MainLayout>
  );
}

export default App;
