const DEFAULT_FALLBACK = "Възникна грешка. Опитайте отново.";

/**
 * Turns an axios/fetch error into a human-readable Bulgarian message.
 * Prefers the API's `detail` field (string or FastAPI validation array),
 * then the raw error message, then the provided fallback.
 */
export const normalizeError = (err, fallback = DEFAULT_FALLBACK) => {
  const detail = err?.response?.data?.detail;
  if (!detail) {
    if (typeof err === "string") return err;
    if (err?.message) return err.message;
    return fallback;
  }
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return null;
        const loc = Array.isArray(item.loc)
          ? item.loc.filter((x) => x !== "body").join(".")
          : "";
        const msg = item.msg || item.message || "";
        if (loc && msg) return `${loc}: ${msg}`;
        return msg || null;
      })
      .filter(Boolean);
    return parts.length ? parts.join("; ") : fallback;
  }
  if (typeof detail === "object") {
    try {
      return JSON.stringify(detail);
    } catch {
      return fallback;
    }
  }
  return fallback;
};

export default normalizeError;
