import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import useNavRoles from "../../navigation/useNavRoles";
import useNavbarFeed from "../../hooks/useNavbarFeed";
import { NavIconBell, NavIconTasks } from "../../navigation/navIcons";
import DesktopNav from "./DesktopNav";
import MobileNavDrawer from "./MobileNavDrawer";
import NavIconButton from "./NavIconButton";
import NotificationPanel from "./NotificationPanel";
import ProfileMenu from "./ProfileMenu";
import TasksPanel from "./TasksPanel";
import ClubLogo from "../shared/ClubLogo";
import BrandTriLine from "../shared/BrandTriLine";
import PlatformBrandTitle from "../shared/PlatformBrandTitle";
import "./appHeader.css";

export default function AppHeader() {
  const { user, logout } = useNavRoles();
  const navigate = useNavigate();
  const location = useLocation();
  const [logoError, setLogoError] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const feed = useNavbarFeed();
  const { isCoachUser, isHeadCoachUser } = feed;

  const userLabel = useMemo(() => user?.email || user?.username || "Потребител", [user]);
  const roleLabel = useMemo(() => (user?.role ? String(user.role) : "guest"), [user]);

  const closePanels = () => {
    setTasksOpen(false);
    setNotificationsOpen(false);
    setProfileOpen(false);
  };

  const onLogout = () => {
    logout();
    navigate("/login");
  };

  useEffect(() => {
    setMobileNavOpen(false);
    closePanels();
  }, [location.pathname, location.search]);

  useEffect(() => {
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const utilityPanelOpen = tasksOpen || notificationsOpen;

  useEffect(() => {
    if (!utilityPanelOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [utilityPanelOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  const feedProps = {
    unifiedFeedItems: feed.unifiedFeedItems,
    isPlatformAdmin: feed.isPlatformAdmin,
    markFeeItemSeen: feed.markFeeItemSeen,
    markTaskItemSeen: feed.markTaskItemSeen,
    markAllClubFeedSeen: feed.markAllClubFeedSeen,
    markForumItemRead: feed.markForumItemRead,
    markAllForumRead: feed.markAllForumRead,
    markPilotItemSeen: feed.markPilotItemSeen,
    markAllPilotSeen: feed.markAllPilotSeen,
  };

  return (
    <header className="appHeader appHeader--compact">
      <div className="appHeaderInner">
        <Link className="appHeaderBrand" to="/" title="Volley Coach - BUL">
          <span className="appHeaderBrandLogoWrap">
            {!logoError ? (
              <img
                src="/bfvb-logo.png"
                alt="БФВ"
                className="appHeaderBrandLogo"
                onError={() => setLogoError(true)}
              />
            ) : (
              <span className="appHeaderBrandLogoFallback">БФВ</span>
            )}
          </span>
          <span className="appHeaderBrandText">
            <span className="appHeaderBrandTitle">
              <PlatformBrandTitle />
            </span>
            <span className="appHeaderBrandSub">Единна общност на треньорите в България</span>
            <BrandTriLine className="brandTriLine--header" />
          </span>
        </Link>

        {user ? <DesktopNav forumUnreadCount={feed.unreadCount} /> : null}

        <div className="appHeaderUtils">
          {user?.club_logo_url ? (
            <ClubLogo
              logoUrl={user.club_logo_url}
              name={user.club_name}
              className="appHeaderClubLogo"
            />
          ) : null}
          {!user ? (
            <Link className="appHeaderLogin" to="/login">
              Вход
            </Link>
          ) : (
            <>
              {utilityPanelOpen ? (
                <button
                  type="button"
                  className="appHeaderUtilBackdrop"
                  aria-label="Затвори панела"
                  onClick={closePanels}
                />
              ) : null}
              {isCoachUser ? (
                <div className="appHeaderUtilWrap">
                  <NavIconButton
                    label="Задачи"
                    icon={NavIconTasks}
                    count={feed.newTaskCount}
                    active={tasksOpen}
                    onClick={() => {
                      setNotificationsOpen(false);
                      setProfileOpen(false);
                      setTasksOpen((v) => !v);
                    }}
                  />
                  {tasksOpen ? <TasksPanel tasks={feed.tasks} onClose={() => setTasksOpen(false)} /> : null}
                </div>
              ) : null}
              <div className="appHeaderUtilWrap">
                <NavIconButton
                  label="Известия"
                  icon={NavIconBell}
                  count={feed.combinedUnreadCount}
                  active={notificationsOpen}
                  onClick={() => {
                    setTasksOpen(false);
                    setProfileOpen(false);
                    setNotificationsOpen((v) => !v);
                  }}
                />
                {notificationsOpen ? (
                  <NotificationPanel {...feedProps} isHeadCoachUser={isHeadCoachUser} isPlatformAdmin={feed.isPlatformAdmin} onClose={() => setNotificationsOpen(false)} />
                ) : null}
              </div>
              <ProfileMenu
                open={profileOpen}
                onToggle={() => {
                  setTasksOpen(false);
                  setNotificationsOpen(false);
                  setProfileOpen((v) => !v);
                }}
                onClose={() => setProfileOpen(false)}
                onLogout={onLogout}
              />
            </>
          )}

          {user ? (
            <button
              type="button"
              className="navBurger navBurger--compact"
              aria-label={mobileNavOpen ? "Затвори менюто" : "Отвори менюто"}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((v) => !v)}
            >
              <span className="navBurgerLines" aria-hidden>
                <span className="navBurgerBar" />
                <span className="navBurgerBar" />
                <span className="navBurgerBar" />
              </span>
            </button>
          ) : null}
        </div>
      </div>

      {user ? (
        <MobileNavDrawer
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
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
      ) : null}
    </header>
  );
}
