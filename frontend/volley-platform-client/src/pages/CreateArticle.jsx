import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axiosInstance from "../utils/apiClient";
import ArticleAttachmentList from "../components/articles/ArticleAttachmentList";
import { resolveMediaUrl } from "../components/articles/articleUtils";
import RichTextToolbar from "../components/RichTextToolbar";
import { Button, PageHero } from "../components/ui";
import { clearDraft, createDraftKey, hasMeaningfulDraft, loadDraft, saveDraft } from "../utils/articleDrafts";
import { normalizePastedHtmlFragment, toDisplayHtml, toEmbeddableImageUrl } from "../utils/richText";

const SLASH_COMMANDS = [
  { id: "heading", key: "заглавие", label: "/заглавие", insert: "\n## Заглавие\n" },
  { id: "subheading", key: "подзаглавие", label: "/подзаглавие", insert: "\n### Подзаглавие\n" },
  { id: "quote", key: "цитат", label: "/цитат", insert: "\n> Цитат\n" },
  { id: "list", key: "списък", label: "/списък", insert: "\n- Точка 1\n- Точка 2\n" },
  { id: "image", key: "снимка", label: "/снимка", insert: "" },
];

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
  const [draftStatus, setDraftStatus] = useState("няма чернова");
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const contentRef = useRef(null);
  const inlineImageInputRef = useRef(null);
  const draftKey = createDraftKey();
  const restoreCheckedRef = useRef(false);
  const saveTimerRef = useRef(null);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const insertContentTemplate = (template) => {
    if (createdArticleId) return;
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

  const onInsertPreset = (kind) => {
    if (kind === "article") {
      insertContentTemplate(
        "\n## Въведение\nКратък контекст по темата.\n\n## Основна част\n### Точка 1\n- Основен акцент\n- Практически пример\n\n### Точка 2\n- Основен акцент\n- Практически пример\n\n## Заключение\nКакво да приложим в тренировъчния процес.\n"
      );
      return;
    }
    if (kind === "forum") {
      insertContentTemplate(
        "\n## Контекст\nКратко описание на ситуацията.\n\n## Какво пробвах досега\n- Вариант 1\n- Вариант 2\n\n## Въпрос към колегите\nКак бихте подходили вие?\n"
      );
    }
  };

  const insertAtCursor = (text) => {
    const textarea = contentRef.current;
    const current = form.content || "";
    if (!textarea) {
      setForm((prev) => ({ ...prev, content: `${current}${text}` }));
      return;
    }
    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${text}${current.slice(end)}`;
    setForm((prev) => ({ ...prev, content: next }));
    requestAnimationFrame(() => {
      const pos = start + text.length;
      textarea.focus();
      textarea.setSelectionRange(pos, pos);
    });
  };

  const onContentPaste = (e) => {
    if (previewMode) return;
    const html = e.clipboardData?.getData("text/html");
    if (!html) return;
    const normalized = normalizePastedHtmlFragment(html);
    if (!normalized) return;
    e.preventDefault();
    insertAtCursor(`\n${normalized}\n`);
  };

  const getCurrentSlashQuery = () => {
    const textarea = contentRef.current;
    const current = form.content || "";
    const caret = textarea?.selectionStart ?? current.length;
    const before = current.slice(0, caret);
    const slashStart = before.lastIndexOf("/");
    if (slashStart < 0) return "";
    const token = before.slice(slashStart + 1);
    if (!token || /\s/.test(token)) return "";
    return token.toLowerCase();
  };

  const replaceSlashToken = (insertText = "") => {
    const textarea = contentRef.current;
    const current = form.content || "";
    const caret = textarea?.selectionStart ?? current.length;
    const before = current.slice(0, caret);
    const slashStart = before.lastIndexOf("/");
    if (slashStart < 0) return false;
    const token = before.slice(slashStart);
    if (!token.startsWith("/") || /\s/.test(token)) return false;
    const next = `${current.slice(0, slashStart)}${insertText}${current.slice(caret)}`;
    const cursor = slashStart + insertText.length;
    setForm((prev) => ({ ...prev, content: next }));
    requestAnimationFrame(() => {
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
    return true;
  };

  const applySlashCommand = (command) => {
    if (!command) return;
    if (command.id === "image") {
      replaceSlashToken("");
      if (!createdArticleId) {
        setError("Първо създай статията, после добави снимка в текста.");
        return;
      }
      requestAnimationFrame(() => inlineImageInputRef.current?.click());
      setSlashQuery("");
      return;
    }
    replaceSlashToken(command.insert);
    setSlashQuery("");
  };

  const filteredSlashCommands = slashQuery
    ? SLASH_COMMANDS.filter((cmd) => cmd.key.startsWith(slashQuery))
    : [];

  const loadCreatedArticle = async (articleId) => {
    const res = await axiosInstance.get(`/api/articles/${articleId}`);
    setCreatedArticle(res.data);
    return res.data;
  };

  useEffect(() => {
    if (restoreCheckedRef.current) return;
    restoreCheckedRef.current = true;
    const draft = loadDraft(draftKey);
    if (!draft || !hasMeaningfulDraft(draft)) return;
    const restore = window.confirm("Има намерена чернова за нова статия. Да я възстановя?");
    if (!restore) return;
    setForm({
      title: draft.title || "",
      excerpt: draft.excerpt || "",
      content: draft.content || "",
    });
    setDraftStatus("чернова възстановена");
    setDraftSavedAt(draft.saved_at || "");
  }, [draftKey]);

  useEffect(() => {
    if (createdArticleId) return;
    if (!hasMeaningfulDraft(form)) {
      clearDraft(draftKey);
      setDraftStatus("няма чернова");
      setDraftSavedAt("");
      return;
    }
    setDraftStatus("запазване...");
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveDraft(draftKey, form);
      const nowIso = new Date().toISOString();
      setDraftSavedAt(nowIso);
      setDraftStatus("черновата е запазена");
    }, 700);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [createdArticleId, draftKey, form]);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (createdArticleId) return;
      if (!hasMeaningfulDraft(form)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [createdArticleId, form]);

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
      if (!createdArticleId) {
        const res = await axiosInstance.post("/api/articles", payload);
        setCreatedArticleId(res.data.id);
        await loadCreatedArticle(res.data.id);
        setSuccess("Статията е създадена. Можеш да редактираш текста и да добавяш медия между абзаците.");
      } else {
        await axiosInstance.put(`/api/articles/${createdArticleId}`, payload);
        await loadCreatedArticle(createdArticleId);
        setSuccess("Промените по текста са запазени.");
      }
      clearDraft(draftKey);
      setDraftStatus("черновата е изчистена");
      setDraftSavedAt("");
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setSaving(false);
    }
  };

  const uploadInlineImageAndInsert = async (file) => {
    if (!file) return;
    if (!createdArticleId) {
      setError("Първо създай статията, после добави снимка в текста.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    try {
      setUploading(true);
      setError("");
      const res = await axiosInstance.post(`/api/articles/${createdArticleId}/media`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      let imageUrl = res.data?.url ? resolveMediaUrl(res.data.url) : "";
      let imageName = res.data?.name || "Снимка";
      if (!imageUrl) {
        const article = await loadCreatedArticle(createdArticleId);
        const latestImage = (Array.isArray(article?.media_items) ? article.media_items : [])
          .filter((m) => String(m?.type || "").toUpperCase() === "IMAGE")
          .at(-1);
        if (latestImage) {
          imageUrl = resolveMediaUrl(latestImage.url);
          imageName = latestImage.name || imageName;
        }
      } else {
        await loadCreatedArticle(createdArticleId);
      }
      if (!imageUrl) {
        setError("Снимката е качена, но не успях да я вмъкна автоматично.");
        return;
      }
      insertAtCursor(`\n<p><img src="${imageUrl}" alt="${imageName}" style="max-width:100%;height:auto;border-radius:8px;" /></p>\n`);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setUploading(false);
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
      const embeddable = toEmbeddableImageUrl(linkPayload.url.trim());
      if (embeddable) {
        insertAtCursor(`\n<p><img src="${embeddable}" alt="${linkPayload.title?.trim() || "Снимка"}" style="max-width:100%;height:auto;border-radius:8px;" /></p>\n`);
      }
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
      <PageHero
        title="Нова статия (разширен редактор)"
        subtitle="Създай съдържание, добави медия и изпрати за одобрение."
        actions={<Button as={Link} to="/articles" variant="secondary">← Към статии</Button>}
      />
      <div style={{ color: "#607693", fontSize: 13, marginBottom: 8 }}>
        Чернова: <strong>{draftStatus}</strong>
        {draftSavedAt ? ` • ${new Date(draftSavedAt).toLocaleTimeString("bg-BG")}` : ""}
        {!createdArticleId && hasMeaningfulDraft(form) && (
          <button
            type="button"
            onClick={() => {
              clearDraft(draftKey);
              setForm({ title: "", excerpt: "", content: "" });
              setDraftStatus("няма чернова");
              setDraftSavedAt("");
            }}
            style={{ marginLeft: 8 }}
          >
            Изчисти чернова
          </button>
        )}
      </div>
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
          <input name="title" value={form.title} onChange={onChange} />
        </div>
        <div>
          <label style={{ fontWeight: 800, display: "block", marginBottom: 6 }}>Кратко описание</label>
          <textarea name="excerpt" value={form.excerpt} onChange={onChange} rows={3} />
        </div>
        <div>
          <label style={{ fontWeight: 800, display: "block", marginBottom: 6 }}>Съдържание *</label>
          <div style={{ marginBottom: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setPreviewMode((prev) => !prev)}>
              {previewMode ? "Редакция" : "Преглед"}
            </button>
          </div>
          <textarea
            ref={contentRef}
            name="content"
            value={form.content}
            onChange={onChange}
            onPaste={onContentPaste}
            onKeyUp={() => setSlashQuery(getCurrentSlashQuery())}
            onClick={() => setSlashQuery(getCurrentSlashQuery())}
            onDragOver={(e) => {
              e.preventDefault();
              if (!createdArticleId) return;
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setDropActive(false);
              const file = e.dataTransfer?.files?.[0];
              if (!file) return;
              if (!String(file.type || "").startsWith("image/")) {
                setError("Drag & drop е разрешен само за изображения.");
                return;
              }
              await uploadInlineImageAndInsert(file);
            }}
            rows={14}
            style={{
              display: previewMode ? "none" : "block",
              borderColor: dropActive ? "#0c6a47" : undefined,
              boxShadow: dropActive ? "0 0 0 2px rgba(12,106,71,.15)" : undefined,
            }}
          />
          <input
            ref={inlineImageInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.gif"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              await uploadInlineImageAndInsert(file);
            }}
          />
          <div style={{ marginTop: 8 }}>
            <RichTextToolbar
              textareaRef={contentRef}
              value={form.content}
              onChange={(next) => setForm((prev) => ({ ...prev, content: next }))}
              onInsertTemplate={onInsertPreset}
            />
          </div>
          {previewMode && (
            <div
              className="forum-post-content"
              style={{ marginTop: 10, border: "1px solid #dbe5f2", borderRadius: 8, padding: 12, background: "#fff" }}
              dangerouslySetInnerHTML={{ __html: toDisplayHtml(form.content) }}
            />
          )}
          {filteredSlashCommands.length > 0 && !previewMode && (
            <div style={{ marginTop: 8, border: "1px solid #dbe5f2", borderRadius: 8, background: "#fff", padding: 6, display: "grid", gap: 4 }}>
              {filteredSlashCommands.map((cmd) => (
                <button key={cmd.id} type="button" onClick={() => applySlashCommand(cmd)} style={{ textAlign: "left" }}>
                  {cmd.label}
                </button>
              ))}
            </div>
          )}
          <div style={{ marginTop: 6, color: "#607693", fontSize: 12 }}>
            Поставяне (Ctrl+V) пази структурата. Използвай `/заглавие`, `/подзаглавие`, `/цитат`, `/снимка` или drag & drop на изображение.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button onClick={onSubmit} disabled={saving}>
          {saving ? "Запис..." : createdArticleId ? "Запази промени в текста" : "1) Създай статия"}
        </button>
        {createdArticleId ? (
          <>
            <button onClick={() => navigate(`/articles/${createdArticleId}`)}>2) Преглед на статията</button>
            <button onClick={() => navigate(`/articles/${createdArticleId}/edit`)}>Отвори в редактор</button>
          </>
        ) : null}
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
                  <div style={{ padding: 8, display: "grid", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "#607693" }}>{img.name}</span>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() =>
                          insertAtCursor(`\n<p><img src="${resolveMediaUrl(img.url)}" alt="${img.name || "Снимка"}" style="max-width:100%;height:auto;border-radius:8px;" /></p>\n`)
                        }
                      >
                        Вмъкни в текста
                      </button>
                      <button onClick={() => onDeleteMedia(img.id)} style={{ color: "#b91c1c" }}>
                        Изтрий
                      </button>
                    </div>
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

