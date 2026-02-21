import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../../utils/apiClient";
import ArticleCard from "../../components/articles/ArticleCard";
import "../../components/articles/articles.css";
import { Button, EmptyState, Input } from "../../components/ui";

const normalizeError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Грешка при зареждане на чакащите статии.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Невалидни данни (422).";
  return "Грешка при зареждане на чакащите статии.";
};

export default function AdminPendingArticles() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await axiosInstance.get("/api/admin/articles", {
        params: { status: "PENDING" },
      });
      const baseItems = Array.isArray(res.data) ? res.data : [];
      const detailed = await Promise.all(
        baseItems.map(async (item) => {
          try {
            const d = await axiosInstance.get(`/api/articles/${item.id}`);
            return d.data;
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
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter((a) =>
      `${a?.title || ""} ${a?.excerpt || ""} ${a?.content || ""}`.toLowerCase().includes(q)
    );
  }, [articles, query]);

  return (
    <div className="uiPage">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Чакащи статии</h2>
        <Button onClick={load} variant="secondary" size="sm">
          Презареди
        </Button>
      </div>
      <div style={{ marginTop: 10 }}>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Търси по заглавие, excerpt или съдържание..."
        />
      </div>

      {loading && <p style={{ marginTop: 12 }}>Зареждане...</p>}
      {error && <div className="uiAlert uiAlert--danger">{error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          title="Няма чакащи статии за преглед"
          description="Когато треньорите изпратят нови материали, ще се покажат тук."
        />
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="articleGrid" style={{ marginTop: 12 }}>
          {filtered.map((a) => (
            <div key={a.id}>
              <ArticleCard article={a} />
              <div style={{ marginTop: 8 }}>
                <Button as={Link} to={`/admin/articles/${a.id}`} variant="secondary" size="sm">
                  Преглед и модерация
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

