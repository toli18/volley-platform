const escapeHtml = (raw) =>
  String(raw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const stripTags = (raw) => String(raw || "").replace(/<[^>]*>/g, "");

const linkify = (raw) =>
  raw.replace(
    /(https?:\/\/[^\s<]+)/gi,
    '<a href="$1" target="_blank" rel="noreferrer">$1</a>'
  );

const sanitizeHtml = (raw) => {
  let safe = String(raw || "");
  safe = safe.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  safe = safe.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  safe = safe.replace(/\son\w+="[^"]*"/gi, "");
  safe = safe.replace(/\son\w+='[^']*'/gi, "");
  safe = safe.replace(/\son\w+=\S+/gi, "");
  safe = safe.replace(/javascript:/gi, "");
  return safe;
};

const withHeadingIds = (html) => {
  let index = 0;
  return String(html || "").replace(/<(h2|h3)([^>]*)>/gi, (_m, tag, attrs) => {
    if (/\sid=/i.test(attrs || "")) return `<${tag}${attrs}>`;
    index += 1;
    return `<${tag}${attrs} id="sec-${index}">`;
  });
};

const markdownToHtml = (raw) => {
  const lines = String(raw || "").split("\n");
  const out = [];
  let listBuffer = [];

  const flushList = () => {
    if (!listBuffer.length) return;
    out.push(`<ul>${listBuffer.map((x) => `<li>${x}</li>`).join("")}</ul>`);
    listBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushList();
      out.push(`<h2>${escapeHtml(trimmed.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }
    if (trimmed.startsWith("### ")) {
      flushList();
      out.push(`<h3>${escapeHtml(trimmed.replace(/^###\s+/, ""))}</h3>`);
      continue;
    }
    if (trimmed.startsWith("> ")) {
      flushList();
      out.push(`<blockquote>${linkify(escapeHtml(trimmed.replace(/^>\s+/, "")))}</blockquote>`);
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      listBuffer.push(linkify(escapeHtml(trimmed.replace(/^[-*]\s+/, ""))));
      continue;
    }
    flushList();
    out.push(`<p>${linkify(escapeHtml(trimmed))}</p>`);
  }
  flushList();
  return out.join("");
};

const hasHtml = (raw) => /<\/?[a-z][\s\S]*>/i.test(String(raw || ""));

export const toDisplayHtml = (raw) => {
  if (!raw) return "";
  if (hasHtml(raw)) return withHeadingIds(sanitizeHtml(String(raw)));
  return withHeadingIds(markdownToHtml(raw));
};

export const extractTocItems = (raw) => {
  const source = String(raw || "");
  if (!source.trim()) return [];

  if (hasHtml(source)) {
    const safe = sanitizeHtml(source);
    const items = [];
    const regex = /<(h2|h3)[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;
    while ((match = regex.exec(safe)) !== null) {
      const label = stripTags(match[2]).trim();
      if (label) items.push(label);
    }
    return items;
  }

  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("## ") || line.startsWith("### "))
    .map((line) => line.replace(/^#{2,3}\s+/, "").trim())
    .filter(Boolean);
};

export const toPlainTextSnippet = (raw, max = 240) => {
  const text = stripTags(String(raw || "")).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
};

