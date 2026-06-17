import { useEffect, useState } from "react";

const SESSION_KEY = "vp-login-intro-shown";
const VISIBLE_MS = 1800;
const FADE_MS = 600;

export default function LoginIntro() {
  const [shouldRender, setShouldRender] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(SESSION_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!shouldRender) return undefined;
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    const leaveTimer = window.setTimeout(() => setLeaving(true), VISIBLE_MS);
    const removeTimer = window.setTimeout(() => setShouldRender(false), VISIBLE_MS + FADE_MS);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(removeTimer);
    };
  }, [shouldRender]);

  if (!shouldRender) return null;

  const handleSkip = () => setLeaving(true);

  return (
    <div
      className={`loginIntro${leaving ? " loginIntro--leaving" : ""}`}
      role="presentation"
      onClick={handleSkip}
    >
      <div className="loginIntroGlow" aria-hidden />
      <img src="/bvf-splash.png" alt="Българска федерация по волейбол" className="loginIntroLogo" />
    </div>
  );
}
