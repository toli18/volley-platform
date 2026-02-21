// src/Navbar.jsx
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth/AuthContext";
import axiosInstance from "./utils/apiClient";
import { API_PATHS } from "./utils/apiPaths";

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [logoError, setLogoError] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const onLogout = () => {
    logout();
    navigate("/login");
  };

  const userLabel = useMemo(() => user?.email || user?.username || "Потребител", [user]);
  const roleLabel = useMemo(() => (user?.role ? String(user.role) : "guest"), [user]);
  const isAdminUser = Boolean(isAdmin);
  const isCoachUser = user?.role === "coach";
  const isPlatformAdmin = user?.role === "platform_admin";

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    const loadNotifications = async () => {
      try {
        const res = await axiosInstance.get(API_PATHS.FORUM_NOTIFICATIONS, { params: { limit: 8 } });
        if (cancelled) return;
        setNotifications(Array.isArray(res.data?.items) ? res.data.items : []);
        setUnreadCount(Number(res.data?.unread_count) || 0);
      } catch {
        if (cancelled) return;
        setNotifications([]);
        setUnreadCount(0);
      }
    };
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 45000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user]);

  return (
    <header className="appHeader">
      <div className="accountTopRight">
        {!user ? (
          <Link className="navBtnOutline" to="/login">
            Вход
          </Link>
        ) : (
          <div className="accountArea">
            <div style={{ position: "relative" }}>
              <button className="navBtnOutline" onClick={() => setNotificationsOpen((prev) => !prev)}>
                Известия ({unreadCount})
              </button>
              {notificationsOpen && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 8px)",
                    width: "min(92vw, 360px)",
                    background: "#fff",
                    border: "1px solid #dbe5f2",
                    borderRadius: 12,
                    boxShadow: "0 8px 28px rgba(15, 23, 42, 0.14)",
                    padding: 10,
                    zIndex: 9999,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <strong>Форум известия</strong>
                    <button
                      className="navBtnOutline"
                      onClick={async () => {
                        try {
                          await axiosInstance.post(API_PATHS.FORUM_NOTIFICATIONS_READ_ALL);
                          setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
                          setUnreadCount(0);
                        } catch {
                          // ignore
                        }
                      }}
                    >
                      Прочети всички
                    </button>
                  </div>
                  {notifications.length === 0 && (
                    <span style={{ color: "#64748b", fontSize: 13 }}>Няма нови известия.</span>
                  )}
                  {notifications.map((item) => (
                    <Link
                      key={item.id}
                      to={`/forum/${item.post_id}`}
                      onClick={async () => {
                        try {
                          if (!item.is_read) {
                            await axiosInstance.post(API_PATHS.FORUM_NOTIFICATION_READ(item.id));
                          }
                        } catch {
                          // ignore
                        } finally {
                          setNotificationsOpen(false);
                          setNotifications((prev) =>
                            prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
                          );
                          setUnreadCount((prev) => Math.max(0, prev - (item.is_read ? 0 : 1)));
                        }
                      }}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        padding: 8,
                        textDecoration: "none",
                        color: item.is_read ? "#64748b" : "#0f172a",
                        background: item.is_read ? "#fff" : "#f8fbff",
                        fontWeight: item.is_read ? 500 : 700,
                      }}
                    >
                      <div>{item.message}</div>
                      <div style={{ marginTop: 4, fontSize: 12 }}>
                        {new Date(item.created_at || "").toLocaleString("bg-BG")}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div className="accountMeta">
              <span className="accountUser">{userLabel}</span>
              <span className="accountRole">{roleLabel}</span>
            </div>
            <button className="navBtnOutline" onClick={onLogout}>
              Изход
            </button>
          </div>
        )}
      </div>

      <div className="appHeaderTop">
        <Link className="logoLink logoLeft" to="/" title="Българска федерация по волейбол">
          {!logoError ? (
            <img
              src="/bfvb-logo.png"
              alt="Българска федерация по волейбол"
              className="brandLogo"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="brandLogoFallback">БФВ</div>
          )}
        </Link>

        <Link className="brand" to="/" title="Volley Coach Platform">
          <div className="brandText">
            <div className="brandTitle brandTitleTri">
              <span className="triWhite">Volley</span>
              <span className="triGreen">Coach</span>
              <span className="triRed">Platform</span>
            </div>
            <div className="brandSubtitle brandSubtitleTri">
              <span className="triWhite">Единна платформа</span>
              <span className="triGreen">за волейболните треньори</span>
              <span className="triRed">в България</span>
            </div>
          </div>
        </Link>
      </div>

      <nav className="appNav">
        <Link className="appNavLink" to="/drills">
          Упражнения
        </Link>

        {user && (
          <>
            <Link className="appNavLink" to="/my-trainings">
              Моите тренировки
            </Link>
            <Link className="appNavLink" to="/my-drills">
              Моите упражнения
            </Link>
            <Link className="appNavLink" to="/forum">
              Форум
            </Link>
            <Link className="appNavLink" to="/monthly-fees">
              Месечни Такси
            </Link>
            <Link className="appNavLink" to="/articles">
              Статии
            </Link>
            {isCoachUser && (
              <Link className="appNavLink" to="/articles/new">
                Нова статия
              </Link>
            )}
            <Link className="appNavLink" to="/generator">
              Генератор
            </Link>
            <Link className="appNavLink" to="/ai-generator">
              AI Генератор
            </Link>
          </>
        )}
        {!user && (
          <Link className="appNavLink" to="/generator">
            Генератор
          </Link>
        )}

        {isAdminUser && (
          <>
            <span className="appNavDivider" />
            <Link className="appNavLink" to="/admin">
              Админ
            </Link>
            <Link className="appNavLink" to="/admin/drills">
              Всички упражнения
            </Link>
            <Link className="appNavLink" to="/admin/coaches">
              Треньори
            </Link>
            <Link className="appNavLink" to="/admin/clubs">
              Клубове
            </Link>
            <Link className="appNavLink" to="/admin/pending">
              Чакащи упражнения
            </Link>
            {isPlatformAdmin && (
              <Link className="appNavLink" to="/admin/articles/pending">
                Чакащи статии
              </Link>
            )}
            {isPlatformAdmin && (
              <Link className="appNavLink" to="/admin/articles">
                Всички статии
              </Link>
            )}
          </>
        )}
      </nav>
    </header>
  );
}
