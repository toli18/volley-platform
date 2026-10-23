import { Link } from "react-router-dom";
import BrandTriLine from "../components/shared/BrandTriLine";
import PlatformBrandTitle from "../components/shared/PlatformBrandTitle";

/**
 * Entry screen for the Capacitor mobile shell (and a normal web URL /app).
 * Existing /parent/login and /room/login links stay unchanged.
 */
export default function MobileAppLanding() {
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
            <div className="parentPortalBrandSub">Мобилен вход за родители и състезатели</div>
            <BrandTriLine className="brandTriLine--portal" />
          </div>
        </div>
      </header>

      <main className="parentPortalMain" style={{ maxWidth: 440, margin: "0 auto", padding: "28px 16px 40px" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
          Изберете вход
        </h1>
        <p style={{ margin: "0 0 20px", color: "#475569", lineHeight: 1.45, fontSize: 15 }}>
          Родителски портал или стая за състезатели. Същите данни както в уеб линка.
        </p>

        <div style={{ display: "grid", gap: 12 }}>
          <Link
            to="/parent/login"
            className="uiBtn uiBtn--primary"
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
          Volley Coach BUL — за всички клубове в платформата. Треньорският и админ порталът остават
          през обичайния уеб адрес; това приложение е само за родители и състезатели.
        </p>
      </main>

      <footer className="parentPortalFooter">
        <span>Българска федерация по волейбол</span>
      </footer>
    </div>
  );
}
