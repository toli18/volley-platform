// src/App.jsx
import { Suspense, useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import CoachMobileForeignChrome from "./components/coachMobile/CoachMobileForeignChrome";
import useCoachMobileForeignChrome from "./hooks/useCoachMobileForeignChrome";
import useIsCoachMobileShell from "./hooks/useIsCoachMobileShell";
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
      path.startsWith("/room/") ||
      path.startsWith("/watch/")
    );
  }, [location.pathname]);

  const isWatchBoard = useMemo(() => {
    const path = location.pathname || "";
    return path.startsWith("/watch/");
  }, [location.pathname]);

  const coachMobileShell = useIsCoachMobileShell();
  const coachForeignChrome = useCoachMobileForeignChrome(location.pathname, location.search);

  const hideAppChrome = isPublicPortal || coachMobileShell || coachForeignChrome;
  const shellClass = isWatchBoard
    ? "appShell--watch"
    : isPublicPortal
    ? "appShell--parentPortal"
    : coachMobileShell
      ? "appShell--coachMobile"
      : coachForeignChrome
        ? "appShell--coachMobileForeign"
        : "";

  return (
    <div className={`appShell bfvTheme ${shellClass}`.trim()}>
      {!isImmersiveMode && !hideAppChrome && !isWatchBoard ? <Navbar /> : null}
      {coachForeignChrome ? <CoachMobileForeignChrome /> : null}
      <main
        className={`appContent ${isImmersiveMode ? "appContent--immersive" : ""} ${isPublicPortal ? "appContent--parentPortal" : ""} ${isWatchBoard ? "appContent--watch" : ""} ${coachMobileShell ? "appContent--coachMobile" : ""} ${coachForeignChrome ? "appContent--coachMobileForeign" : ""}`.trim()}
      >
        <Suspense fallback={<div style={{ padding: 24 }}>Зареждане...</div>}>
          <Outlet />
        </Suspense>
      </main>
      {!isImmersiveMode && !hideAppChrome && !isWatchBoard ? (
        <footer className="appFooter">
          <span>Volley Coach Platform</span>
          <span>Българска федерация по волейбол</span>
        </footer>
      ) : null}
    </div>
  );
}
