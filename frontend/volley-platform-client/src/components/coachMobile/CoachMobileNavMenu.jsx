import { useState } from "react";
import { useNavigate } from "react-router-dom";

import useNavRoles from "../../navigation/useNavRoles";
import useNavbarFeed from "../../hooks/useNavbarFeed";
import MobileNavDrawer from "../shell/MobileNavDrawer";

export default function CoachMobileNavMenu({ className = "coachMobileMenuBtn" }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user, logout, isCoachUser, isHeadCoachUser } = useNavRoles();
  const feed = useNavbarFeed();

  const userLabel = user?.email || user?.username || "Потребител";
  const roleLabel = user?.role ? String(user.role) : "guest";

  const onLogout = () => {
    logout();
    navigate("/login");
  };

  const feedProps = {
    unifiedFeedItems: feed.unifiedFeedItems,
    markFeeItemSeen: feed.markFeeItemSeen,
    markTaskItemSeen: feed.markTaskItemSeen,
    markSekItemSeen: feed.markSekItemSeen,
    markEnrollmentItemSeen: feed.markEnrollmentItemSeen,
    markAllClubFeedSeen: feed.markAllClubFeedSeen,
    markForumItemRead: feed.markForumItemRead,
    markAllForumRead: feed.markAllForumRead,
  };

  return (
    <>
      <button
        type="button"
        className={className}
        aria-label="Пълно меню"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="coachMobileBurger" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </button>
      <MobileNavDrawer
        open={open}
        onClose={() => setOpen(false)}
        user={user}
        userLabel={userLabel}
        roleLabel={roleLabel}
        isCoachUser={isCoachUser}
        isHeadCoachUser={isHeadCoachUser}
        newTaskCount={feed.newTaskCount}
        combinedUnreadCount={feed.combinedUnreadCount}
        onLogout={onLogout}
        feedProps={feedProps}
      />
    </>
  );
}
