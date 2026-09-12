const DEFAULT_FALLBACK = "Възникна грешка. Опитайте отново.";

export function isNetworkError(err) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err?.response) return false;
  const code = err?.code || "";
  const msg = String(err?.message || "").toLowerCase();
  return (
    code === "ERR_NETWORK" ||
    code === "ECONNABORTED" ||
    msg.includes("network error") ||
    msg.includes("timeout")
  );
}

function detailFromPayload(data) {
  if (!data || typeof data !== "object") return null;
  const detail = data.detail;
  if (!detail) return null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return null;
        const loc = Array.isArray(item.loc) ? item.loc.filter((x) => x !== "body").join(".") : "";
        const msg = item.msg || item.message || "";
        if (loc && msg) return `${loc}: ${msg}`;
        return msg || null;
      })
      .filter(Boolean);
    return parts.length ? parts.join("; ") : null;
  }
  if (typeof detail === "object") {
    try {
      return JSON.stringify(detail);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Async variant — parses FastAPI JSON errors returned as Blob (axios responseType: blob).
 */
export async function parseApiError(err, fallback = DEFAULT_FALLBACK) {
  const data = err?.response?.data;
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    try {
      const text = await data.text();
      const parsed = JSON.parse(text);
      const fromDetail = detailFromPayload(parsed);
      if (fromDetail) return fromDetail;
    } catch {
      /* not JSON — fall through */
    }
  }
  return normalizeError(err, fallback);
}

/**
 * Turns an axios/fetch error into a human-readable Bulgarian message.
 * Prefers the API's `detail` field (string or FastAPI validation array),
 * then the raw error message, then the provided fallback.
 */
export const normalizeError = (err, fallback = DEFAULT_FALLBACK) => {
  if (isNetworkError(err)) {
    return "Сървърът не отговори. Опитайте отново след минута (или след deploy на Railway).";
  }

  const detail = err?.response?.data?.detail;
  if (!detail) {
    const status = err?.response?.status;
    if (status === 401) return "Сесията е изтекла. Влезте отново.";
    if (status === 403) return "Нямате достъп до тази операция.";
    if (status === 404) return "Записът не е намерен.";
    if (status === 422) return "Проверете попълнените данни.";
    if (status === 502 || status === 503) return "Сървърът е временно недостъпен. Опитайте по-късно.";
    if (status >= 500) return "Грешка на сървъра. Опитайте отново след минута.";
    if (typeof err === "string") return err;
    if (err?.message && !String(err.message).toLowerCase().includes("network error")) {
      return err.message;
    }
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
