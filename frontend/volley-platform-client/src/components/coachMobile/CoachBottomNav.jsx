import { useLocation, useNavigate } from "react-router-dom";

import { IconCalendar, IconHome, IconMenu, IconTeams } from "./coachMobileIcons";

const TABS = [
  { id: "today", path: "/coach/today", label: "Днес", Icon: IconHome },
  { id: "teams", path: "/coach/teams", label: "Отбори", Icon: IconTeams, matchPrefix: "/coach/teams" },
  { id: "schedule", path: "/coach/schedule", label: "График", Icon: IconCalendar },
  { id: "menu", path: "/coach/menu", label: "Меню", Icon: IconMenu },
];

function activeTabForPath(pathname) {
  if (pathname.startsWith("/coach/teams")) return "teams";
  if (pathname.startsWith("/coach/schedule")) return "schedule";
  if (pathname.startsWith("/coach/menu")) return "menu";
  if (pathname.startsWith("/coach/today") || pathname === "/coach") return "today";
  return null;
}

export default function CoachBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const active = activeTabForPath(location.pathname);

  return (
    <nav className="coachMobileBottomNav" aria-label="Треньорска навигация">
      {TABS.map(({ id, path, label, Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            className={`coachMobileBottomNavBtn${isActive ? " is-active" : ""}`}
            onClick={() => navigate(path)}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="coachMobileBottomNavIcon" size={22} />
            <span className="coachMobileBottomNavLabel">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
