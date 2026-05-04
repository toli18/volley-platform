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
  const [taskReports, setTaskReports] = useState([]);
  const [taskReportsUnread, setTaskReportsUnread] = useState(0);
  const [clubSeenTick, setClubSeenTick] = useState(0);

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
            <div style={{ position: "relative" }}>
              <button className="navBtnOutline" onClick={() => setNotificationsOpen((prev) => !prev)}>
                Известия ({combinedUnreadCount})
              </button>
              {notificationsOpen && (
                <div
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
                  {unifiedFeedItems.map((row) => {
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
                              setNotificationsOpen(false);
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
                          <div style={{ marginTop: 4, fontSize: 12 }}>
                            {new Date(item.created_at || "").toLocaleString("bg-BG")}
                          </div>
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
                            setNotificationsOpen(false);
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
                            {item.month_key} • {Number(item.amount || 0).toFixed(2)} лв. • от {item.coach_name}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12 }}>
                            {item.paid_at ? new Date(item.paid_at).toLocaleString("bg-BG") : "—"}
                          </div>
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
                          setNotificationsOpen(false);
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
                        <div style={{ marginTop: 4, fontSize: 12 }}>
                          {item.updated_at ? new Date(item.updated_at).toLocaleString("bg-BG") : "—"}
                        </div>
                      </Link>
                    );
                  })}
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
