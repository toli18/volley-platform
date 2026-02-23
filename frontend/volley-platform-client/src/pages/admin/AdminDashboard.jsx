// src/pages/admin/AdminDashboard.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { Button, Card, EmptyState } from "../../components/ui";

const normalizeError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Грешка при зареждане на админ статистиките.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Невалидни данни (422).";
  return "Грешка при зареждане на админ статистиките.";
};

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await axiosInstance.get(API_PATHS.ADMIN_ANALYTICS_OVERVIEW);
        setStats(res.data || null);
      } catch (err) {
        setError(normalizeError(err));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const links = [
    { to: "/admin/coaches", label: "Треньори (създаване)" },
    { to: "/admin/drills", label: "Всички упражнения (редакция / изтриване)" },
    { to: "/admin/pending", label: "Упражнения за одобрение" },
    { to: "/admin/articles", label: "Всички статии (редакция / изтриване)" },
    { to: "/admin/articles/pending", label: "Статии за одобрение" },
    { to: "/admin/clubs", label: "Клубове" },
  ];

  return (
    <div className="uiPage">
      <h2 style={{ margin: 0 }}>Админ панел</h2>

      {error && <div className="uiAlert uiAlert--danger">{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <Card title="Нови регистрации на треньори">
          {loading || !stats ? (
            <p className="uiMuted">Зареждане...</p>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              <span className="uiBadge">Днес: {stats.coach_registrations.day}</span>
              <span className="uiBadge">7 дни: {stats.coach_registrations.week}</span>
              <span className="uiBadge">30 дни: {stats.coach_registrations.month}</span>
              <span className="uiBadge uiBadge--success">Общо: {stats.coach_registrations.total}</span>
            </div>
          )}
        </Card>

        <Card title="Активни треньори">
          {loading || !stats ? (
            <p className="uiMuted">Зареждане...</p>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              <span className="uiBadge">24 часа (брой): {stats.active_coaches.last_24_hours}</span>
              <span className="uiBadge">Последни 7 дни: {stats.active_coaches.last_7_days}</span>
              <span className="uiBadge uiBadge--success">Последни 30 дни: {stats.active_coaches.last_30_days}</span>
              {!stats.active_coaches.now_names?.length ? (
                <span className="uiMuted">В момента няма активни треньори.</span>
              ) : (
                <div style={{ display: "grid", gap: 4 }}>
                  <strong style={{ fontSize: 13, color: "#334155" }}>В момента (по име):</strong>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {stats.active_coaches.now_names.map((name) => (
                      <span key={name} className="uiBadge">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title="Чакащи за модерация">
          {loading || !stats ? (
            <p className="uiMuted">Зареждане...</p>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              <span className="uiBadge uiBadge--danger">Упражнения: {stats.pending.drills}</span>
              <span className="uiBadge uiBadge--danger">Статии: {stats.pending.articles}</span>
            </div>
          )}
        </Card>

        <Card title="Approval rate">
          {loading || !stats ? (
            <p className="uiMuted">Зареждане...</p>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              <span className="uiBadge uiBadge--success">Одобрени: {stats.approval_rate.approved}</span>
              <span className="uiBadge uiBadge--danger">Отказани: {stats.approval_rate.rejected}</span>
              <span className="uiBadge">Approval rate: {stats.approval_rate.approval_rate_percent}%</span>
            </div>
          )}
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 10 }}>
        <Card title="Най-използвани упражнения в тренировки">
          {loading ? (
            <p className="uiMuted">Зареждане...</p>
          ) : !stats?.top_used_drills?.length ? (
            <EmptyState title="Няма данни" description="Още няма използвани упражнения в запазени тренировки." />
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {stats.top_used_drills.map((item, idx) => (
                <div key={item.drill_id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span>{idx + 1}. {item.title}</span>
                  <span className="uiBadge">{item.times_used}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Най-активни теми във форума">
          {loading ? (
            <p className="uiMuted">Зареждане...</p>
          ) : !stats?.top_forum_topics?.length ? (
            <EmptyState title="Няма данни" description="Още няма форум активност за класация." />
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {stats.top_forum_topics.map((item) => (
                <div key={item.post_id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span>{item.title}</span>
                  <span className="uiBadge">{item.replies_count} отг.</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Най-активни тагове във форума">
          {loading ? (
            <p className="uiMuted">Зареждане...</p>
          ) : !stats?.top_forum_tags?.length ? (
            <EmptyState title="Няма таг данни" description="Няма достатъчно теми с тагове." />
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {stats.top_forum_tags.map((item) => (
                <span key={item.tag} className="uiBadge">
                  #{item.tag} ({item.uses})
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card title="Графика: нови треньори (6 месеца)">
          {loading ? (
            <p className="uiMuted">Зареждане...</p>
          ) : !stats?.coach_registrations_monthly?.length ? (
            <EmptyState title="Няма месечни данни" description="Ще се визуализират при натрупване." />
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {stats.coach_registrations_monthly.map((row) => {
                const max = Math.max(...stats.coach_registrations_monthly.map((x) => x.count), 1);
                const width = Math.max(4, Math.round((row.count / max) * 100));
                return (
                  <div key={row.month} style={{ display: "grid", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#607693" }}>
                      <span>{row.month}</span>
                      <span>{row.count}</span>
                    </div>
                    <div style={{ height: 10, background: "#eef3fa", borderRadius: 999 }}>
                      <div style={{ height: "100%", width: `${width}%`, background: "#0b5cff", borderRadius: 999 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div style={{ display: "grid", gap: 8 }}>
          {links.map((item) => (
            <Button key={item.to} as={Link} to={item.to} variant="secondary">
              {item.label}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}
