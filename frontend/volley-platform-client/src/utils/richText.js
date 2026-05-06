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

const isDirectImageUrl = (url) =>
  /^https?:\/\/[^\s]+?\.(?:png|jpe?g|gif|webp|bmp|svg|avif)(?:\?[^\s]*)?$/i.test(
    String(url || "").trim()
  );

const normalizeImgurUrl = (url) => {
  const text = String(url || "").trim();
  const direct = text.match(
    /^https?:\/\/i\.imgur\.com\/([a-zA-Z0-9]+)(\.[a-zA-Z0-9]+)?(?:\?[^\s]*)?$/i
  );
  if (direct) {
    if (direct[2]) return text;
    return `https://i.imgur.com/${direct[1]}.jpg`;
  }
  const short = text.match(/^https?:\/\/(?:www\.)?imgur\.com\/([a-zA-Z0-9]+)(?:\?[^\s]*)?$/i);
  if (short) return `https://i.imgur.com/${short[1]}.jpg`;
  const gallery = text.match(/^https?:\/\/(?:www\.)?imgur\.com\/gallery\/([a-zA-Z0-9]+)(?:\?[^\s]*)?$/i);
  if (gallery) return `https://i.imgur.com/${gallery[1]}.jpg`;
  return text;
};

export const toEmbeddableImageUrl = (rawUrl) => {
  const normalized = normalizeImgurUrl(rawUrl);
  if (isDirectImageUrl(normalized)) return normalized;
  return null;
};

const normalizeHtmlImageSources = (html) =>
  String(html || "").replace(/<img\b([^>]*?)\bsrc=(["'])(.*?)\2([^>]*)>/gi, (_m, before, quote, src, after) => {
    const rawSrc = String(src || "").trim();
    if (!rawSrc) return `<img${before}src=${quote}${rawSrc}${quote}${after}>`;
    if (rawSrc.startsWith("/")) return `<img${before}src=${quote}${rawSrc}${quote}${after}>`;
    const embeddable = toEmbeddableImageUrl(rawSrc);
    const finalSrc = embeddable || rawSrc;
    return `<img${before}src=${quote}${finalSrc}${quote}${after}>`;
  });

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
    const markdownImage = trimmed.match(/^!\[(.*?)\]\((https?:\/\/[^\s)]+)\)$/i);
    if (markdownImage) {
      flushList();
      const alt = escapeHtml(markdownImage[1] || "Снимка");
      const imageUrl = toEmbeddableImageUrl(markdownImage[2]);
      if (imageUrl) {
        out.push(
          `<p><img src="${escapeHtml(
            imageUrl
          )}" alt="${alt}" style="max-width:100%;height:auto;border-radius:8px;" /></p>`
        );
      } else {
        out.push(`<p>${linkify(escapeHtml(trimmed))}</p>`);
      }
      continue;
    }
    const imageOnlyUrl = toEmbeddableImageUrl(trimmed);
    if (imageOnlyUrl) {
      flushList();
      out.push(
        `<p><img src="${escapeHtml(
          imageOnlyUrl
        )}" alt="Снимка" style="max-width:100%;height:auto;border-radius:8px;" /></p>`
      );
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
  if (hasHtml(raw)) return withHeadingIds(normalizeHtmlImageSources(sanitizeHtml(String(raw))));
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

const compactWhitespace = (raw) =>
  String(raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

export const normalizePastedHtmlFragment = (raw) => {
  if (!raw) return "";
  let safe = sanitizeHtml(String(raw));

  // Remove common Word/Docs leftovers while preserving readable structure.
  safe = safe.replace(/<!--[\s\S]*?-->/g, "");
  safe = safe.replace(/<o:p>\s*<\/o:p>/gi, "");
  safe = safe.replace(/\sclass="[^"]*"/gi, "");
  safe = safe.replace(/\sid="[^"]*"/gi, "");
  safe = safe.replace(/\sstyle="[^"]*mso-[^"]*"/gi, "");
  safe = safe.replace(/<(\/?)h1\b/gi, "<$1h2");
  safe = safe.replace(/<(\/?)h4\b/gi, "<$1h3");
  safe = safe.replace(/<(\/?)h5\b/gi, "<$1h3");
  safe = safe.replace(/<(\/?)h6\b/gi, "<$1h3");
  safe = safe.replace(/<(\/?)div\b/gi, "<$1p");

  return compactWhitespace(normalizeHtmlImageSources(safe)).trim();
};

