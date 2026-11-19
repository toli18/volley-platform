/**
 * Save/open a PDF blob for desktop browsers and Capacitor WebViews.
 * Prefer a real file download; use the native Share sheet only inside the app shell.
 */

function isNativeApp() {
  try {
    return Boolean(window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

function isMobileBrowser() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");
}

function triggerAnchorDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function downloadPdfBlob(blob, filename = "document.pdf") {
  if (!(blob instanceof Blob)) {
    throw new Error("Невалиден PDF отговор.");
  }

  const header = await blob.slice(0, 5).text();
  if (!header.startsWith("%PDF")) {
    const err = new Error("PDF не е генериран.");
    err.response = { data: blob };
    throw err;
  }

  const safeName = String(filename || "document.pdf").replace(/[^\w.\-]+/g, "_");
  const typed = blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
  const url = URL.createObjectURL(typed);
  const revokeLater = (ms = 120_000) => setTimeout(() => URL.revokeObjectURL(url), ms);

  // Native app shell: Share sheet is the reliable "Save to Files / Drive" path.
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
      // Fall through to anchor / open.
    }
  }

  // Desktop + mobile browsers: always download via <a download>.
  // Do NOT call navigator.share here - it often swallows the file with no save.
  try {
    triggerAnchorDownload(url, safeName);

    // iOS Safari often ignores the download attribute for blob URLs.
    // Open the PDF viewer as a backup so the coach can share/save from there.
    if (isMobileBrowser() && !isNativeApp()) {
      window.setTimeout(() => {
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (!opened) {
          // Popup blocked: navigate same tab as last resort.
          window.location.assign(url);
        }
      }, 250);
    }

    revokeLater();
    return "downloaded";
  } catch (err) {
    revokeLater(5_000);
    throw err;
  }
}
