/**
 * Save/open a PDF for desktop browsers, Android/iOS browsers, and Capacitor.
 *
 * Mobile browsers often ignore <a download> for blob: URLs after an async
 * request. Prefer downloadViaHttpsUrl() with a same-origin attachment link.
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

/** @deprecated Prefer downloadViaHttpsUrl on mobile; kept for rare callers. */
export function openPdfPreviewWindow() {
  return null;
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

function absoluteApiUrl(pathOrUrl) {
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
 * Download via a real HTTPS URL with Content-Disposition: attachment.
 * Uses a hidden iframe so Android Chrome saves the file without a white tab.
 */
export function downloadViaHttpsUrl(pathOrUrl, filename = "document.pdf") {
  const url = absoluteApiUrl(pathOrUrl);
  if (!url) throw new Error("Липсва линк за изтегляне.");

  const safeName = String(filename || "document.pdf").replace(/[^\w.\-]+/g, "_");

  // Same-origin attachment: hidden iframe is the most reliable on Android WebView/Chrome.
  try {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;width:0;height:0;border:0;left:-9999px;top:-9999px;opacity:0";
    iframe.src = url;
    document.body.appendChild(iframe);
    window.setTimeout(() => {
      try {
        iframe.remove();
      } catch {
        /* ignore */
      }
    }, 120_000);
  } catch {
    /* fall through to anchor */
  }

  try {
    triggerAnchorDownload(url, safeName);
  } catch {
    /* ignore */
  }

  return "downloaded";
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

  // Capacitor native: Share sheet is the reliable save path.
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

  // Desktop (and fallback): classic download via blob URL + download attribute.
  try {
    triggerAnchorDownload(url, safeName);
  } catch {
    /* ignore */
  }

  revokeLater();
  return "downloaded";
}
