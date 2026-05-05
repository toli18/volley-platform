// src/App.jsx
import { Suspense, useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import "./App.css";

export default function App() {
  const location = useLocation();
  const isImmersiveMode = useMemo(() => {
    const path = location.pathname || "";
    const isCoachBoard = path === "/coach-board";
    if (isCoachBoard) return true;

    const isTrainingDetails = /^\/trainings\/\d+\/?$/.test(path);
    if (!isTrainingDetails) return false;
    const sp = new URLSearchParams(location.search || "");
    return sp.get("mode") === "field";
  }, [location.pathname, location.search]);

  return (
    <div className="appShell bfvTheme">
      {!isImmersiveMode ? <Navbar /> : null}
      <main className={`appContent ${isImmersiveMode ? "appContent--immersive" : ""}`.trim()}>
        <Suspense fallback={<div style={{ padding: 24 }}>Зареждане...</div>}>
          <Outlet />
        </Suspense>
      </main>
      {!isImmersiveMode ? (
        <footer className="appFooter">
          <span>Volley Coach Platform</span>
          <span>Българска федерация по волейбол</span>
        </footer>
      ) : null}
    </div>
  );
}
