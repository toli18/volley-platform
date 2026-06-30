import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../../utils/apiClient";
import ArticleCard from "../../components/articles/ArticleCard";
import "../../components/articles/articles.css";
import { AdminHero, Button, EmptyState, Input } from "../../components/ui";
import { useToast } from "../../components/ToastProvider";
import { normalizeError } from "../../utils/normalizeError";

export default function AdminPendingArticles() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const toast = useToast();

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
      const msg = normalizeError(err);
      setError(msg);
      toast.error(msg);
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
    <div className="uiPage adminTheme">
      <AdminHero
        title="Чакащи статии"
        subtitle="Всички материали, които чакат админ преглед и модерация."
        actions={<Button onClick={load} variant="primary" size="sm">Презареди</Button>}
      />
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
                <Button as={Link} to={`/admin/articles/${a.id}`} variant="primary" size="sm">
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

