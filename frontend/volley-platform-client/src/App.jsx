// src/App.jsx
import { Suspense, useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import CoachMobileForeignChrome from "./components/coachMobile/CoachMobileForeignChrome";
import useCoachMobileForeignChrome from "./hooks/useCoachMobileForeignChrome";
import "./App.css";
import "./components/shell/mobileContent.css";

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

  const isPublicPortal = useMemo(() => {
    const path = location.pathname || "";
    return (
      path === "/parent" ||
      path.startsWith("/parent/") ||
      path === "/room" ||
      path.startsWith("/room/")
    );
  }, [location.pathname]);

  const isCoachMobile = useMemo(() => {
    const path = location.pathname || "";
    return path === "/coach" || path.startsWith("/coach/");
  }, [location.pathname]);

  const coachForeignChrome = useCoachMobileForeignChrome(location.pathname, location.search);

  const hideAppChrome = isPublicPortal || isCoachMobile || coachForeignChrome;
  const shellClass = isPublicPortal
    ? "appShell--parentPortal"
    : isCoachMobile
      ? "appShell--coachMobile"
      : coachForeignChrome
        ? "appShell--coachMobileForeign"
        : "";

  return (
    <div className={`appShell bfvTheme ${shellClass}`.trim()}>
      {!isImmersiveMode && !hideAppChrome ? <Navbar /> : null}
      {coachForeignChrome ? <CoachMobileForeignChrome /> : null}
      <main
        className={`appContent ${isImmersiveMode ? "appContent--immersive" : ""} ${isPublicPortal ? "appContent--parentPortal" : ""} ${isCoachMobile ? "appContent--coachMobile" : ""} ${coachForeignChrome ? "appContent--coachMobileForeign" : ""}`.trim()}
      >
        <Suspense fallback={<div style={{ padding: 24 }}>Зареждане...</div>}>
          <Outlet />
        </Suspense>
      </main>
      {!isImmersiveMode && !hideAppChrome ? (
        <footer className="appFooter">
          <span>Volley Coach Platform</span>
          <span>Българска федерация по волейбол</span>
        </footer>
      ) : null}
    </div>
  );
}
