// Shared helpers for team chat: volleyball emojis, curated GIFs and body parsing.
// GIF messages are stored as plain text with a "[gif]" prefix so the backend
// needs no changes; the frontend renders them as images.

export const CHAT_EMOJIS = [
  "🏐", "🔥", "💪", "👏", "🙌", "🎉", "👍", "❤️",
  "😄", "😎", "🥇", "🏆", "⭐", "🙏", "👌", "💯",
  "🤝", "⚡", "🫡", "😤",
];

// Curated, key-free volleyball GIFs served by the public Giphy CDN.
// (Loaded via <img>, so Giphy returns the real asset.)
export const CHAT_GIFS = [
  { id: "nD311R972KRsttf3E7", label: "Сервис" },
  { id: "rjUcfJQAOs87js6FAc", label: "Атака" },
  { id: "XdXds38x6m7iVaw7Zv", label: "Забиване" },
  { id: "jrnUOaIp4PaucZsXgy", label: "Удар" },
  { id: "FT3PYRA6hVK1beV18j", label: "Защита" },
  { id: "EKDglW42sWYPY2h4hq", label: "Блок" },
  { id: "Q5ESlvjmFUibsnAHIF", label: "Победа" },
  { id: "DWLhRjPJSKbZ0vFetn", label: "Празник" },
  { id: "wRdgg973o1RDjDc5Pf", label: "Точка" },
];

const GIF_PREFIX = "[gif]";

export const gifFullUrl = (id) => `https://media.giphy.com/media/${id}/giphy.gif`;
export const gifThumbUrl = (id) => `https://media.giphy.com/media/${id}/200w.gif`;
export const buildGifBody = (id) => `${GIF_PREFIX}${gifFullUrl(id)}`;

const GIF_URL_RE = /^https?:\/\/\S+\.gif(\?\S*)?$/i;
const GIF_HOST_RE = /giphy\.com|tenor\.com/i;

export function parseChatBody(body) {
  const raw = (body || "").trim();
  if (raw.startsWith(GIF_PREFIX)) {
    return { type: "gif", url: raw.slice(GIF_PREFIX.length).trim() };
  }
  if (GIF_URL_RE.test(raw) && GIF_HOST_RE.test(raw)) {
    return { type: "gif", url: raw };
  }
  return { type: "text", text: body };
}

export function chatPreview(body) {
  return parseChatBody(body).type === "gif" ? "🎬 GIF" : body;
}
