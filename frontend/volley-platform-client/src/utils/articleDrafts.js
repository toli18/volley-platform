const PREFIX = "article_draft_v1";

export const createDraftKey = () => `${PREFIX}:create`;
export const editDraftKey = (articleId) => `${PREFIX}:edit:${articleId}`;

export const hasMeaningfulDraft = (form) => {
  const f = form || {};
  return Boolean(String(f.title || "").trim() || String(f.excerpt || "").trim() || String(f.content || "").trim());
};

export const saveDraft = (key, form) => {
  if (!key || !form) return;
  const payload = {
    title: String(form.title || ""),
    excerpt: String(form.excerpt || ""),
    content: String(form.content || ""),
    saved_at: new Date().toISOString(),
  };
  localStorage.setItem(key, JSON.stringify(payload));
};

export const loadDraft = (key) => {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      title: String(parsed.title || ""),
      excerpt: String(parsed.excerpt || ""),
      content: String(parsed.content || ""),
      saved_at: parsed.saved_at || null,
    };
  } catch {
    return null;
  }
};

export const clearDraft = (key) => {
  if (!key) return;
  localStorage.removeItem(key);
};

