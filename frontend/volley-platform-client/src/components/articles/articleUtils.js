export const formatDateBg = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("bg-BG", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

export const resolveMediaUrl = (url) => {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return `${API_BASE_URL}${raw}`;
  return `${API_BASE_URL}/${raw}`;
};

export const formatDateTimeBg = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("bg-BG");
};

export const estimateReadMinutes = (text) => {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  if (!words) return 1;
  return Math.max(1, Math.ceil(words / 220));
};

export const normalizeArticleStatus = (status) => String(status || "").toUpperCase().trim();

export const statusMeta = (status) => {
  const value = normalizeArticleStatus(status);
  if (value === "APPROVED") return { label: "Одобрена", className: "stApproved" };
  if (value === "PENDING") return { label: "Чака одобрение", className: "stPending" };
  if (value === "REJECTED") return { label: "Отказана", className: "stRejected" };
  if (value === "NEEDS_EDIT") return { label: "Нужна редакция", className: "stNeedsEdit" };
  return { label: value || "Неизвестен", className: "stUnknown" };
};

export const authorDisplayLabel = (article) => {
  if (article?.author_display) return String(article.author_display);
  if (article?.author_club_name && article?.author_coach_number) {
    return `${article.author_club_name} — Треньор №${article.author_coach_number}`;
  }
  if (article?.author_name) return String(article.author_name);
  return `Автор #${article?.author_id ?? "?"}`;
};

export const articleTopics = (article) => {
  const text = `${article?.title || ""} ${article?.excerpt || ""} ${article?.content || ""}`.toLowerCase();
  const topics = [];
  if (/(методик|method)/i.test(text)) topics.push("Методика");
  if (/(техник|service|пас|посрещ|сервис|напад|блок)/i.test(text)) topics.push("Техника");
  if (/(тактик|strategy|система|позици|преход|комбинац)/i.test(text)) topics.push("Тактика");
  if (topics.length === 0) topics.push("Методика");
  return topics.slice(0, 3);
};

export const articleLevel = (article) => {
  const text = `${article?.title || ""} ${article?.excerpt || ""} ${article?.content || ""}`.toLowerCase();
  if (/(начинаещ|beginner)/i.test(text)) return "Начинаещи";
  if (/(напреднал|advanced|елит)/i.test(text)) return "Напреднали";
  if (/(средно|intermediate)/i.test(text)) return "Средно ниво";
  return "Всички нива";
};

export const pickCoverImage = (article) => {
  const media = Array.isArray(article?.media_items) ? article.media_items : [];
  const firstImage = media.find((m) => String(m?.type || "").toUpperCase() === "IMAGE");
  return resolveMediaUrl(firstImage?.url || "");
};

export const formatBytes = (bytes) => {
  const num = Number(bytes || 0);
  if (!Number.isFinite(num) || num <= 0) return "—";
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
};

export const extFromName = (name) => {
  const n = String(name || "").toLowerCase().trim();
  const parts = n.split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
};

export const fileIcon = (name, mimeType) => {
  const ext = extFromName(name);
  const mime = String(mimeType || "").toLowerCase();
  if (ext === "pdf" || mime.includes("pdf")) return "PDF";
  if (ext === "pptx") return "PPTX";
  if (ext === "xlsx") return "XLSX";
  if (ext === "docx") return "DOCX";
  if (ext === "zip" || mime.includes("zip")) return "ZIP";
  return "FILE";
};

export const canPreviewInBrowser = (name, mimeType) => {
  const ext = extFromName(name);
  const mime = String(mimeType || "").toLowerCase();
  return ext === "pdf" || mime.includes("pdf");
};

export const getLocalReadCount = (articleId) => {
  try {
    const raw = localStorage.getItem(`article_reads_${articleId}`);
    const count = Number(raw || 0);
    return Number.isFinite(count) ? count : 0;
  } catch {
    return 0;
  }
};

export const incrementLocalReadCount = (articleId) => {
  try {
    const current = getLocalReadCount(articleId);
    localStorage.setItem(`article_reads_${articleId}`, String(current + 1));
  } catch {
    // no-op
  }
};

