/**
 * Save/open a PDF blob in a way that works on desktop browsers and
 * Capacitor WebViews (iOS/Android), where <a download> is unreliable.
 */
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

  const safeName = String(filename || "document.pdf").replace(/[^\w.\-а-яА-Я]+/gi, "_");
  const typed = blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });

  try {
    const file = new File([typed], safeName, { type: "application/pdf" });
    if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: safeName });
      return "shared";
    }
  } catch (err) {
    // User cancelled share, or share unsupported for this payload — fall through.
    if (err?.name === "AbortError") return "cancelled";
  }

  const url = URL.createObjectURL(typed);
  try {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      const a = document.createElement("a");
      a.href = url;
      a.download = safeName;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return "downloaded";
}
