import { useLocation, useNavigate } from "react-router-dom";

import { coachForeignBackTarget, coachForeignPageTitle } from "../../navigation/coachMobileChrome";
import CoachBottomNav from "./CoachBottomNav";
import CoachMobileNotificationBell from "./CoachMobileNotificationBell";

export default function CoachMobileForeignChrome() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const title = coachForeignPageTitle(pathname);
  const backTo = coachForeignBackTarget(pathname);

  return (
    <>
      <header className="coachMobileTopBar coachMobileTopBar--foreign portalShellHeader">
        <button
          type="button"
          className="coachMobileBackBtn"
          onClick={() => navigate(backTo)}
          aria-label="Назад"
        >
          ←
        </button>
        <p className="coachMobileForeignTitle">{title}</p>
        <div className="coachMobileTopActions">
          <CoachMobileNotificationBell />
        </div>
      </header>
      <CoachBottomNav />
    </>
  );
}
