import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { Button, Card, EmptyState } from "../components/ui";
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

export default function Home() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [feesSummary, setFeesSummary] = useState({ total: 0, paid: 0, unpaid: 0 });
  const [forumItems, setForumItems] = useState([]);
  const [articleItems, setArticleItems] = useState([]);
  const [error, setError] = useState("");

  const role = String(user?.role || "").toLowerCase();
  const showCoachDashboard = ["coach", "federation_admin", "platform_admin"].includes(role);
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
        const [feesRes, forumRes, articlesRes] = await Promise.all([
          axiosInstance.get(API_PATHS.FEES_PERIOD_REPORT, {
            params: { from_month: monthKey, to_month: monthKey },
          }),
          axiosInstance.get(API_PATHS.FORUM_POSTS_LIST, {
            params: { page: 1, page_size: 5 },
          }),
          axiosInstance.get(API_PATHS.ARTICLES_LIST),
        ]);

        const feesRows = Array.isArray(feesRes.data?.rows) ? feesRes.data.rows : [];
        const unpaid = feesRows.filter((row) => {
          const month = Array.isArray(row.months) ? row.months[0] : null;
          return !month?.paid;
        }).length;
        setFeesSummary({
          total: Number(feesRes.data?.total_athletes) || feesRows.length,
          paid: Math.max(0, feesRows.length - unpaid),
          unpaid,
        });

        const forumList = Array.isArray(forumRes.data?.items) ? forumRes.data.items : [];
        setForumItems(forumList.slice(0, 5));

        const articles = Array.isArray(articlesRes.data) ? articlesRes.data : [];
        articles.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        setArticleItems(articles.slice(0, 5));
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
      <div className="uiPageHeader">
        <h1 style={{ margin: 0 }}>Coach Dashboard</h1>
        <p className="uiMuted">
        Най-важното за днес: месечни такси, нови теми във форума и последни статии.
        </p>
      </div>

      {error && <div className="uiAlert uiAlert--danger">{error}</div>}

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
                style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, textDecoration: "none", color: "#0f172a" }}
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
                style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, textDecoration: "none", color: "#0f172a" }}
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
  );
}
