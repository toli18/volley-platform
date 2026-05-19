import { axiosInstance } from "./apiClient";

export function resolveMediaUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (u.toLowerCase() === "няма данни" || u.toLowerCase() === "n/a") return "";
  if (u.startsWith("/")) {
    const base = axiosInstance?.defaults?.baseURL || "";
    return `${base}${u}`;
  }
  return u;
}

export function isDirectVideoUrl(url) {
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(String(url || ""));
}

export function isImageUrl(url) {
  return /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(String(url || ""));
}

export function isProbablyUrl(s) {
  const t = String(s || "").trim();
  if (!t || t.toLowerCase() === "няма данни") return false;
  return t.startsWith("http://") || t.startsWith("https://") || t.startsWith("/");
}

export function normalizeToArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return [];
    const lower = t.toLowerCase();
    if (lower === "няма данни" || lower === "n/a" || lower === "none") return [];
    if ((t.startsWith("[") && t.endsWith("]")) || (t.startsWith("{") && t.endsWith("}"))) {
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) return parsed.map(String).map((s) => s.trim()).filter(Boolean);
      } catch {
        // ignore
      }
    }
    if (t.includes("\n")) return t.split("\n").map((s) => s.trim()).filter(Boolean);
    if (t.includes(",")) return t.split(",").map((s) => s.trim()).filter(Boolean);
    return [t];
  }
  return [];
}

export function getYoutubeEmbedUrl(url) {
  const u = String(url || "");
  const mShort = u.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
  if (mShort?.[1]) return `https://www.youtube.com/embed/${mShort[1]}`;
  const mWatch = u.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  if (mWatch?.[1]) return `https://www.youtube.com/embed/${mWatch[1]}`;
  const mEmbed = u.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/);
  if (mEmbed?.[1]) return `https://www.youtube.com/embed/${mEmbed[1]}`;
  const mShorts = u.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/);
  if (mShorts?.[1]) return `https://www.youtube.com/embed/${mShorts[1]}`;
  return null;
}

export function getVimeoEmbedUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("vimeo.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const id = parts.find((p) => /^\d+$/.test(p));
    return id ? `https://player.vimeo.com/video/${id}` : null;
  } catch {
    const m = String(url || "").match(/vimeo\.com\/(\d{6,})/);
    return m?.[1] ? `https://player.vimeo.com/video/${m[1]}` : null;
  }
}

export function getGoogleDriveFileId(url) {
  const u = String(url || "");
  const mFile = u.match(/\/file\/d\/([^/]+)/);
  if (mFile?.[1]) return mFile[1];
  const mOpen = u.match(/[?&]id=([^&]+)/);
  if (mOpen?.[1]) return mOpen[1];
  return null;
}

export function getGoogleDrivePreviewUrl(url) {
  const id = getGoogleDriveFileId(url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}

export function getGoogleDriveEmbedCandidates(fileId, originalUrl) {
  if (!fileId) return [];
  const preview = getGoogleDrivePreviewUrl(originalUrl);
  const candidates = [
    preview,
    `https://drive.google.com/file/d/${fileId}/view`,
    originalUrl,
  ].filter(Boolean);
  return [...new Set(candidates)];
}

/** Direct stream candidates for HTML5 video (file must be shared: anyone with the link). */
export function getGoogleDriveStreamUrls(fileId) {
  if (!fileId) return [];
  return [
    `https://drive.google.com/uc?export=view&id=${fileId}`,
    `https://drive.google.com/uc?export=download&id=${fileId}`,
    `https://drive.google.com/uc?export=preview&id=${fileId}`,
    `https://drive.google.com/uc?id=${fileId}&export=download&confirm=t`,
  ];
}

export function normalizeDropboxUrl(url) {
  try {
    const urlObj = new URL(url);
    if (!urlObj.hostname.includes("dropbox.com")) return url;
    urlObj.searchParams.delete("dl");
    urlObj.searchParams.set("raw", "1");
    return urlObj.toString();
  } catch {
    return url;
  }
}

/**
 * @returns {{
 *   kind: string,
 *   label: string,
 *   embedSrc: string|null,
 *   streamSrcs: string[],
 *   original: string
 * }}
 */
export function parseVideoUrl(rawUrl) {
  const original = resolveMediaUrl(rawUrl);
  if (!original) return null;

  const yt = getYoutubeEmbedUrl(original);
  if (yt) {
    return { kind: "youtube", label: "YouTube", embedSrc: yt, streamSrcs: [], original };
  }

  const vm = getVimeoEmbedUrl(original);
  if (vm) {
    return { kind: "vimeo", label: "Vimeo", embedSrc: vm, streamSrcs: [], original };
  }

  if (isDirectVideoUrl(original)) {
    return { kind: "file", label: "Видео файл", embedSrc: original, streamSrcs: [original], original };
  }

  const driveId = getGoogleDriveFileId(original);
  const drivePreview = driveId ? getGoogleDrivePreviewUrl(original) : null;
  if (drivePreview) {
    const embedCandidates = getGoogleDriveEmbedCandidates(driveId, original);
    return {
      kind: "drive",
      label: "Google Drive",
      embedSrc: embedCandidates[0],
      embedCandidates,
      streamSrcs: getGoogleDriveStreamUrls(driveId),
      original,
    };
  }

  if (original.includes("dropbox.com")) {
    const direct = normalizeDropboxUrl(original);
    return {
      kind: "dropbox",
      label: "Dropbox",
      embedSrc: direct,
      streamSrcs: [direct],
      original,
    };
  }

  return {
    kind: "external",
    label: "Видео линк",
    embedSrc: original,
    streamSrcs: [original],
    original,
  };
}

function collectFieldArray(drill, keys) {
  const out = [];
  for (const key of keys) {
    out.push(...normalizeToArray(drill?.[key]));
  }
  return out;
}

export function collectDrillMedia(drill) {
  const imageCandidates = collectFieldArray(drill, [
    "image_urls",
    "images",
    "image_url",
    "image",
    "thumbnail_url",
  ]);
  const videoCandidates = collectFieldArray(drill, [
    "video_urls",
    "videos",
    "video_url",
    "video",
    "media_url",
    "media_urls",
  ]);

  const imagesFiltered = imageCandidates
    .filter(isProbablyUrl)
    .map(resolveMediaUrl)
    .filter((x) => x && !isDirectVideoUrl(x))
    .filter(Boolean);

  const videosRaw = videoCandidates
    .filter(isProbablyUrl)
    .map(resolveMediaUrl)
    .filter((x) => x && !isImageUrl(x))
    .filter(Boolean);

  const videoItems = [];
  const seen = new Set();
  for (const url of videosRaw) {
    const parsed = parseVideoUrl(url);
    if (!parsed) continue;
    const key = parsed.original;
    if (seen.has(key)) continue;
    seen.add(key);
    videoItems.push(parsed);
  }

  const seenImg = new Set();
  const dedupedImages = imagesFiltered.filter((x) => (seenImg.has(x) ? false : (seenImg.add(x), true)));

  return { images: dedupedImages, videoItems };
}

export function getDrillPrimaryMedia(drill) {
  const { images, videoItems } = collectDrillMedia(drill || {});
  if (images.length > 0) return { type: "image", src: images[0] };
  if (videoItems.length > 0) return { type: "video", src: videoItems[0].embedSrc || videoItems[0].original };
  return null;
}
