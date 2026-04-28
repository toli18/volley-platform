import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axiosInstance from "../utils/apiClient";
import { useAuth } from "../auth/AuthContext";
import { resolveMediaUrl } from "../components/articles/articleUtils";
import RichTextToolbar from "../components/RichTextToolbar";
import { Button, PageHero } from "../components/ui";
import { clearDraft, editDraftKey, hasMeaningfulDraft, loadDraft, saveDraft } from "../utils/articleDrafts";
import { normalizePastedHtmlFragment, toDisplayHtml } from "../utils/richText";

const SLASH_COMMANDS = [
  { id: "heading", key: "заглавие", label: "/заглавие", insert: "\n## Заглавие\n" },
  { id: "subheading", key: "подзаглавие", label: "/подзаглавие", insert: "\n### Подзаглавие\n" },
  { id: "quote", key: "цитат", label: "/цитат", insert: "\n> Цитат\n" },
  { id: "list", key: "списък", label: "/списък", insert: "\n- Точка 1\n- Точка 2\n" },
  { id: "image", key: "снимка", label: "/снимка", insert: "" },
];

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
  const [draftStatus, setDraftStatus] = useState("няма чернова");
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState({ title: "", excerpt: "", content: "" });
  const contentRef = useRef(null);
  const inlineImageInputRef = useRef(null);
  const restoreCheckedRef = useRef(false);
  const saveTimerRef = useRef(null);
  const draftKey = editDraftKey(id);

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
      setInitialSnapshot({
        title: a.title || "",
        excerpt: a.excerpt || "",
        content: a.content || "",
      });
      setLoaded(true);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (!loaded || restoreCheckedRef.current === true) return;
    restoreCheckedRef.current = true;
    const draft = loadDraft(draftKey);
    if (!draft || !hasMeaningfulDraft(draft)) return;
    const restore = window.confirm("Има намерена чернова за редакцията. Да я възстановя?");
    if (!restore) return;
    setForm((prev) => ({
      ...prev,
      title: draft.title || prev.title,
      excerpt: draft.excerpt || prev.excerpt,
      content: draft.content || prev.content,
    }));
    setDraftStatus("чернова възстановена");
    setDraftSavedAt(draft.saved_at || "");
  }, [draftKey, loaded]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const canEdit = user && form.author_id === user.id && form.status !== "APPROVED";
  const isDirty =
    String(form.title || "") !== String(initialSnapshot.title || "") ||
    String(form.excerpt || "") !== String(initialSnapshot.excerpt || "") ||
    String(form.content || "") !== String(initialSnapshot.content || "");

  useEffect(() => {
    if (!loaded || !canEdit) return;
    if (!isDirty) {
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
  }, [canEdit, draftKey, form, isDirty, loaded]);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!canEdit) return;
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [canEdit, isDirty]);

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

  const onInsertPreset = (kind) => {
    if (!canEdit) return;
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
    if (previewMode || !canEdit) return;
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
    if (!command || !canEdit) return;
    if (command.id === "image") {
      replaceSlashToken("");
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

  const uploadInlineImageAndInsert = async (file) => {
    if (!file || !canEdit) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      setUploading(true);
      setError("");
      const res = await axiosInstance.post(`/api/articles/${id}/media`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      let imageUrl = res.data?.url ? resolveMediaUrl(res.data.url) : "";
      let imageName = res.data?.name || "Снимка";
      if (!imageUrl) {
        const fresh = await axiosInstance.get(`/api/articles/${id}`);
        const latestImage = (Array.isArray(fresh.data?.media_items) ? fresh.data.media_items : [])
          .filter((m) => String(m?.type || "").toUpperCase() === "IMAGE")
          .at(-1);
        if (latestImage) {
          imageUrl = resolveMediaUrl(latestImage.url);
          imageName = latestImage.name || imageName;
        }
      }
      await load();
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
      setInitialSnapshot({
        title: form.title,
        excerpt: form.excerpt,
        content: form.content,
      });
      clearDraft(draftKey);
      setDraftStatus("черновата е изчистена");
      setDraftSavedAt("");
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
      <PageHero
        title="Редакция на статия"
        subtitle={`Работиш по статия #${id}`}
        actions={<Button as={Link} to={`/articles/${id}`} variant="secondary">← Към статията</Button>}
      />
      <div style={{ color: "#607693", fontSize: 13, marginBottom: 8 }}>
        Чернова: <strong>{draftStatus}</strong>
        {draftSavedAt ? ` • ${new Date(draftSavedAt).toLocaleTimeString("bg-BG")}` : ""}
        {canEdit && isDirty && (
          <button
            type="button"
            onClick={() => {
              clearDraft(draftKey);
              setDraftStatus("няма чернова");
              setDraftSavedAt("");
            }}
            style={{ marginLeft: 8 }}
          >
            Изчисти чернова
          </button>
        )}
      </div>
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
          <div style={{ marginBottom: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setPreviewMode((prev) => !prev)} disabled={!canEdit}>
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
              if (!canEdit) return;
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setDropActive(false);
              if (!canEdit) return;
              const file = e.dataTransfer?.files?.[0];
              if (!file) return;
              if (!String(file.type || "").startsWith("image/")) {
                setError("Drag & drop е разрешен само за изображения.");
                return;
              }
              await uploadInlineImageAndInsert(file);
            }}
            rows={12}
            disabled={!canEdit}
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
              disabled={!canEdit}
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
          {filteredSlashCommands.length > 0 && !previewMode && canEdit && (
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
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <a href={resolveMediaUrl(m.url)} target="_blank" rel="noreferrer">
                  {m.name}
                </a>
                {canEdit && String(m.type || "").toUpperCase() === "IMAGE" && (
                  <button
                    type="button"
                    onClick={() =>
                      insertAtCursor(`\n<p><img src="${resolveMediaUrl(m.url)}" alt="${m.name || "Снимка"}" style="max-width:100%;height:auto;border-radius:8px;" /></p>\n`)
                    }
                  >
                    Вмъкни в текста
                  </button>
                )}
              </div>
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

