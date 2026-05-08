import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { Button, Card, EmptyState, PageHero } from "../components/ui";
import { createDraftKey, hasMeaningfulDraft, loadDraft } from "../utils/articleDrafts";
import Drills from "./Drills";

const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const formatDate = (value) => {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("bg-BG");
};

const monthStart = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
};

const cardLinkStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: 10,
  textDecoration: "none",
  color: "#0f172a",
};

const extractDrillIdsFromPlan = (plan) => {
  if (!plan || typeof plan !== "object") return [];
  const out = [];
  Object.values(plan).forEach((arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((id) => {
      const n = Number(id);
      if (Number.isFinite(n)) out.push(n);
    });
  });
  return out;
};

export default function Home() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [feesSummary, setFeesSummary] = useState({ total: 0, paid: 0, unpaid: 0 });
  const [forumItems, setForumItems] = useState([]);
  const [articleItems, setArticleItems] = useState([]);
  const [lastTrainings, setLastTrainings] = useState([]);
  const [topDrills, setTopDrills] = useState([]);
  const [draftCount, setDraftCount] = useState(0);
  const [returnedArticles, setReturnedArticles] = useState([]);
  const [activityItems, setActivityItems] = useState([]);
  const [monthlyStats, setMonthlyStats] = useState({ trainingsCreated: 0, drillsUsed: 0 });
  const [scheduleItems, setScheduleItems] = useState([]);
  const [error, setError] = useState("");

  const role = String(user?.role || "").toLowerCase();
  const showCoachDashboard = role === "coach" || role === "club_head_coach";
  const monthKey = useMemo(() => currentMonthKey(), []);

  useEffect(() => {
    const loadDashboard = async () => {
      if (!showCoachDashboard) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError("");
        const [
          feesRes,
          forumRes,
          articlesRes,
          trainingsRes,
          drillsRes,
          myDrillsRes,
          myArticlesRes,
          notificationsRes,
          scheduleRes,
        ] = await Promise.allSettled([
          axiosInstance.get(API_PATHS.FEES_PERIOD_REPORT, {
            params: { from_month: monthKey, to_month: monthKey },
          }),
          axiosInstance.get(API_PATHS.FORUM_POSTS_LIST, {
            params: { page: 1, page_size: 5 },
          }),
          axiosInstance.get(API_PATHS.ARTICLES_LIST),
          axiosInstance.get(API_PATHS.TRAININGS_LIST_MY),
          axiosInstance.get(API_PATHS.DRILLS_LIST),
          axiosInstance.get(API_PATHS.DRILLS_MY),
          axiosInstance.get(API_PATHS.ARTICLE_MINE),
          axiosInstance.get(API_PATHS.FORUM_NOTIFICATIONS, { params: { limit: 8 } }),
          axiosInstance.get(API_PATHS.SCHEDULE_OCCURRENCES, {
            params: {
              from: new Date().toISOString().slice(0, 10),
              to: new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10),
            },
          }),
        ]);

        const feesRows = feesRes.status === "fulfilled" && Array.isArray(feesRes.value.data?.rows) ? feesRes.value.data.rows : [];
        const unpaid = feesRows.filter((row) => {
          const month = Array.isArray(row.months) ? row.months[0] : null;
          return !month?.paid;
        }).length;
        setFeesSummary({
          total: feesRes.status === "fulfilled" ? Number(feesRes.value.data?.total_athletes) || feesRows.length : 0,
          paid: Math.max(0, feesRows.length - unpaid),
          unpaid,
        });

        const forumList = forumRes.status === "fulfilled" && Array.isArray(forumRes.value.data?.items) ? forumRes.value.data.items : [];
        setForumItems(forumList.slice(0, 5));

        const articles = articlesRes.status === "fulfilled" && Array.isArray(articlesRes.value.data) ? articlesRes.value.data : [];
        articles.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        setArticleItems(articles.slice(0, 5));

        const myTrainings = trainingsRes.status === "fulfilled" && Array.isArray(trainingsRes.value.data) ? trainingsRes.value.data : [];
        myTrainings.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        setLastTrainings(myTrainings.slice(0, 5));

        const allDrills = drillsRes.status === "fulfilled" && Array.isArray(drillsRes.value.data) ? drillsRes.value.data : [];
        const myDrills = myDrillsRes.status === "fulfilled" && Array.isArray(myDrillsRes.value.data) ? myDrillsRes.value.data : [];
        const myArticles = myArticlesRes.status === "fulfilled" && Array.isArray(myArticlesRes.value.data) ? myArticlesRes.value.data : [];

        const drillIds = myTrainings.flatMap((t) => extractDrillIdsFromPlan(t.plan));
        const uniqueDrillIds = new Set(drillIds);
        const drillCountMap = new Map();
        drillIds.forEach((id) => {
          drillCountMap.set(id, (drillCountMap.get(id) || 0) + 1);
        });

        const drillNameMap = new Map();
        [...allDrills, ...myDrills].forEach((d) => {
          const id = Number(d.id);
          if (Number.isFinite(id)) drillNameMap.set(id, d.title || d.name || `Упражнение #${id}`);
        });

        const topUsed = Array.from(drillCountMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([id, count]) => ({ id, count, title: drillNameMap.get(id) || `Упражнение #${id}` }));
        setTopDrills(topUsed);

        const localDraft = loadDraft(createDraftKey());
        const hasLocalDraft = hasMeaningfulDraft(localDraft);
        const draftTrainings = myTrainings.filter((t) => String(t.status || "").toLowerCase().includes("draft")).length;
        setDraftCount(draftTrainings + (hasLocalDraft ? 1 : 0));

        const returned = myArticles
          .filter((a) => String(a.status || "").toUpperCase() === "NEEDS_EDIT")
          .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
          .slice(0, 5);
        setReturnedArticles(returned);

        const monthFrom = monthStart();
        setMonthlyStats({
          trainingsCreated: myTrainings.filter((t) => new Date(t.created_at || 0).getTime() >= monthFrom).length,
          drillsUsed: uniqueDrillIds.size,
        });

        const forumNotifications =
          notificationsRes.status === "fulfilled" && Array.isArray(notificationsRes.value.data?.items)
            ? notificationsRes.value.data.items.map((n) => ({
                id: `forum-${n.id}`,
                text: n.message,
                at: n.created_at,
                to: `/forum/${n.post_id}`,
              }))
            : [];

        const articleStatusAlerts = myArticles
          .filter((a) => {
            const st = String(a.status || "").toUpperCase();
            return st === "APPROVED" || st === "REJECTED" || st === "NEEDS_EDIT";
          })
          .map((a) => {
            const st = String(a.status || "").toUpperCase();
            const label = st === "APPROVED" ? "одобрена" : st === "REJECTED" ? "отказана" : "върната за редакция";
            return {
              id: `article-${a.id}-${st}`,
              text: `Статия "${a.title || `#${a.id}`}" е ${label}.`,
              at: a.updated_at || a.created_at,
              to: "/articles/my",
            };
          });

        const drillStatusAlerts = myDrills
          .filter((d) => {
            const st = String(d.status || "").toLowerCase();
            return st === "approved" || st === "rejected";
          })
          .map((d) => {
            const st = String(d.status || "").toLowerCase();
            const label = st === "approved" ? "одобрено" : "отказано";
            return {
              id: `drill-${d.id}-${st}`,
              text: `Упражнение "${d.title || d.name || `#${d.id}`}" е ${label}.`,
              at: d.updated_at || d.created_at,
              to: "/my-drills",
            };
          });

        setActivityItems(
          [...forumNotifications, ...articleStatusAlerts, ...drillStatusAlerts]
            .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
            .slice(0, 8)
        );
        const scheduleList = scheduleRes.status === "fulfilled" && Array.isArray(scheduleRes.value.data?.items)
          ? scheduleRes.value.data.items
          : [];
        setScheduleItems(scheduleList.slice(0, 10));
      } catch (e) {
        const detail = e?.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "Грешка при зареждане на началното табло.");
      } finally {
        setLoading(false);
      }
    };
    loadDashboard();
  }, [monthKey, showCoachDashboard]);

  if (!user || !showCoachDashboard) {
    return <Drills />;
  }

  return (
    <div className="uiPage">
      <PageHero
        title="Coach Dashboard"
        subtitle="Най-важното за днес: месечни такси, нови теми във форума и последни статии."
        actions={
          <Button as={Link} to="/coach-board">
            Тактическа дъска
          </Button>
        }
      />

      {error && <div className="uiAlert uiAlert--danger">{error}</div>}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
      <Card
        title="График за следващите 7 дни"
        actions={
          <Button as={Link} to="/club-head" variant="secondary" size="sm">
            Пълен график
          </Button>
        }
      >
        {loading ? (
          <p style={{ marginTop: 10 }}>Зареждане...</p>
        ) : scheduleItems.length === 0 ? (
          <EmptyState title="Няма планирани тренировки" description="Главният треньор все още не е попълнил графика." />
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {scheduleItems.map((it, idx) => (
              <div key={`${it.rule_id}-${it.date}-${it.start_time}-${idx}`} style={cardLinkStyle}>
                <div style={{ fontWeight: 700 }}>{it.date} · {it.start_time}–{it.end_time}</div>
                <div style={{ marginTop: 4, color: "#64748b", fontSize: 13 }}>
                  {it.team_name || `Отбор #${it.team_id}`} · {it.location}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Твоите последни 5 тренировки"
        actions={
          <Button as={Link} to="/my-trainings" variant="secondary" size="sm">
            Към тренировките
          </Button>
        }
      >
        {loading ? (
          <p style={{ marginTop: 10 }}>Зареждане...</p>
        ) : lastTrainings.length === 0 ? (
          <EmptyState title="Още няма тренировки" description="Създай тренировка от Генератора." />
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {lastTrainings.map((t) => (
              <Link key={t.id} to={`/trainings/${t.id}`} style={cardLinkStyle}>
                <div style={{ fontWeight: 700 }}>{t.title || `Тренировка #${t.id}`}</div>
                <div style={{ marginTop: 4, color: "#64748b", fontSize: 13 }}>
                  {formatDate(t.created_at)} • {String(t.status || "—")}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Най-често използвани упражнения"
        actions={
          <Button as={Link} to="/my-drills" variant="secondary" size="sm">
            Към упражненията
          </Button>
        }
      >
        {loading ? (
          <p style={{ marginTop: 10 }}>Зареждане...</p>
        ) : topDrills.length === 0 ? (
          <EmptyState title="Все още няма статистика" description="Запази поне една тренировка с упражнения." />
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {topDrills.map((d, idx) => (
              <div key={d.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span>
                  {idx + 1}. {d.title}
                </span>
                <span className="uiBadge">{d.count} пъти</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Чернови и върнати статии"
        actions={
          <Button as={Link} to="/articles/my" variant="secondary" size="sm">
            Към моите статии
          </Button>
        }
      >
        {loading ? (
          <p style={{ marginTop: 10 }}>Зареждане...</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="uiBadge">Неприключени чернови: {draftCount}</span>
              <span className="uiBadge uiBadge--danger">Върнати статии: {returnedArticles.length}</span>
            </div>
            {returnedArticles.length === 0 ? (
              <p className="uiMuted">Няма върнати статии за редакция.</p>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {returnedArticles.map((a) => (
                  <Link key={a.id} to={`/articles/${a.id}/edit`} style={{ ...cardLinkStyle, border: "1px solid #f4caca", background: "#fff7f7" }}>
                    <div style={{ fontWeight: 700 }}>{a.title || `Статия #${a.id}`}</div>
                    <div style={{ marginTop: 4, color: "#7f1d1d", fontSize: 13 }}>Обновена: {formatDate(a.updated_at || a.created_at)}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card
        title="Последни известия"
        actions={
          <Button as={Link} to="/forum" variant="secondary" size="sm">
            Форум
          </Button>
        }
      >
        {loading ? (
          <p style={{ marginTop: 10 }}>Зареждане...</p>
        ) : activityItems.length === 0 ? (
          <EmptyState title="Няма нови известия" description="Ще виждаш тук форум активност и промени по статии/упражнения." />
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {activityItems.map((item) => (
              <Link key={item.id} to={item.to} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                <div style={{ fontWeight: 700 }}>{item.text}</div>
                <div style={{ marginTop: 4, color: "#64748b", fontSize: 12 }}>{formatDate(item.at)}</div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Малка статистика за месеца"
      >
        {loading ? (
          <p style={{ marginTop: 10 }}>Зареждане...</p>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="uiBadge">Създадени тренировки: {monthlyStats.trainingsCreated}</span>
            <span className="uiBadge uiBadge--success">Използвани упражнения: {monthlyStats.drillsUsed}</span>
          </div>
        )}
      </Card>

      <Card
        title={`Дължими такси (${monthKey})`}
        actions={
          <Button as={Link} to="/monthly-fees" variant="secondary" size="sm">
            Отвори Месечни Такси
          </Button>
        }
      >
        {loading ? (
          <p style={{ marginTop: 10 }}>Зареждане...</p>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <span className="uiBadge">
              Общо: <strong>{feesSummary.total}</strong>
            </span>
            <span className="uiBadge uiBadge--success">
              Платили: <strong>{feesSummary.paid}</strong>
            </span>
            <span className="uiBadge uiBadge--danger">
              Дължат: <strong>{feesSummary.unpaid}</strong>
            </span>
          </div>
        )}
      </Card>
      </div>

      <div style={{ display: "grid", gap: 16 }}>

      <Card
        title="Последни теми във форума"
        actions={
          <Button as={Link} to="/forum" variant="secondary" size="sm">
            Към форума
          </Button>
        }
      >
        {loading ? (
          <p style={{ marginTop: 10 }}>Зареждане...</p>
        ) : forumItems.length === 0 ? (
          <EmptyState title="Още няма теми" description="Създай първата дискусия за деня." />
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {forumItems.map((post) => (
              <Link
                key={post.id}
                to={`/forum/${post.id}`}
                style={cardLinkStyle}
              >
                <div style={{ fontWeight: 700 }}>
                  {post.is_pinned ? "📌 " : ""}
                  {post.title}
                  {post.is_locked ? " 🔒" : ""}
                </div>
                <div style={{ marginTop: 4, color: "#64748b", fontSize: 13 }}>
                  Отговори: {post.replies_count || 0} • Активност: {formatDate(post.last_activity_at || post.created_at)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Последни статии"
        actions={
          <Button as={Link} to="/articles" variant="secondary" size="sm">
            Към статиите
          </Button>
        }
      >
        {loading ? (
          <p style={{ marginTop: 10 }}>Зареждане...</p>
        ) : articleItems.length === 0 ? (
          <EmptyState title="Още няма публикувани статии" description="Публикувай нова статия, за да се появи тук." />
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {articleItems.map((article) => (
              <Link
                key={article.id}
                to={`/articles/${article.id}`}
                style={cardLinkStyle}
              >
                <div style={{ fontWeight: 700 }}>{article.title || `Статия #${article.id}`}</div>
                <div style={{ marginTop: 4, color: "#64748b", fontSize: 13 }}>
                  Публикувана: {formatDate(article.created_at)} • Автор: {article.author_name || `Потребител #${article.author_id}`}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
      </div>
    </div>
  );
}
