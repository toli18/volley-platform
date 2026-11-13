import { useEffect, useState } from "react";

const DEFAULT_VISIBLE_MS = 3400;
const DEFAULT_FADE_MS = 900;

export default function LoginIntro({ visibleMs = DEFAULT_VISIBLE_MS, fadeMs = DEFAULT_FADE_MS }) {
  const [shouldRender, setShouldRender] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!shouldRender) return undefined;
    const leaveTimer = window.setTimeout(() => setLeaving(true), visibleMs);
    const removeTimer = window.setTimeout(() => setShouldRender(false), visibleMs + fadeMs);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(removeTimer);
    };
  }, [shouldRender, visibleMs, fadeMs]);

  if (!shouldRender) return null;

  const handleSkip = () => setLeaving(true);

  return (
    <div
      className={`loginIntro${leaving ? " loginIntro--leaving" : ""}`}
      role="presentation"
      onClick={handleSkip}
      style={leaving ? { animationDuration: `${fadeMs}ms` } : undefined}
    >
      <div className="loginIntroGlow" aria-hidden />
      <img
        src="/bvf-splash.png"
        alt="Българска федерация по волейбол"
        className="loginIntroLogo"
        width={420}
        height={420}
        decoding="async"
        fetchPriority="high"
        onError={(e) => {
          const img = e.currentTarget;
          if (img.dataset.fallback === "1") {
            img.style.visibility = "hidden";
            return;
          }
          img.dataset.fallback = "1";
          img.src = "/bfvb-logo.png";
        }}
      />
    </div>
  );
}
