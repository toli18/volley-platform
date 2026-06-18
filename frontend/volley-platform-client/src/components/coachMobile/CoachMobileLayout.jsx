import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import useIsCoachMobileShell from "../../hooks/useIsCoachMobileShell";
import PlatformBrandBlock from "../shared/PlatformBrandBlock";
import CoachBottomNav from "./CoachBottomNav";
import CoachMobileNavMenu from "./CoachMobileNavMenu";
import { Button } from "../ui";

export default function CoachMobileLayout() {
  const isMobileShell = useIsCoachMobileShell();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const role = String(user?.role || "").toLowerCase();
  const brandSubtitle = role === "club_head_coach" ? "Главен треньор" : "Треньорски профил";
  const isAttendanceHub = pathname === "/coach/attendance";
  const isAttendanceMonth = pathname.includes("/attendance-month");
  const isFeesPage = pathname.startsWith("/coach/fees");
  const isChatRoom = pathname.startsWith("/coach/chat/") && pathname !== "/coach/chat";
  const showBack =
    isFeesPage ||
    isAttendanceHub ||
    isAttendanceMonth ||
    isChatRoom ||
    (pathname.startsWith("/coach/teams/") && pathname !== "/coach/teams");

  const handleBack = () => {
    if (isFeesPage) {
      navigate("/coach/club");
      return;
    }
    if (isChatRoom) {
      navigate("/coach/chat");
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

  if (!isMobileShell) {
    return <Outlet />;
  }

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
          <CoachMobileNavMenu />
        )}
        <PlatformBrandBlock subtitle={brandSubtitle} className="coachMobileTopBrand" />
        <div className="coachMobileTopActions">
          {showBack ? <CoachMobileNavMenu className="coachMobileMenuBtn coachMobileMenuBtn--compact" /> : null}
          <Button type="button" variant="secondary" size="sm" onClick={handleLogout}>
            Изход
          </Button>
        </div>
      </header>
      <main className="coachMobileMain">
        <Outlet />
      </main>
      <CoachBottomNav />
    </div>
  );
}
