import { useLocation, useNavigate } from "react-router-dom";

import { coachTabIcon } from "./coachMobileIcons";
import { COACH_MOBILE_TABS } from "../../navigation/navConfig";
import { coachMobileActiveTab } from "../../navigation/coachMobileNav";

export default function CoachBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const active = coachMobileActiveTab(location.pathname);

  return (
    <nav className="coachMobileBottomNav" aria-label="Треньорска навигация">
      {COACH_MOBILE_TABS.map(({ id, path, label, icon }) => {
        const Icon = coachTabIcon(icon);
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            className={`coachMobileBottomNavBtn${isActive ? " is-active" : ""}${id === "bvf" ? " coachMobileBottomNavBtn--bvf" : ""}`}
            onClick={() => navigate(path)}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="coachMobileBottomNavIcon" size={20} />
            <span className="coachMobileBottomNavLabel">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
