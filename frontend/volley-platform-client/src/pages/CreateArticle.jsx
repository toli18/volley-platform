import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axiosInstance from "../utils/apiClient";
import ArticleAttachmentList from "../components/articles/ArticleAttachmentList";
import { resolveMediaUrl } from "../components/articles/articleUtils";

const normalizeError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Грешка при създаване на статията.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Невалидни данни (422).";
  return "Грешка при създаване на статията.";
};

export default function CreateArticle() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [createdArticleId, setCreatedArticleId] = useState(null);
  const [createdArticle, setCreatedArticle] = useState(null);
  const [linkPayload, setLinkPayload] = useState({ title: "", url: "" });
  const [form, setForm] = useState({
    title: "",
    excerpt: "",
    content: "",
  });

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const loadCreatedArticle = async (articleId) => {
    const res = await axiosInstance.get(`/api/articles/${articleId}`);
    setCreatedArticle(res.data);
  };

  const onSubmit = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setError("Заглавието и съдържанието са задължителни.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const payload = {
        title: form.title.trim(),
        excerpt: form.excerpt.trim() || null,
        content: form.content.trim(),
      };
      const res = await axiosInstance.post("/api/articles", payload);
      setCreatedArticleId(res.data.id);
      await loadCreatedArticle(res.data.id);
      setSuccess("Статията е създадена. Сега можеш да качиш корица, снимки, файлове и линкове.");
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setSaving(false);
    }
  };

  const onUploadMedia = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !createdArticleId) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      setUploading(true);
      setError("");
      await axiosInstance.post(`/api/articles/${createdArticleId}/media`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await loadCreatedArticle(createdArticleId);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const onDeleteMedia = async (mediaId) => {
    if (!createdArticleId) return;
    try {
      setError("");
      await axiosInstance.delete(`/api/articles/${createdArticleId}/media/${mediaId}`);
      await loadCreatedArticle(createdArticleId);
    } catch (err) {
      setError(normalizeError(err));
    }
  };

  const onAddLink = async () => {
    if (!createdArticleId) return;
    if (!linkPayload.url.trim()) {
      setError("Линкът е задължителен.");
      return;
    }
    try {
      setAddingLink(true);
      setError("");
      await axiosInstance.post(`/api/articles/${createdArticleId}/links`, {
        title: linkPayload.title.trim() || null,
        url: linkPayload.url.trim(),
      });
      setLinkPayload({ title: "", url: "" });
      await loadCreatedArticle(createdArticleId);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setAddingLink(false);
    }
  };

  const onDeleteLink = async (linkId) => {
    if (!createdArticleId) return;
    try {
      setError("");
      await axiosInstance.delete(`/api/articles/${createdArticleId}/links/${linkId}`);
      await loadCreatedArticle(createdArticleId);
    } catch (err) {
      setError(normalizeError(err));
    }
  };

  const imageItems = useMemo(
    () =>
      (Array.isArray(createdArticle?.media_items) ? createdArticle.media_items : []).filter(
        (m) => String(m?.type || "").toUpperCase() === "IMAGE"
      ),
    [createdArticle]
  );

  return (
    <div style={{ padding: 20, maxWidth: 980 }}>
      <div style={{ marginBottom: 10 }}>
        <Link to="/articles">← Към статии</Link>
      </div>
      <h2 style={{ marginTop: 0 }}>Нова статия (разширен редактор)</h2>
      <div
        style={{
          marginTop: 8,
          marginBottom: 10,
          border: "1px solid #dbe5f2",
          borderRadius: 10,
          background: "#fff",
          padding: 10,
        }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span
            style={{
              padding: "4px 8px",
              borderRadius: 999,
              fontWeight: 800,
              fontSize: 12,
              background: "#eaf3ff",
              color: "#15457d",
            }}
          >
            1) Основна статия
          </span>
          <span style={{ color: "#607693" }}>→</span>
          <span
            style={{
              padding: "4px 8px",
              borderRadius: 999,
              fontWeight: 800,
              fontSize: 12,
              background: createdArticleId ? "#ebf9f1" : "#f3f6fb",
              color: createdArticleId ? "#0f7f47" : "#607693",
            }}
          >
            2) Качи медия, PDF и линкове
          </span>
        </div>
        <div style={{ marginTop: 8, color: "#607693", fontSize: 13 }}>
          Първо натисни <strong>„1) Създай статия“</strong>. След това автоматично се отключва стъпка 2.
        </div>
      </div>
      {error && <div style={{ background: "#ffdddd", color: "#a00", padding: 10, borderRadius: 8 }}>{error}</div>}
      {success && (
        <div style={{ background: "#e9f9ef", color: "#0c6d3f", padding: 10, borderRadius: 8, marginTop: 8 }}>
          {success}
        </div>
      )}

      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <div>
          <label style={{ fontWeight: 800, display: "block", marginBottom: 6 }}>Заглавие *</label>
          <input name="title" value={form.title} onChange={onChange} disabled={Boolean(createdArticleId)} />
        </div>
        <div>
          <label style={{ fontWeight: 800, display: "block", marginBottom: 6 }}>Кратко описание</label>
          <textarea name="excerpt" value={form.excerpt} onChange={onChange} rows={3} disabled={Boolean(createdArticleId)} />
        </div>
        <div>
          <label style={{ fontWeight: 800, display: "block", marginBottom: 6 }}>Съдържание *</label>
          <textarea name="content" value={form.content} onChange={onChange} rows={14} disabled={Boolean(createdArticleId)} />
          <div style={{ marginTop: 6, color: "#607693", fontSize: 12 }}>
            Поддържа структуриране с Markdown синтаксис: <code>## Заглавие</code>, <code>### Подзаглавие</code>,{" "}
            <code>- списък</code>, <code>&gt; цитат</code>.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        {!createdArticleId ? (
          <button onClick={onSubmit} disabled={saving}>
            {saving ? "Запис..." : "1) Създай статия"}
          </button>
        ) : (
          <>
            <button onClick={() => navigate(`/articles/${createdArticleId}`)}>2) Преглед на статията</button>
            <button onClick={() => navigate(`/articles/${createdArticleId}/edit`)}>Отвори в редактор</button>
          </>
        )}
      </div>

      <section style={{ marginTop: 18, border: "1px solid #dbe5f2", borderRadius: 12, padding: 12, background: "#fff" }}>
        <h3 style={{ marginTop: 0 }}>Медия и ресурси за статията</h3>
        <p style={{ marginTop: 0, color: "#607693" }}>
          Качи корица/галерия, PDF и материали за сваляне, после добави външни линкове.
        </p>

        {!createdArticleId && (
          <div style={{ marginBottom: 12, background: "#f8fbff", border: "1px dashed #cfe0f6", color: "#516b8d", padding: 10, borderRadius: 8 }}>
            Стъпка 2 е заключена. Създай статията от бутона по-горе, за да се активират качванията.
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontWeight: 800, display: "block", marginBottom: 6 }}>Качи файл или изображение</label>
          <input
            type="file"
            onChange={onUploadMedia}
            disabled={uploading || !createdArticleId}
            accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.pptx,.xlsx,.zip"
          />
          <div style={{ marginTop: 4, color: "#607693", fontSize: 12 }}>
            Поддържани: JPG, PNG, WEBP, PDF, DOCX, PPTX, XLSX, ZIP (до 50MB).
          </div>
        </div>

        {imageItems.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <strong>Качени изображения</strong>
            <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              {imageItems.map((img) => (
                <div key={img.id} style={{ border: "1px solid #dbe5f2", borderRadius: 8, overflow: "hidden" }}>
                  <img
                    src={resolveMediaUrl(img.url)}
                    alt={img.name || "Снимка"}
                    style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover" }}
                  />
                  <div style={{ padding: 8, display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "#607693" }}>{img.name}</span>
                    <button onClick={() => onDeleteMedia(img.id)} style={{ color: "#b91c1c" }}>
                      Изтрий
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <ArticleAttachmentList attachments={createdArticle?.media_items || []} />

        <div style={{ marginTop: 14 }}>
          <strong>Външни линкове</strong>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            <input
              placeholder="Заглавие на линка (по избор)"
              value={linkPayload.title}
              onChange={(e) => setLinkPayload((prev) => ({ ...prev, title: e.target.value }))}
              disabled={!createdArticleId}
            />
            <input
              placeholder="https://..."
              value={linkPayload.url}
              onChange={(e) => setLinkPayload((prev) => ({ ...prev, url: e.target.value }))}
              disabled={!createdArticleId}
            />
            <div>
              <button onClick={onAddLink} disabled={addingLink || !createdArticleId}>
                {addingLink ? "Добавяне..." : "Добави линк"}
              </button>
            </div>
          </div>
        </div>

        {Array.isArray(createdArticle?.links) && createdArticle.links.length > 0 && (
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {createdArticle.links.map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <a href={l.url} target="_blank" rel="noreferrer">
                  {l.title || l.url}
                </a>
                <button onClick={() => onDeleteLink(l.id)} style={{ color: "#b91c1c" }}>
                  Изтрий
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

