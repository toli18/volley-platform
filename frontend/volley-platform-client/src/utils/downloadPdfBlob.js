/**
 * Save/open a PDF for desktop browsers, Android/iOS browsers, and Capacitor.
 *
 * Android Chrome ignores hidden-iframe PDF navigations. Mobile must open a
 * real top-level tab (synchronously on click), then navigate it to an HTTPS
 * download URL after the async generate call.
 */

import { resolveApiBaseUrl } from "./apiBaseUrl";

export function isNativeApp() {
  try {
    return Boolean(window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export function isMobileBrowser() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");
}

/**
 * Must run synchronously inside the click handler (before any await).
 * Returns a window handle Android can later navigate to the HTTPS PDF URL.
 */
export function openPdfPreviewWindow() {
  if (typeof window === "undefined") return null;
  if (!isMobileBrowser() && !isNativeApp()) return null;
  try {
    const w = window.open("about:blank", "_blank");
    if (w) {
      try {
        w.document.title = "Тимов лист…";
        w.document.body.innerHTML =
          '<p style="font-family:system-ui,sans-serif;padding:20px;color:#334155;font-size:16px">Генериране на PDF…</p>';
      } catch {
        /* ignore */
      }
    }
    return w;
  } catch {
    return null;
  }
}

function triggerAnchorDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  if (filename) a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function absoluteApiUrl(pathOrUrl) {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = String(resolveApiBaseUrl() || "").replace(/\/+$/, "");
  if (base) return `${base}${raw.startsWith("/") ? raw : `/${raw}`}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${raw.startsWith("/") ? raw : `/${raw}`}`;
  }
  return raw;
}

/**
 * Navigate a pre-opened window to a same-origin HTTPS download URL.
 * One navigation only (no iframe + anchor double-hit).
 */
export function navigateToHttpsDownload(pathOrUrl, options = {}) {
  const url = absoluteApiUrl(pathOrUrl);
  if (!url) throw new Error("Липсва линк за изтегляне.");

  const previewWindow = options.previewWindow || null;
  const filename = String(options.filename || "document.pdf").replace(/[^\w.\-]+/g, "_");

  if (previewWindow && !previewWindow.closed) {
    try {
      previewWindow.location.replace(url);
      try {
        previewWindow.focus();
      } catch {
        /* ignore */
      }
      return "opened";
    } catch {
      /* fall through */
    }
  }

  // Popup blocked: same-tab navigation still triggers Android download for attachment.
  try {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) return "opened";
  } catch {
    /* ignore */
  }

  try {
    triggerAnchorDownload(url, filename);
    return "downloaded";
  } catch {
    window.location.assign(url);
    return "navigated";
  }
}

/** @deprecated Use navigateToHttpsDownload */
export function downloadViaHttpsUrl(pathOrUrl, filename = "document.pdf") {
  return navigateToHttpsDownload(pathOrUrl, { filename });
}

export async function downloadPdfBlob(blob, filename = "document.pdf", options = {}) {
  const previewWindow = options.previewWindow || null;

  if (!(blob instanceof Blob)) {
    if (previewWindow && !previewWindow.closed) previewWindow.close();
    throw new Error("Невалиден PDF отговор.");
  }

  const header = await blob.slice(0, 5).text();
  if (!header.startsWith("%PDF")) {
    if (previewWindow && !previewWindow.closed) previewWindow.close();
    const err = new Error("PDF не е генериран.");
    err.response = { data: blob };
    throw err;
  }

  const safeName = String(filename || "document.pdf").replace(/[^\w.\-]+/g, "_");
  const typed = blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
  const url = URL.createObjectURL(typed);
  const revokeLater = (ms = 180_000) => setTimeout(() => URL.revokeObjectURL(url), ms);

  if (previewWindow && !previewWindow.closed) {
    try {
      previewWindow.close();
    } catch {
      /* ignore */
    }
  }

  if (isNativeApp()) {
    try {
      const file = new File([typed], safeName, { type: "application/pdf" });
      if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: safeName });
        revokeLater();
        return "shared";
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        revokeLater();
        return "cancelled";
      }
    }
  }

  try {
    triggerAnchorDownload(url, safeName);
  } catch {
    /* ignore */
  }

  revokeLater();
  return "downloaded";
}
