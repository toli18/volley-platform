import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { statusMeta } from "../../components/articles/articleUtils";

const normalizeError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Грешка при зареждане.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Невалидни данни (422).";
  return "Грешка при зареждане.";
};

export default function AdminArticles() {
  const navigate = useNavigate();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await axiosInstance.get(API_PATHS.ADMIN_ARTICLES_LIST_ALL);
      const data = Array.isArray(res.data) ? res.data : [];

      const detailed = await Promise.all(
        data.map(async (it) => {
          try {
            const d = await axiosInstance.get(API_PATHS.ARTICLE_GET(it.id));
            return d.data;
          } catch {
            return it;
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
    let list = [...articles];
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((a) =>
        `${a?.title || ""} ${a?.excerpt || ""} ${a?.content || ""}`.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") {
      list = list.filter((a) => String(a?.status || "").toUpperCase() === statusFilter);
    }
    return list.sort((a, b) => new Date(b?.updated_at || 0) - new Date(a?.updated_at || 0));
  }, [articles, query, statusFilter]);

  const removeArticle = async (id) => {
    if (!window.confirm("Сигурен ли си, че искаш да изтриеш тази статия?")) return;
    try {
      await axiosInstance.delete(API_PATHS.ADMIN_ARTICLE_DELETE(id));
      await load();
    } catch (err) {
      alert(normalizeError(err));
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Admin: Всички статии</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load}>Рефреш</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr", gap: 10, marginTop: 10 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Търси по заглавие, excerpt или съдържание..."
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Всички статуси</option>
          <option value="PENDING">PENDING</option>
          <option value="APPROVED">APPROVED</option>
          <option value="REJECTED">REJECTED</option>
          <option value="NEEDS_EDIT">NEEDS_EDIT</option>
        </select>
      </div>

      {loading && <p style={{ marginTop: 12 }}>Зареждане...</p>}
      {error && <div style={{ marginTop: 12, background: "#ffdddd", color: "#a00", padding: 10, borderRadius: 8 }}>{error}</div>}

      {!loading && !error && filtered.length === 0 && <p style={{ marginTop: 12 }}>Няма статии по избраните критерии.</p>}

      {!loading && !error && filtered.length > 0 && (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {filtered.map((a) => {
            const st = statusMeta(a.status);
            return (
              <article key={a.id} style={{ border: "1px solid #dbe5f2", borderRadius: 10, padding: 12, background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div>
                    <h3 style={{ margin: "0 0 6px 0" }}>{a.title}</h3>
                    <div style={{ fontSize: 12, color: "#607693" }}>
                      ID: {a.id} • Автор #{a.author_id} • Статус:{" "}
                      <span className={`chip chipStatus ${st.className}`}>{st.label}</span>
                    </div>
                    <p style={{ margin: "8px 0 0", color: "#607693" }}>{a.excerpt || "Няма кратко описание."}</p>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Link to={`/articles/${a.id}`}>Преглед</Link>
                    <Link to={`/admin/articles/${a.id}`}>Модерация</Link>
                    <button onClick={() => navigate(`/admin/articles/${a.id}/edit`)}>Редакция</button>
                    <button onClick={() => removeArticle(a.id)} style={{ color: "#b91c1c" }}>
                      Изтрий
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

