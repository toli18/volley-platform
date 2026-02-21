import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { Button, Card, Input } from "../../components/ui";

const normalizeError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Грешка при заявката.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Невалидни данни (422).";
  return "Грешка при заявката.";
};

export default function AdminEditArticle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ title: "", excerpt: "", content: "" });

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await axiosInstance.get(API_PATHS.ARTICLE_GET(id));
      const a = res.data;
      setForm({
        title: a?.title || "",
        excerpt: a?.excerpt || "",
        content: a?.content || "",
      });
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const save = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setError("Заглавието и съдържанието са задължителни.");
      return;
    }
    try {
      setSaving(true);
      setError("");
      await axiosInstance.put(API_PATHS.ADMIN_ARTICLE_UPDATE(id), {
        title: form.title.trim(),
        excerpt: form.excerpt.trim() || null,
        content: form.content.trim(),
      });
      navigate("/admin/articles");
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="uiPage">Зареждане...</div>;

  return (
    <div className="uiPage" style={{ maxWidth: 980 }}>
      <div style={{ marginBottom: 10 }}>
        <Button as={Link} to="/admin/articles" variant="secondary" size="sm">
          ← Назад към всички статии
        </Button>
      </div>
      <h2 style={{ marginTop: 0 }}>Редакция на статия (Admin)</h2>

      {error && <div className="uiAlert uiAlert--danger">{error}</div>}

      <Card>
        <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
        <div>
          <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>Заглавие *</label>
          <Input name="title" value={form.title} onChange={onChange} />
        </div>
        <div>
          <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>Кратко описание</label>
          <Input as="textarea" name="excerpt" value={form.excerpt} onChange={onChange} rows={3} />
        </div>
        <div>
          <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>Съдържание *</label>
          <Input as="textarea" name="content" value={form.content} onChange={onChange} rows={16} />
        </div>
        </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
        <Button onClick={save} disabled={saving}>
          {saving ? "Запис..." : "Запази промените"}
        </Button>
      </div>
      </Card>
    </div>
  );
}

