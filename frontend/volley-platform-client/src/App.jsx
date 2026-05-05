// src/App.jsx
import { Suspense, useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import "./App.css";

export default function App() {
  const location = useLocation();
  const isFieldMode = useMemo(() => {
    const isTrainingDetails = /^\/trainings\/\d+$/.test(location.pathname || "");
    if (!isTrainingDetails) return false;
    const sp = new URLSearchParams(location.search || "");
    return sp.get("mode") === "field";
  }, [location.pathname, location.search]);

  return (
    <div className="appShell bfvTheme">
      {!isFieldMode ? <Navbar /> : null}
      <main className={`appContent ${isFieldMode ? "appContent--immersive" : ""}`.trim()}>
        <Suspense fallback={<div style={{ padding: 24 }}>Зареждане...</div>}>
          <Outlet />
        </Suspense>
      </main>
      {!isFieldMode ? (
        <footer className="appFooter">
          <span>Volley Coach Platform</span>
          <span>Българска федерация по волейбол</span>
        </footer>
      ) : null}
    </div>
  );
}
