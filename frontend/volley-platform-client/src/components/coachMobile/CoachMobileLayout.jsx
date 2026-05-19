import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import CoachBottomNav from "./CoachBottomNav";
import { Button } from "../ui";

function titleForPath(pathname) {
  if (pathname.startsWith("/coach/athletes/")) return "Състезател";
  if (pathname.startsWith("/coach/teams/")) return "Отбор";
  if (pathname === "/coach/teams") return "Отбори";
  if (pathname.startsWith("/coach/trainings")) return "Тренировки";
  if (pathname.startsWith("/coach/schedule")) return "График";
  if (pathname.startsWith("/coach/menu")) return "Меню";
  return "Днес";
}

export default function CoachMobileLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const showBack =
    (pathname.startsWith("/coach/teams/") && pathname !== "/coach/teams") || pathname.startsWith("/coach/athletes/");

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="coachMobileShell">
      <header className="coachMobileTopBar">
        {showBack ? (
          <button
            type="button"
            className="coachMobileBackBtn"
            onClick={() => navigate(pathname.startsWith("/coach/athletes/") ? -1 : "/coach/teams")}
            aria-label="Назад"
          >
            ←
          </button>
        ) : (
          <span className="coachMobileTopSpacer" aria-hidden />
        )}
        <h1 className="coachMobileTopTitle">{titleForPath(pathname)}</h1>
        <Button type="button" variant="secondary" size="sm" onClick={handleLogout}>
          Изход
        </Button>
      </header>
      <main className="coachMobileMain">
        <Outlet />
      </main>
      <CoachBottomNav />
    </div>
  );
}
