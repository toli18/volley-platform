import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import useIsCoachMobileShell from "../../hooks/useIsCoachMobileShell";
import ClubLogo from "../shared/ClubLogo";
import CoachBottomNav from "./CoachBottomNav";
import CoachMobileHeaderBrand from "./CoachMobileHeaderBrand";
import CoachMobileNotificationBell from "./CoachMobileNotificationBell";

export default function CoachMobileLayout() {
  const isMobileShell = useIsCoachMobileShell();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = String(user?.role || "").toLowerCase();
  const brandSubtitle = role === "club_head_coach" ? "Главен треньор" : "Треньорски профил";
  const isAttendanceHub = pathname === "/coach/attendance";
  const isAttendanceMonth = pathname.includes("/attendance-month");
  const isGroupWorkHub = pathname === "/coach/group-work";
  const isProgramWeek = pathname.startsWith("/coach/program-week");
  const isAssessment = pathname.startsWith("/coach/assessment");
  const isEnrollments = pathname.startsWith("/coach/enrollments");
  const isClubProfile = pathname.startsWith("/coach/club-profile");
  const isClubDocuments = pathname.startsWith("/coach/documents");
  const isClubAdmin = pathname === "/coach/club-admin";
  const isCardIndexes = pathname.startsWith("/coach/bvf-card-indexes");
  const isBvfAdmin = pathname.startsWith("/coach/bvf-admin");
  const isFeesPage = pathname.startsWith("/coach/fees");
  const isChatRoom = pathname.startsWith("/coach/chat/") && pathname !== "/coach/chat";
  const isMatchLive = /\/matches\/[^/]+\/live(?:\/|$)/.test(pathname);
  const showBack =
    isFeesPage ||
    isAttendanceHub ||
    isAttendanceMonth ||
    isGroupWorkHub ||
    isProgramWeek ||
    isAssessment ||
    isEnrollments ||
    isClubProfile ||
    isClubDocuments ||
    isClubAdmin ||
    isCardIndexes ||
    isBvfAdmin ||
    isChatRoom ||
    (pathname.startsWith("/coach/teams/") && pathname !== "/coach/teams" && !isMatchLive);

  const handleBack = () => {
    if (isClubAdmin || isFeesPage || isEnrollments || isGroupWorkHub) {
      navigate("/coach/club");
      return;
    }
    if (/^\/coach\/bvf-card-indexes\/[^/]+/.test(pathname)) {
      navigate("/coach/bvf-card-indexes");
      return;
    }
    if (isClubProfile || isClubDocuments || isCardIndexes || isBvfAdmin) {
      navigate(role === "club_head_coach" ? "/coach/club-admin" : "/coach/club");
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
    if (isAssessment && pathname !== "/coach/assessment") {
      navigate("/coach/assessment");
      return;
    }
    if (isAttendanceHub || isProgramWeek || isAssessment) {
      navigate("/coach/group-work");
      return;
    }
    navigate("/coach/teams");
  };

  if (!isMobileShell) {
    return <Outlet />;
  }

  return (
    <div className={`coachMobileShell${isMatchLive ? " coachMobileShell--matchLive" : ""}`}>
      {!isMatchLive ? (
      <header
        className={`coachMobileTopBar portalShellHeader${showBack ? "" : " coachMobileTopBar--root"}`}
      >
        {showBack ? (
          <button
            type="button"
            className="coachMobileBackBtn"
            onClick={handleBack}
            aria-label="Назад"
          >
            ←
          </button>
        ) : null}
        <CoachMobileHeaderBrand subtitle={brandSubtitle} />
        <div className="coachMobileTopActions">
          <CoachMobileNotificationBell />
          {user?.club_logo_url ? (
            <ClubLogo
              logoUrl={user.club_logo_url}
              name={user.club_name}
              className="portalHeaderClubLogo"
              to="/coach/club-profile"
              title="Профил на клуба"
            />
          ) : null}
        </div>
      </header>
      ) : null}
      <main className="coachMobileMain">
        <Outlet />
      </main>
      {!isMatchLive ? <CoachBottomNav /> : null}
    </div>
  );
}
