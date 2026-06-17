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
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  const feedProps = {
    unifiedFeedItems: feed.unifiedFeedItems,
    markFeeItemSeen: feed.markFeeItemSeen,
    markTaskItemSeen: feed.markTaskItemSeen,
    markAllClubFeedSeen: feed.markAllClubFeedSeen,
    markForumItemRead: feed.markForumItemRead,
    markAllForumRead: feed.markAllForumRead,
  };

  return (
    <header className="appHeader appHeader--compact">
      <div className="appHeaderInner">
        <Link className="appHeaderBrand" to="/" title="Volley Coach Platform">
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
              <span className="triWhite">Volley</span>
              <span className="triGreen">Coach</span>
            </span>
            <span className="appHeaderBrandSub">Платформа за треньори</span>
          </span>
        </Link>

        <DesktopNav forumUnreadCount={feed.unreadCount} />

        <div className="appHeaderUtils">
          {!user ? (
            <Link className="appHeaderLogin" to="/login">
              Вход
            </Link>
          ) : (
            <>
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
                  <NotificationPanel {...feedProps} isHeadCoachUser={isHeadCoachUser} onClose={() => setNotificationsOpen(false)} />
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
        </div>
      </div>

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
    </header>
  );
}
