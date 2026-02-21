import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../utils/apiClient";
import ArticleCard from "../components/articles/ArticleCard";
import {
  articleLevel,
  articleTopics,
  authorDisplayLabel,
  getLocalReadCount,
  normalizeArticleStatus,
} from "../components/articles/articleUtils";
import "../components/articles/articles.css";
import { useAuth } from "../auth/AuthContext";

const normalizeError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Грешка при зареждане на статиите.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Невалидни данни (422).";
  return "Грешка при зареждане на статиите.";
};

export default function Articles() {
  const { user } = useAuth();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    query: "",
    topic: "all",
    level: "all",
    author: "all",
    date: "all",
    sort: "newest",
  });

  const loadArticles = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await axiosInstance.get("/api/articles");
      const baseItems = Array.isArray(res.data) ? res.data : [];

      const detailed = await Promise.all(
        baseItems.map(async (item) => {
          try {
            const detailsRes = await axiosInstance.get(`/api/articles/${item.id}`);
            return detailsRes.data;
          } catch {
            return item;
          }
        })
      );
      setArticles(detailed);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadArticles();
  }, []);

  const topicOptions = useMemo(() => {
    const set = new Set();
    for (const article of articles) {
      articleTopics(article).forEach((t) => set.add(t));
    }
    return Array.from(set);
  }, [articles]);

  const authorOptions = useMemo(() => {
    const set = new Set(articles.map((a) => a.author_id).filter(Boolean));
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [articles]);

  const filteredArticles = useMemo(() => {
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;

    let list = [...articles].filter((a) => normalizeArticleStatus(a.status) === "APPROVED");

    if (filters.query.trim()) {
      const q = filters.query.trim().toLowerCase();
      list = list.filter((a) => `${a.title || ""} ${a.excerpt || ""} ${a.content || ""}`.toLowerCase().includes(q));
    }
    if (filters.topic !== "all") {
      list = list.filter((a) => articleTopics(a).includes(filters.topic));
    }
    if (filters.level !== "all") {
      list = list.filter((a) => articleLevel(a) === filters.level);
    }
    if (filters.author !== "all") {
      list = list.filter((a) => String(a.author_id) === filters.author);
    }
    if (filters.date === "30d") {
      list = list.filter((a) => {
        const t = new Date(a.created_at || 0).getTime();
        return Number.isFinite(t) && now - t <= thirtyDays;
      });
    }
    if (filters.date === "90d") {
      list = list.filter((a) => {
        const t = new Date(a.created_at || 0).getTime();
        return Number.isFinite(t) && now - t <= ninetyDays;
      });
    }

    if (filters.sort === "a-z") {
      list.sort((x, y) => String(x.title || "").localeCompare(String(y.title || ""), "bg"));
    } else if (filters.sort === "oldest") {
      list.sort((x, y) => new Date(x.created_at || 0) - new Date(y.created_at || 0));
    } else if (filters.sort === "most-read") {
      list.sort((x, y) => getLocalReadCount(y.id) - getLocalReadCount(x.id));
    } else {
      list.sort((x, y) => new Date(y.created_at || 0) - new Date(x.created_at || 0));
    }

    return list;
  }, [articles, filters]);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Статии и методика</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {user?.role === "coach" && <Link to="/articles/new">Нова статия</Link>}
          <button onClick={loadArticles}>Презареди</button>
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 12, background: "#ffdddd", color: "#a00", padding: 10, borderRadius: 8 }}>
          {error}
        </div>
      )}

      {loading && <p style={{ marginTop: 12 }}>Зареждане...</p>}

      {!loading && !error && (
        <div className="articleToolbar">
          <div className="articleFilters">
            <input
              placeholder="Търси по тема, заглавие, съдържание..."
              value={filters.query}
              onChange={(e) => setFilters((p) => ({ ...p, query: e.target.value }))}
            />

            <select value={filters.topic} onChange={(e) => setFilters((p) => ({ ...p, topic: e.target.value }))}>
              <option value="all">Тема: всички</option>
              {topicOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <select value={filters.level} onChange={(e) => setFilters((p) => ({ ...p, level: e.target.value }))}>
              <option value="all">Ниво: всички</option>
              <option value="Начинаещи">Начинаещи</option>
              <option value="Средно ниво">Средно ниво</option>
              <option value="Напреднали">Напреднали</option>
              <option value="Всички нива">Всички нива</option>
            </select>

            <select value={filters.author} onChange={(e) => setFilters((p) => ({ ...p, author: e.target.value }))}>
              <option value="all">Автор: всички</option>
              {authorOptions.map((id) => (
                <option key={id} value={String(id)}>
                  {authorDisplayLabel(articles.find((a) => String(a.author_id) === String(id)) || { author_id: id })}
                </option>
              ))}
            </select>

            <select value={filters.date} onChange={(e) => setFilters((p) => ({ ...p, date: e.target.value }))}>
              <option value="all">Дата: всички</option>
              <option value="30d">Последни 30 дни</option>
              <option value="90d">Последни 90 дни</option>
            </select>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <select value={filters.sort} onChange={(e) => setFilters((p) => ({ ...p, sort: e.target.value }))}>
              <option value="newest">Сортиране: Най-нови</option>
              <option value="oldest">Сортиране: Най-стари</option>
              <option value="most-read">Сортиране: Най-четени</option>
              <option value="a-z">Сортиране: A-Z</option>
            </select>
          </div>
        </div>
      )}

      {!loading && !error && filteredArticles.length === 0 && (
        <div className="emptyBlock" style={{ marginTop: 16 }}>
          <strong>Няма намерени статии по зададените критерии.</strong>
          <p>Пробвай с по-широко търсене, махни филтър или сортирай по „Най-нови“.</p>
        </div>
      )}

      {!loading && !error && filteredArticles.length > 0 && (
        <div className="articleGrid">
          {filteredArticles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  );
}

