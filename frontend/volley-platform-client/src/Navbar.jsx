// src/Navbar.jsx
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "./auth/AuthContext";
import axiosInstance from "./utils/apiClient";
import { API_PATHS } from "./utils/apiPaths";
import { formatMoney } from "./utils/currency";

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [logoError, setLogoError] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [newTaskCount, setNewTaskCount] = useState(0);
  const [tasks, setTasks] = useState([]);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [feeAlerts, setFeeAlerts] = useState([]);
  const [feeUnreadCount, setFeeUnreadCount] = useState(0);
  const [taskReports, setTaskReports] = useState([]);
  const [taskReportsUnread, setTaskReportsUnread] = useState(0);
  const [clubSeenTick, setClubSeenTick] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileNotifOpen, setMobileNotifOpen] = useState(false);

  const closeMobileNav = () => setMobileNavOpen(false);

  const onLogout = () => {
    logout();
    navigate("/login");
  };

  const userLabel = useMemo(() => user?.email || user?.username || "Потребител", [user]);
  const roleLabel = useMemo(() => (user?.role ? String(user.role) : "guest"), [user]);
  const isAdminUser = Boolean(isAdmin);
  const userRoleNorm = useMemo(() => {
    const r = user?.role;
    if (r == null || r === undefined) return "";
    if (typeof r === "object" && r !== null && "value" in r) return String(r.value).toLowerCase();
    return String(r).toLowerCase();
  }, [user?.role]);
  const isCoachUser = userRoleNorm === "coach" || userRoleNorm === "club_head_coach";
  const isHeadCoachUser = userRoleNorm === "club_head_coach";
  const isPlatformAdmin = user?.role === "platform_admin";

  useEffect(() => {
    setMobileNavOpen(false);
    setMobileNotifOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) setMobileNotifOpen(false);
  }, [mobileNavOpen]);

  const combinedUnreadCount = useMemo(() => {
    let n = Number(unreadCount) || 0;
    if (isHeadCoachUser) {
      n += Number(feeUnreadCount) || 0;
      n += Number(taskReportsUnread) || 0;
    }
    return n;
  }, [unreadCount, feeUnreadCount, taskReportsUnread, isHeadCoachUser]);

  const unifiedFeedItems = useMemo(() => {
    let feeSeen = new Set();
    let taskSeen = new Set();
    if (isHeadCoachUser && user?.id) {
      try {
        feeSeen = new Set(JSON.parse(localStorage.getItem(`vp-fee-alerts-seen-${user.id}`) || "[]"));
      } catch {
        feeSeen = new Set();
      }
      try {
        taskSeen = new Set(JSON.parse(localStorage.getItem(`vp-task-reports-seen-${user.id}`) || "[]"));
      } catch {
        taskSeen = new Set();
      }
    }
    const out = [];
    (notifications || []).forEach((n) => {
      out.push({
        kind: "forum",
        key: `forum-${n.id}`,
        ts: n.created_at,
        unread: !n.is_read,
        forum: n,
      });
    });
    if (isHeadCoachUser) {
      (feeAlerts || []).forEach((f) => {
        out.push({
          kind: "fee",
          key: `fee-${f.id}`,
          ts: f.paid_at,
          unread: !feeSeen.has(f.id),
          fee: f,
        });
      });
      (taskReports || []).forEach((t) => {
        out.push({
          kind: "task",
          key: `task-${t.id}`,
          ts: t.updated_at,
          unread: !taskSeen.has(t.id),
          task: t,
        });
      });
    }
    out.sort((a, b) => {
      const da = new Date(a.ts || 0).getTime();
      const db = new Date(b.ts || 0).getTime();
      return db - da;
    });
    return out.slice(0, 28);
  }, [notifications, feeAlerts, taskReports, isHeadCoachUser, user, clubSeenTick]);

  const markFeeItemSeen = (paymentId) => {
    if (!user?.id) return;
    const key = `vp-fee-alerts-seen-${user.id}`;
    try {
      const arr = JSON.parse(localStorage.getItem(key) || "[]");
      const next = Array.from(new Set([...arr.map(Number), Number(paymentId)]));
      localStorage.setItem(key, JSON.stringify(next));
      const unread = feeAlerts.filter((x) => !next.includes(Number(x.id))).length;
      setFeeUnreadCount(unread);
      setClubSeenTick((x) => x + 1);
    } catch {
      // ignore
    }
  };

  const markTaskItemSeen = (assignmentId) => {
    if (!user?.id) return;
    const key = `vp-task-reports-seen-${user.id}`;
    try {
      const arr = JSON.parse(localStorage.getItem(key) || "[]");
      const next = Array.from(new Set([...arr.map(Number), Number(assignmentId)]));
      localStorage.setItem(key, JSON.stringify(next));
      const unread = taskReports.filter((x) => !next.includes(Number(x.id))).length;
      setTaskReportsUnread(unread);
      setClubSeenTick((x) => x + 1);
    } catch {
      // ignore
    }
  };

  const markAllClubFeedSeen = () => {
    if (!user?.id) return;
    const feeKey = `vp-fee-alerts-seen-${user.id}`;
    const taskKey = `vp-task-reports-seen-${user.id}`;
    try {
      localStorage.setItem(feeKey, JSON.stringify(feeAlerts.map((x) => x.id)));
      localStorage.setItem(taskKey, JSON.stringify(taskReports.map((x) => x.id)));
      setFeeUnreadCount(0);
      setTaskReportsUnread(0);
      setClubSeenTick((x) => x + 1);
    } catch {
      // ignore
    }
  };

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
        const [trainRes, methodRes] = await Promise.all([
          axiosInstance.get(API_PATHS.MY_TRAINING_ASSIGNMENTS),
          axiosInstance.get(API_PATHS.MY_METHOD_ASSIGNMENTS).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        const items = [
          ...(Array.isArray(trainRes.data) ? trainRes.data : []),
          ...(Array.isArray(methodRes.data) ? methodRes.data : []),
        ];
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
        const unread = items.filter((x) => !seen.includes(Number(x.id))).length;
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
    if (!isHeadCoachUser || !user) {
      setTaskReports([]);
      setTaskReportsUnread(0);
      return;
    }
    const storageKey = `vp-task-reports-seen-${user.id}`;
    let cancelled = false;
    const loadTaskReports = async () => {
      try {
        const res = await axiosInstance.get(API_PATHS.CLUB_TRAINING_ASSIGNMENTS_ACTIVITY, { params: { limit: 24 } });
        if (cancelled) return;
        const items = Array.isArray(res.data?.items) ? res.data.items : [];
        setTaskReports(items);
        const seen = JSON.parse(localStorage.getItem(storageKey) || "[]");
        const unread = items.filter((x) => !seen.includes(Number(x.id))).length;
        setTaskReportsUnread(unread);
      } catch {
        if (!cancelled) {
          setTaskReports([]);
          setTaskReportsUnread(0);
        }
      }
    };
    loadTaskReports();
    const timer = window.setInterval(loadTaskReports, 30000);
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
        const [trainRes, methodRes] = await Promise.all([
          axiosInstance.get(API_PATHS.MY_TRAINING_ASSIGNMENTS),
          axiosInstance.get(API_PATHS.MY_METHOD_ASSIGNMENTS).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        const items = [
          ...(Array.isArray(trainRes.data) ? trainRes.data : []),
          ...(Array.isArray(methodRes.data) ? methodRes.data : []),
        ];
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

  const mainNavItems = useMemo(() => {
    const items = [];
    if (!user) {
      items.push({ to: "/", label: "Начало" });
      items.push({ to: "/drills", label: "Упражнения" });
      items.push({ to: "/generator", label: "Генератор" });
      return items;
    }
    if (isCoachUser) {
      items.push({ to: "/", label: "Начало" });
      items.push({ to: "/method-guidelines", label: "Методически насоки" });
      items.push({ to: "/national-library", label: "Цикли БФВ" });
      items.push({ to: "/ai-generator", label: "AI Помощник" });
      items.push({ to: "/teams", label: "Отбори" });
      items.push({ to: "/monthly-fees", label: "Месечни Такси" });
      items.push({ to: "/articles", label: "Статии" });
      items.push({ to: "/forum", label: "Форум" });
      return items;
    }
    items.push({ to: "/drills", label: "Упражнения" });
    items.push({ to: "/forum", label: "Форум" });
    if (isHeadCoachUser) {
      items.push({ to: "/club-head", label: "Главен треньор" });
    }
    items.push({ to: "/articles", label: "Статии" });
    items.push({ to: "/generator", label: "Генератор" });
    return items;
  }, [user, isCoachUser, isHeadCoachUser]);

  const adminNavItems = useMemo(() => {
    if (!isAdminUser) return [];
    const items = [
      { to: "/admin", label: "Админ" },
      { to: "/admin/drills", label: "Всички упражнения" },
      { to: "/admin/coaches", label: "Треньори" },
      { to: "/admin/clubs", label: "Клубове" },
      { to: "/admin/national-library", label: "Библиотека БФВ" },
      { to: "/admin/pending", label: "Чакащи упражнения" },
    ];
    if (isPlatformAdmin) {
      items.push({ to: "/admin/articles/pending", label: "Чакащи статии" });
      items.push({ to: "/admin/articles", label: "Всички статии" });
    }
    return items;
  }, [isAdminUser, isPlatformAdmin]);

  const renderUnifiedNotificationRows = useCallback(
    (onPanelClose) =>
      unifiedFeedItems.map((row) => {
        if (row.kind === "forum") {
          const item = row.forum;
          return (
            <Link
              key={row.key}
              to={`/forum/${item.post_id}`}
              onClick={async () => {
                try {
                  if (!item.is_read) {
                    await axiosInstance.post(API_PATHS.FORUM_NOTIFICATION_READ(item.id));
                  }
                } catch {
                  // ignore
                } finally {
                  onPanelClose?.();
                  setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
                  setUnreadCount((prev) => Math.max(0, prev - (item.is_read ? 0 : 1)));
                }
              }}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: 8,
                textDecoration: "none",
                color: row.unread ? "#0f172a" : "#64748b",
                background: row.unread ? "#f8fbff" : "#fff",
                fontWeight: row.unread ? 700 : 500,
              }}
            >
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Форум</div>
              <div>{item.message}</div>
              <div style={{ marginTop: 4, fontSize: 12 }}>{new Date(item.created_at || "").toLocaleString("bg-BG")}</div>
            </Link>
          );
        }
        if (row.kind === "fee") {
          const item = row.fee;
          return (
            <Link
              key={row.key}
              to={`/monthly-fees?athlete_id=${item.athlete_id}`}
              onClick={() => {
                markFeeItemSeen(item.id);
                onPanelClose?.();
              }}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: 8,
                textDecoration: "none",
                color: row.unread ? "#0f172a" : "#64748b",
                background: row.unread ? "#f0fdf4" : "#fff",
                fontWeight: row.unread ? 700 : 500,
              }}
            >
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Такса (клуб)</div>
              <div style={{ fontWeight: 700 }}>{item.athlete_name}</div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#475569" }}>
                {item.month_key} • {formatMoney(item.amount)} • от {item.coach_name}
              </div>
              <div style={{ marginTop: 4, fontSize: 12 }}>{item.paid_at ? new Date(item.paid_at).toLocaleString("bg-BG") : "—"}</div>
            </Link>
          );
        }
        const item = row.task;
        return (
          <Link
            key={row.key}
            to={`/trainings/${item.training_id}?assignment=${item.id}`}
            onClick={() => {
              markTaskItemSeen(item.id);
              onPanelClose?.();
            }}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: 8,
              textDecoration: "none",
              color: row.unread ? "#0f172a" : "#64748b",
              background: row.unread ? "#fffbeb" : "#fff",
              fontWeight: row.unread ? 700 : 500,
            }}
          >
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Задача готова</div>
            <div style={{ fontWeight: 700 }}>{item.training_title || `Тренировка #${item.training_id}`}</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#475569" }}>
              Отчетена от: {item.assigned_to_name || `#${item.assigned_to}`}
              {item.completion_note ? ` • ${item.completion_note}` : ""}
            </div>
            <div style={{ marginTop: 4, fontSize: 12 }}>{item.updated_at ? new Date(item.updated_at).toLocaleString("bg-BG") : "—"}</div>
          </Link>
        );
      }),
    [unifiedFeedItems, markFeeItemSeen, markTaskItemSeen],
  );

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
                <button
                  type="button"
                  className="navBtnOutline"
                  aria-expanded={tasksOpen}
                  aria-haspopup="true"
                  aria-controls="nav-tasks-panel"
                  onClick={() => setTasksOpen((prev) => !prev)}
                >
                  Задачи ({newTaskCount})
                </button>
                {tasksOpen && (
                  <div
                    id="nav-tasks-panel"
                    role="region"
                    aria-label="Център задачи"
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
            <div style={{ position: "relative" }}>
              <button
                type="button"
                className="navBtnOutline"
                aria-expanded={notificationsOpen}
                aria-haspopup="true"
                aria-controls="nav-notifications-panel"
                onClick={() => setNotificationsOpen((prev) => !prev)}
              >
                Известия ({combinedUnreadCount})
              </button>
              {notificationsOpen && (
                <div
                  id="nav-notifications-panel"
                  role="region"
                  aria-label="Известия"
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 8px)",
                    width: "min(92vw, 420px)",
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
                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <strong>Известия</strong>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
                        Форум: всички
                      </button>
                      {isHeadCoachUser && (
                        <button type="button" className="navBtnOutline" onClick={markAllClubFeedSeen}>
                          Клуб: маркирай прочетени
                        </button>
                      )}
                    </div>
                  </div>
                  <span style={{ color: "#64748b", fontSize: 12 }}>
                    {isHeadCoachUser
                      ? "Форум, платени такси и готови задачи (клуб) на едно място."
                      : "Форум известия."}
                  </span>
                  {unifiedFeedItems.length === 0 && (
                    <span style={{ color: "#64748b", fontSize: 13 }}>Няма известия.</span>
                  )}
                  {renderUnifiedNotificationRows(() => setNotificationsOpen(false))}
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

        <button
          type="button"
          className="navBurger"
          aria-label={mobileNavOpen ? "Затвори менюто" : "Отвори менюто"}
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen((v) => !v)}
        >
          <span className="navBurgerLines" aria-hidden>
            <span className="navBurgerBar" />
            <span className="navBurgerBar" />
            <span className="navBurgerBar" />
          </span>
          <span className="navBurgerLabel">Меню</span>
        </button>
      </div>

      <nav className="appNav appNav--desktop" aria-label="Основна навигация">
        {mainNavItems.map((item) => (
          <Link key={item.to} className="appNavLink" to={item.to}>
            {item.label}
          </Link>
        ))}
        {adminNavItems.length > 0 && (
          <>
            <span className="appNavDivider" />
            {adminNavItems.map((item) => (
              <Link key={item.to} className="appNavLink" to={item.to}>
                {item.label}
              </Link>
            ))}
          </>
        )}
      </nav>

      {mobileNavOpen
        ? createPortal(
            <div className="navMobileRoot" role="dialog" aria-modal="true" aria-label="Меню">
              <button type="button" className="navMobileBackdrop" aria-label="Затвори" onClick={closeMobileNav} />
              <div className="navMobileSheet">
                <div className="navMobileSheetHeader">
                  <span className="navMobileSheetTitle">Навигация</span>
                  <button type="button" className="navMobileClose" onClick={closeMobileNav}>
                    Затвори
                  </button>
                </div>
                {user ? (
                  <div className="navMobileAccount">
                    <div className="navMobileUser">
                      <div className="navMobileUserEmail" title={userLabel}>
                        {userLabel}
                      </div>
                      <div className="navMobileUserRole">{roleLabel}</div>
                    </div>
                    <div className="navMobileAccountActions">
                      {isCoachUser ? (
                        <Link to="/my-trainings" className="navMobilePill" onClick={closeMobileNav}>
                          Задачи ({newTaskCount})
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        className="navMobilePill"
                        aria-expanded={mobileNotifOpen}
                        onClick={() => setMobileNotifOpen((v) => !v)}
                      >
                        Известия ({combinedUnreadCount})
                      </button>
                      <button type="button" className="navMobilePill navMobilePill--danger" onClick={onLogout}>
                        Изход
                      </button>
                    </div>
                    {mobileNotifOpen ? (
                      <div
                        className="navMobileNotifPanel"
                        style={{
                          gridColumn: "1 / -1",
                          width: "100%",
                          marginTop: 4,
                          padding: 10,
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.22)",
                          background: "rgba(15, 35, 66, 0.55)",
                          maxHeight: "min(52vh, 420px)",
                          overflowY: "auto",
                          display: "grid",
                          gap: 8,
                        }}
                      >
                        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <strong style={{ color: "#fff", fontSize: 14 }}>Известия</strong>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            <button
                              type="button"
                              className="navMobilePill"
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
                              Форум: всички
                            </button>
                            {isHeadCoachUser ? (
                              <button type="button" className="navMobilePill" onClick={markAllClubFeedSeen}>
                                Клуб: прочетени
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <span style={{ color: "rgba(226,236,255,0.85)", fontSize: 12 }}>
                          {isHeadCoachUser
                            ? "Форум, такси и задачи (клуб). Натисни ред за подробности."
                            : "Форум. Натисни ред за подробности."}
                        </span>
                        {unifiedFeedItems.length === 0 ? (
                          <span style={{ color: "rgba(226,236,255,0.75)", fontSize: 13 }}>Няма известия.</span>
                        ) : (
                          <div style={{ display: "grid", gap: 8 }}>
                            {renderUnifiedNotificationRows(() => {
                              setMobileNotifOpen(false);
                              closeMobileNav();
                            })}
                          </div>
                        )}
                        <Link
                          to="/forum"
                          className="appNavLink appNavLink--sheet"
                          style={{ textAlign: "center", justifyContent: "center" }}
                          onClick={() => {
                            setMobileNotifOpen(false);
                            closeMobileNav();
                          }}
                        >
                          Към форума
                        </Link>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="navMobileAccount">
                    <Link to="/login" className="navMobilePill" onClick={closeMobileNav}>
                      Вход
                    </Link>
                  </div>
                )}
                <div className="navMobileLinks">
                  {mainNavItems.map((item) => (
                    <Link key={`m-${item.to}`} className="appNavLink appNavLink--sheet" to={item.to} onClick={closeMobileNav}>
                      {item.label}
                    </Link>
                  ))}
                  {adminNavItems.length > 0 && (
                    <>
                      <div className="navMobileSectionLabel">Администрация</div>
                      {adminNavItems.map((item) => (
                        <Link key={`ma-${item.to}`} className="appNavLink appNavLink--sheet" to={item.to} onClick={closeMobileNav}>
                          {item.label}
                        </Link>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </header>
  );
}
