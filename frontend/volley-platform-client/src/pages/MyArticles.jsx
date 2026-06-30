import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { statusMeta } from "../components/articles/articleUtils";
import { Button, Card, EmptyState, Input, PageHero } from "../components/ui";
import { normalizeError } from "../utils/normalizeError";

const statusLabel = (value) => {
  const key = String(value || "").toUpperCase();
  if (key === "PENDING") return "Чака одобрение";
  if (key === "APPROVED") return "Одобрена";
  if (key === "REJECTED") return "Отказана";
  if (key === "NEEDS_EDIT") return "Върната за редакция";
  return key || "—";
};

export default function MyArticles() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [resubmittingId, setResubmittingId] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await axiosInstance.get(API_PATHS.ARTICLE_MINE);
      setItems(Array.isArray(res.data) ? res.data : []);
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
    let list = [...items];
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => `${a.title || ""} ${a.excerpt || ""}`.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      list = list.filter((a) => String(a.status || "").toUpperCase() === statusFilter);
    }
    return list.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
  }, [items, query, statusFilter]);

  const onResubmit = async (articleId) => {
    try {
      setResubmittingId(articleId);
      setError("");
      await axiosInstance.post(API_PATHS.ARTICLE_RESUBMIT(articleId));
      await load();
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setResubmittingId(null);
    }
  };

  return (
    <div className="uiPage">
      <PageHero
        title="Моите статии"
        subtitle="Преглед на статуса и управление на собствените публикации."
        actions={
          <>
            <Button as={Link} to="/articles/new" size="sm">Нова статия</Button>
            <Button onClick={load} variant="secondary" size="sm">Презареди</Button>
          </>
        }
      />

      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr", gap: 10 }}>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Търси по заглавие или описание..."
          />
          <Input as="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Всички статуси</option>
            <option value="PENDING">Чака одобрение</option>
            <option value="APPROVED">Одобрени</option>
            <option value="NEEDS_EDIT">Върнати за редакция</option>
            <option value="REJECTED">Отказани</option>
          </Input>
        </div>
      </Card>

      {loading && <p>Зареждане...</p>}
      {error && <div className="uiAlert uiAlert--danger">{error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState title="Няма статии по този филтър" description="Промени филтъра или създай нова статия." />
      )}

      {!loading && !error && filtered.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.map((article) => {
            const st = statusMeta(article.status);
            const stKey = String(article.status || "").toUpperCase();
            const canEdit = stKey !== "APPROVED";
            const canResubmit = stKey === "NEEDS_EDIT";
            return (
              <Card key={article.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <h3 style={{ margin: "0 0 6px" }}>{article.title || `Статия #${article.id}`}</h3>
                    <div style={{ fontSize: 12, color: "#607693" }}>
                      Обновена: {new Date(article.updated_at || article.created_at || "").toLocaleString("bg-BG")}
                    </div>
                  </div>
                  <span className={`chip chipStatus ${st.className}`}>{statusLabel(stKey)}</span>
                </div>
                <p style={{ margin: "8px 0 0", color: "#607693" }}>{article.excerpt || "Няма кратко описание."}</p>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <Button as={Link} to={`/articles/${article.id}`} variant="secondary" size="sm">
                    Преглед
                  </Button>
                  {canEdit ? (
                    <Button as={Link} to={`/articles/${article.id}/edit`} size="sm">
                      Редакция
                    </Button>
                  ) : null}
                  {canResubmit ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={resubmittingId === article.id}
                      onClick={() => onResubmit(article.id)}
                    >
                      {resubmittingId === article.id ? "Изпращане..." : "Повторно изпращане"}
                    </Button>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

