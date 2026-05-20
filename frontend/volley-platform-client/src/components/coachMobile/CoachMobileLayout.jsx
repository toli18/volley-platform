import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import PlatformBrandBlock from "../shared/PlatformBrandBlock";
import CoachBottomNav from "./CoachBottomNav";
import { Button } from "../ui";

export default function CoachMobileLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const role = String(user?.role || "").toLowerCase();
  const brandSubtitle = role === "club_head_coach" ? "Главен треньор" : "Треньорски профил";
  const isAttendanceHub = pathname === "/coach/attendance";
  const isAttendanceMonth = pathname.includes("/attendance-month");
  const showBack =
    isAttendanceHub ||
    isAttendanceMonth ||
    (pathname.startsWith("/coach/teams/") && pathname !== "/coach/teams") ||
    pathname.startsWith("/coach/athletes/");

  const handleBack = () => {
    if (pathname.startsWith("/coach/athletes/")) {
      navigate(-1);
      return;
    }
    if (isAttendanceMonth) {
      navigate("/coach/attendance");
      return;
    }
    if (isAttendanceHub) {
      navigate("/coach/today");
      return;
    }
    navigate("/coach/teams");
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="coachMobileShell">
      <header className="coachMobileTopBar portalShellHeader">
        {showBack ? (
          <button
            type="button"
            className="coachMobileBackBtn"
            onClick={handleBack}
            aria-label="Назад"
          >
            ←
          </button>
        ) : (
          <span className="coachMobileTopSpacer" aria-hidden />
        )}
        <PlatformBrandBlock subtitle={brandSubtitle} className="coachMobileTopBrand" />
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
