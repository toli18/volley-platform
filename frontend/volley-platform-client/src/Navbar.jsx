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
  const [newTaskCount, setNewTaskCount] = useState(0);
  const [tasks, setTasks] = useState([]);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [feeAlerts, setFeeAlerts] = useState([]);
  const [feeUnreadCount, setFeeUnreadCount] = useState(0);
  const [feeAlertsOpen, setFeeAlertsOpen] = useState(false);

  const onLogout = () => {
    logout();
    navigate("/login");
  };

  const userLabel = useMemo(() => user?.email || user?.username || "Потребител", [user]);
  const roleLabel = useMemo(() => (user?.role ? String(user.role) : "guest"), [user]);
  const isAdminUser = Boolean(isAdmin);
  const isCoachUser = user?.role === "coach" || user?.role === "club_head_coach";
  const isHeadCoachUser = user?.role === "club_head_coach";
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

  useEffect(() => {
    if (!isCoachUser || !user) {
      setNewTaskCount(0);
      return;
    }
    let cancelled = false;
    const loadTasks = async () => {
      try {
        const res = await axiosInstance.get(API_PATHS.MY_TRAINING_ASSIGNMENTS);
        if (cancelled) return;
        const items = Array.isArray(res.data) ? res.data : [];
        const fresh = items.filter((x) => String(x?.status || "").toLowerCase() === "new").length;
        setNewTaskCount(fresh);
      } catch {
        if (!cancelled) setNewTaskCount(0);
      }
    };
    loadTasks();
    const timer = window.setInterval(loadTasks, 45000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isCoachUser, user]);

  useEffect(() => {
    if (!isHeadCoachUser || !user) {
      setFeeAlerts([]);
      setFeeUnreadCount(0);
      return;
    }
    const storageKey = `vp-fee-alerts-seen-${user.id}`;
    let cancelled = false;
    const loadFeeAlerts = async () => {
      try {
        const res = await axiosInstance.get(API_PATHS.FEES_PAYMENT_ACTIVITY, { params: { limit: 12 } });
        if (cancelled) return;
        const items = Array.isArray(res.data?.items) ? res.data.items : [];
        setFeeAlerts(items);
        const seen = JSON.parse(localStorage.getItem(storageKey) || "[]");
        const unread = items.filter((x) => !seen.includes(x.id)).length;
        setFeeUnreadCount(unread);
      } catch {
        if (!cancelled) {
          setFeeAlerts([]);
          setFeeUnreadCount(0);
        }
      }
    };
    loadFeeAlerts();
    const timer = window.setInterval(loadFeeAlerts, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isHeadCoachUser, user]);

  useEffect(() => {
    if (!isCoachUser || !user) {
      setTasks([]);
      return;
    }
    let cancelled = false;
    const loadTaskItems = async () => {
      try {
        const res = await axiosInstance.get(API_PATHS.MY_TRAINING_ASSIGNMENTS);
        if (cancelled) return;
        const items = Array.isArray(res.data) ? res.data : [];
        setTasks(items.slice(0, 8));
      } catch {
        if (!cancelled) setTasks([]);
      }
    };
    loadTaskItems();
    const timer = window.setInterval(loadTaskItems, 45000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isCoachUser, user]);

  return (
    <header className="appHeader">
      <div className="accountTopRight">
        {!user ? (
          <Link className="navBtnOutline" to="/login">
            Вход
          </Link>
        ) : (
          <div className="accountArea">
            {isCoachUser && (
              <div style={{ position: "relative" }}>
                <button className="navBtnOutline" onClick={() => setTasksOpen((prev) => !prev)}>
                  Задачи ({newTaskCount})
                </button>
                {tasksOpen && (
                  <div
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "calc(100% + 8px)",
                      width: "min(92vw, 380px)",
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
                      <strong>Task Center</strong>
                      <Link className="navBtnOutline" to="/my-trainings" onClick={() => setTasksOpen(false)}>
                        Отвори всички
                      </Link>
                    </div>
                    {tasks.length === 0 && (
                      <span style={{ color: "#64748b", fontSize: 13 }}>Няма активни задачи.</span>
                    )}
                    {tasks.map((item) => (
                      <Link
                        key={item.id}
                        to="/my-trainings"
                        onClick={() => setTasksOpen(false)}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 8,
                          padding: 8,
                          textDecoration: "none",
                          color: "#0f172a",
                          background: String(item.status || "").toLowerCase() === "new" ? "#f8fbff" : "#fff",
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{item.training_title || `Тренировка #${item.training_id}`}</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: "#475569" }}>
                          Статус: {item.status === "done" ? "Готово" : item.status === "in_progress" ? "В процес" : "Нова"}
                          {item.due_date ? ` • Срок: ${item.due_date}` : ""}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
            {isHeadCoachUser && (
              <div style={{ position: "relative" }}>
                <button className="navBtnOutline" onClick={() => setFeeAlertsOpen((prev) => !prev)}>
                  Такси ({feeUnreadCount})
                </button>
                {feeAlertsOpen && (
                  <div
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "calc(100% + 8px)",
                      width: "min(92vw, 400px)",
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
                      <strong>Платени такси (клуб)</strong>
                      <button
                        className="navBtnOutline"
                        onClick={() => {
                          const key = `vp-fee-alerts-seen-${user.id}`;
                          localStorage.setItem(key, JSON.stringify(feeAlerts.map((x) => x.id)));
                          setFeeUnreadCount(0);
                        }}
                      >
                        Маркирай прочетени
                      </button>
                    </div>
                    {feeAlerts.length === 0 && (
                      <span style={{ color: "#64748b", fontSize: 13 }}>Няма нови плащания.</span>
                    )}
                    {feeAlerts.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 8,
                          padding: 8,
                          background: "#f8fbff",
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{item.athlete_name}</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: "#475569" }}>
                          {item.month_key} • {Number(item.amount || 0).toFixed(2)} лв. • от {item.coach_name}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
            {isCoachUser && (
              <Link className="appNavLink" to="/my-trainings">
                Моите тренировки{newTaskCount > 0 ? ` (${newTaskCount})` : ""}
              </Link>
            )}
            {isCoachUser && (
              <Link className="appNavLink" to="/my-drills">
                Моите упражнения
              </Link>
            )}
            <Link className="appNavLink" to="/forum">
              Форум
            </Link>
            {isCoachUser && (
              <Link className="appNavLink" to="/monthly-fees">
                Месечни Такси
              </Link>
            )}
            {isCoachUser && (
              <Link className="appNavLink" to="/teams">
                Отбори
              </Link>
            )}
            {isHeadCoachUser && (
              <Link className="appNavLink" to="/club-head">
                Главен треньор
              </Link>
            )}
            <Link className="appNavLink" to="/articles">
              Статии
            </Link>
            {isCoachUser && (
              <Link className="appNavLink" to="/articles/my">
                Моите статии
              </Link>
            )}
            <Link className="appNavLink" to="/generator">
              Генератор
            </Link>
            {isCoachUser && (
              <Link className="appNavLink" to="/ai-generator">
                AI Генератор
              </Link>
            )}
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
