/**
 * Save/open a PDF blob for desktop browsers, Android/iOS browsers, and Capacitor.
 *
 * Android Chrome often ignores <a download> for blob URLs after an async request,
 * and window.open(blob) is blocked once the user gesture is gone. Call
 * openPdfPreviewWindow() synchronously on click, then pass it here.
 */

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
 * Returns a window handle Android/iOS can later navigate to the PDF blob.
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
          '<p style="font-family:sans-serif;padding:16px;color:#334155">Генериране на PDF…</p>';
      } catch {
        /* cross-origin / opaque window — ignore */
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
  a.download = filename;
  a.rel = "noopener";
  a.target = "_blank";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function navigateWindowToPdf(win, url) {
  if (!win || win.closed) return false;
  try {
    win.location.href = url;
    try {
      win.focus();
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    return false;
  }
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

  // Capacitor native: Share sheet is the reliable save path.
  if (isNativeApp()) {
    try {
      const file = new File([typed], safeName, { type: "application/pdf" });
      if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
        if (previewWindow && !previewWindow.closed) previewWindow.close();
        await navigator.share({ files: [file], title: safeName });
        revokeLater();
        return "shared";
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        if (previewWindow && !previewWindow.closed) previewWindow.close();
        revokeLater();
        return "cancelled";
      }
    }
  }

  // Mobile: put the PDF into the pre-opened tab (survives lost user-gesture).
  // User can then use Chrome's Download / Share from the PDF viewer.
  if (previewWindow && !previewWindow.closed) {
    if (navigateWindowToPdf(previewWindow, url)) {
      // Also try download attribute for browsers that honor it.
      try {
        triggerAnchorDownload(url, safeName);
      } catch {
        /* ignore */
      }
      revokeLater();
      return "opened";
    }
  }

  // Desktop (and mobile without preview window): classic download.
  try {
    triggerAnchorDownload(url, safeName);
  } catch {
    /* ignore */
  }

  // Last-resort open if still on mobile and download likely no-op.
  if (isMobileBrowser()) {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      // Same-tab navigation keeps the PDF reachable if popups are blocked.
      window.location.assign(url);
      revokeLater(300_000);
      return "navigated";
    }
    revokeLater();
    return "opened";
  }

  revokeLater();
  return "downloaded";
}
