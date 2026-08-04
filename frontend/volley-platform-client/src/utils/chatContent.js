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
  { id: "Lw4yMNawMopyxEX3iq", label: "България" },
  { id: "GGq6n5aB5jPXqEHDeX", label: "Фен" },
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
export const gifBodyFromUrl = (url) => `${GIF_PREFIX}${url}`;
export const buildGifBody = (id) => gifBodyFromUrl(gifFullUrl(id));

// Optional live GIF search via Tenor (Google). Set VITE_TENOR_KEY to enable.
const TENOR_KEY = import.meta.env.VITE_TENOR_KEY || "";

export const isGifSearchEnabled = () => Boolean(TENOR_KEY);

export async function searchTenorGifs(query, { limit = 24, signal } = {}) {
  const q = (query || "").trim();
  if (!TENOR_KEY || !q) return [];
  const url =
    `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}` +
    `&key=${encodeURIComponent(TENOR_KEY)}&client_key=volleycoach` +
    `&limit=${limit}&media_filter=tinygif,gif&contentfilter=high`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`tenor_${res.status}`);
  const data = await res.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  return results
    .map((r) => {
      const formats = r?.media_formats || {};
      const full = formats.gif?.url || formats.tinygif?.url;
      const thumb = formats.tinygif?.url || formats.gif?.url;
      if (!full) return null;
      return { id: r.id, full, thumb };
    })
    .filter(Boolean);
}

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

/** Match http(s) URLs; trim trailing punctuation often glued to links. */
const URL_RE = /(https?:\/\/[^\s<]+)/gi;

function cleanUrlMatch(raw) {
  let url = String(raw || "");
  let trailing = "";
  while (/[),.!?;:]$/.test(url)) {
    trailing = url.slice(-1) + trailing;
    url = url.slice(0, -1);
  }
  return { url, trailing };
}

/**
 * Split plain chat text into React-safe nodes with clickable links.
 * Returns an array of strings and <a> elements (caller should key if needed).
 */
export function linkifyChatText(text) {
  const raw = String(text ?? "");
  if (!raw) return raw;
  const parts = [];
  let last = 0;
  const re = new RegExp(URL_RE.source, "gi");
  let match;
  let key = 0;
  while ((match = re.exec(raw)) !== null) {
    if (match.index > last) {
      parts.push(raw.slice(last, match.index));
    }
    const { url, trailing } = cleanUrlMatch(match[0]);
    if (url) {
      parts.push({ type: "link", href: url, label: url, key: `l${key++}` });
    }
    if (trailing) parts.push(trailing);
    last = match.index + match[0].length;
  }
  if (last < raw.length) parts.push(raw.slice(last));
  return parts.length ? parts : [raw];
}

export function chatPreview(body) {
  return parseChatBody(body).type === "gif" ? "🎬 GIF" : body;
}
