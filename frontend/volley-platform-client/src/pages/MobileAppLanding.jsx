import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import BrandTriLine from "../components/shared/BrandTriLine";
import PlatformBrandTitle from "../components/shared/PlatformBrandTitle";
import { getToken } from "../utils/auth";
import { getParentToken } from "../utils/parentAuth";
import { getTeamRoomToken } from "../utils/teamRoomAuth";
import { resolveResumePath } from "../utils/portalSession";

/**
 * Entry screen for the Capacitor mobile shell (and a normal web URL /app).
 * If a session already exists on this device, reopen that portal immediately.
 */
export default function MobileAppLanding() {
  const [resumeTo, setResumeTo] = useState(undefined);

  useEffect(() => {
    const path = resolveResumePath({
      getToken,
      getParentToken,
      getTeamRoomToken,
    });
    setResumeTo(path);
  }, []);

  if (resumeTo === undefined) {
    return (
      <div className="parentPortalShell">
        <main className="parentPortalMain" style={{ padding: 28, textAlign: "center", color: "#64748b" }}>
          Зареждане…
        </main>
      </div>
    );
  }

  if (resumeTo) {
    return <Navigate to={resumeTo} replace />;
  }

  return (
    <div className="parentPortalShell">
      <header className="parentPortalHeader">
        <div className="parentPortalHeaderInner">
          <img
            src="/bfvb-logo.png"
            alt="БФВ"
            className="parentPortalLogo"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <div>
            <div className="parentPortalBrand">
              <PlatformBrandTitle />
            </div>
            <div className="parentPortalBrandSub">Мобилен вход за треньори, родители и състезатели</div>
            <BrandTriLine className="brandTriLine--portal" />
          </div>
        </div>
      </header>

      <main className="parentPortalMain" style={{ maxWidth: 440, margin: "0 auto", padding: "28px 16px 40px" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
          Изберете вход
        </h1>
        <p style={{ margin: "0 0 20px", color: "#475569", lineHeight: 1.45, fontSize: 15 }}>
          След първия вход акаунтът се запомня на това устройство докато натиснете „Изход“.
        </p>

        <div style={{ display: "grid", gap: 12 }}>
          <Link
            to="/login"
            className="uiBtn uiBtn--primary"
            style={{
              display: "block",
              textAlign: "center",
              textDecoration: "none",
              padding: "16px 18px",
              borderRadius: 12,
              fontWeight: 800,
              fontSize: 16,
              background: "#0b3d91",
              color: "#fff",
            }}
          >
            Вход за треньор
          </Link>
          <Link
            to="/parent/login"
            className="uiBtn"
            style={{
              display: "block",
              textAlign: "center",
              textDecoration: "none",
              padding: "16px 18px",
              borderRadius: 12,
              fontWeight: 800,
              fontSize: 16,
              background: "#16a34a",
              color: "#fff",
            }}
          >
            Вход за родител
          </Link>
          <Link
            to="/room/login"
            className="uiBtn"
            style={{
              display: "block",
              textAlign: "center",
              textDecoration: "none",
              padding: "16px 18px",
              borderRadius: 12,
              fontWeight: 800,
              fontSize: 16,
              background: "#0f172a",
              color: "#fff",
            }}
          >
            Вход за състезател
          </Link>
        </div>

        <p style={{ marginTop: 22, fontSize: 13, color: "#64748b", lineHeight: 1.45 }}>
          Volley Coach BUL — за всички клубове в платформата.
        </p>
      </main>

      <footer className="parentPortalFooter">
        <span>Българска федерация по волейбол</span>
      </footer>
    </div>
  );
}
