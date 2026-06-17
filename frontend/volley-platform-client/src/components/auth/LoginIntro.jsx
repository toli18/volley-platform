import { useEffect, useState } from "react";

const VISIBLE_MS = 3400;
const FADE_MS = 900;

export default function LoginIntro() {
  const [shouldRender, setShouldRender] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!shouldRender) return undefined;
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
