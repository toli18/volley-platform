import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axiosInstance from "../utils/apiClient";
import { useAuth } from "../auth/AuthContext";
import { resolveMediaUrl } from "../components/articles/articleUtils";
import RichTextToolbar from "../components/RichTextToolbar";

const normalizeError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Грешка при заявката.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Невалидни данни (422).";
  return "Грешка при заявката.";
};

export default function EditArticle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [linkPayload, setLinkPayload] = useState({ title: "", url: "" });
  const [form, setForm] = useState({
    title: "",
    excerpt: "",
    content: "",
    status: "",
    media_items: [],
    links: [],
    author_id: null,
  });
  const contentRef = useRef(null);

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await axiosInstance.get(`/api/articles/${id}`);
      const a = res.data;
      setForm({
        title: a.title || "",
        excerpt: a.excerpt || "",
        content: a.content || "",
        status: a.status || "",
        media_items: Array.isArray(a.media_items) ? a.media_items : [],
        links: Array.isArray(a.links) ? a.links : [],
        author_id: a.author_id,
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
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const canEdit = user && form.author_id === user.id && form.status !== "APPROVED";

  const insertContentTemplate = (template) => {
    if (!canEdit) return;
    const textarea = contentRef.current;
    const current = form.content || "";
    if (!textarea) {
      setForm((prev) => ({ ...prev, content: `${current}${template}` }));
      return;
    }
    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${template}${current.slice(end)}`;
    setForm((prev) => ({ ...prev, content: next }));
    requestAnimationFrame(() => {
      const pos = start + template.length;
      textarea.focus();
      textarea.setSelectionRange(pos, pos);
    });
  };

  const onSave = async () => {
    if (!canEdit) return;
    if (!form.title.trim() || !form.content.trim()) {
      setError("Заглавие и съдържание са задължителни.");
      return;
    }
    try {
      setSaving(true);
      setError("");
      await axiosInstance.put(`/api/articles/${id}`, {
        title: form.title.trim(),
        excerpt: form.excerpt.trim() || null,
        content: form.content.trim(),
      });
      navigate(`/articles/${id}`);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setSaving(false);
    }
  };

  const onUploadMedia = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !canEdit) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      setUploading(true);
      setError("");
      await axiosInstance.post(`/api/articles/${id}/media`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await load();
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const onDeleteMedia = async (mediaId) => {
    if (!canEdit) return;
    try {
      await axiosInstance.delete(`/api/articles/${id}/media/${mediaId}`);
      await load();
    } catch (err) {
      setError(normalizeError(err));
    }
  };

  const onAddLink = async () => {
    if (!canEdit) return;
    if (!linkPayload.url.trim()) {
      setError("Линкът е задължителен.");
      return;
    }
    try {
      await axiosInstance.post(`/api/articles/${id}/links`, {
        title: linkPayload.title.trim() || null,
        url: linkPayload.url.trim(),
      });
      setLinkPayload({ title: "", url: "" });
      await load();
    } catch (err) {
      setError(normalizeError(err));
    }
  };

  const onDeleteLink = async (linkId) => {
    if (!canEdit) return;
    try {
      await axiosInstance.delete(`/api/articles/${id}/links/${linkId}`);
      await load();
    } catch (err) {
      setError(normalizeError(err));
    }
  };

  if (loading) return <div style={{ padding: 20 }}>Зареждане...</div>;

  return (
    <div style={{ padding: 20, maxWidth: 980 }}>
      <div style={{ marginBottom: 10 }}>
        <Link to={`/articles/${id}`}>← Към статията</Link>
      </div>
      <h2 style={{ marginTop: 0 }}>Редакция на статия</h2>
      <div style={{ color: "#607693", marginBottom: 10 }}>
        Статус: <strong>{form.status}</strong>
      </div>

      {error && <div style={{ background: "#ffdddd", color: "#a00", padding: 10, borderRadius: 8 }}>{error}</div>}
      {!canEdit && (
        <div style={{ background: "#fff7d6", color: "#825a00", padding: 10, borderRadius: 8 }}>
          Тази статия не може да се редактира.
        </div>
      )}

      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <div>
          <label style={{ fontWeight: 800, display: "block", marginBottom: 6 }}>Заглавие *</label>
          <input name="title" value={form.title} onChange={onChange} disabled={!canEdit} />
        </div>
        <div>
          <label style={{ fontWeight: 800, display: "block", marginBottom: 6 }}>Кратко описание</label>
          <textarea name="excerpt" value={form.excerpt} onChange={onChange} rows={3} disabled={!canEdit} />
        </div>
        <div>
          <label style={{ fontWeight: 800, display: "block", marginBottom: 6 }}>Съдържание *</label>
          <textarea ref={contentRef} name="content" value={form.content} onChange={onChange} rows={12} disabled={!canEdit} />
          <div style={{ marginTop: 8 }}>
            <RichTextToolbar
              textareaRef={contentRef}
              value={form.content}
              onChange={(next) => setForm((prev) => ({ ...prev, content: next }))}
              disabled={!canEdit}
            />
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" disabled={!canEdit} onClick={() => insertContentTemplate("\n## Нова секция\n")}>
              Добави секция
            </button>
            <button type="button" disabled={!canEdit} onClick={() => insertContentTemplate("\n### Подсекция\n")}>
              Добави подзаглавие
            </button>
            <button type="button" disabled={!canEdit} onClick={() => insertContentTemplate("\n- Точка 1\n- Точка 2\n")}>
              Добави списък
            </button>
          </div>
        </div>
      </div>

      <section style={{ marginTop: 18, border: "1px solid #dbe5f2", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Файлове и изображения</h3>
        {canEdit && (
          <input
            type="file"
            onChange={onUploadMedia}
            disabled={uploading}
            accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.pptx,.xlsx,.zip"
          />
        )}
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {form.media_items.map((m) => (
            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <a href={resolveMediaUrl(m.url)} target="_blank" rel="noreferrer">
                {m.name}
              </a>
              {canEdit && (
                <button onClick={() => onDeleteMedia(m.id)} style={{ color: "#b91c1c" }}>
                  Изтрий
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 18, border: "1px solid #dbe5f2", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Външни линкове</h3>
        {canEdit && (
          <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
            <input
              placeholder="Заглавие (по избор)"
              value={linkPayload.title}
              onChange={(e) => setLinkPayload((prev) => ({ ...prev, title: e.target.value }))}
            />
            <input
              placeholder="https://..."
              value={linkPayload.url}
              onChange={(e) => setLinkPayload((prev) => ({ ...prev, url: e.target.value }))}
            />
            <button onClick={onAddLink}>Добави линк</button>
          </div>
        )}
        <div style={{ display: "grid", gap: 8 }}>
          {form.links.map((l) => (
            <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <a href={l.url} target="_blank" rel="noreferrer">
                {l.title || l.url}
              </a>
              {canEdit && (
                <button onClick={() => onDeleteLink(l.id)} style={{ color: "#b91c1c" }}>
                  Изтрий
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {canEdit && (
        <div style={{ marginTop: 12 }}>
          <button onClick={onSave} disabled={saving}>
            {saving ? "Запис..." : "Запази промените"}
          </button>
        </div>
      )}
    </div>
  );
}

