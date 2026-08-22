import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import useNavbarFeed from "../../hooks/useNavbarFeed";
import { NavIconBell } from "../../navigation/navIcons";
import NotificationPanel from "../shell/NotificationPanel";
import { Modal } from "../ui";

export default function CoachMobileNotificationBell({ className = "coachMobileBellBtn" }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const feed = useNavbarFeed();
  const count = feed.combinedUnreadCount || 0;

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={count ? `Известия (${count})` : "Известия"}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <NavIconBell size={20} />
        {count > 0 ? (
          <span className="coachMobileBellBadge" aria-hidden>
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Известия"
        size="compact"
        className="coachMobileNotifModal"
      >
        <NotificationPanel
          embedded
          unifiedFeedItems={feed.unifiedFeedItems}
          isHeadCoachUser={feed.isHeadCoachUser}
          isPlatformAdmin={feed.isPlatformAdmin}
          markFeeItemSeen={feed.markFeeItemSeen}
          markTaskItemSeen={feed.markTaskItemSeen}
          markSekItemSeen={feed.markSekItemSeen}
          markEnrollmentItemSeen={feed.markEnrollmentItemSeen}
          markAllClubFeedSeen={feed.markAllClubFeedSeen}
          markForumItemRead={feed.markForumItemRead}
          markAllForumRead={feed.markAllForumRead}
          markPilotItemSeen={feed.markPilotItemSeen}
          markAllPilotSeen={feed.markAllPilotSeen}
          onClose={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
