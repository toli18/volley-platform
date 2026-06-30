const DEFAULT_FALLBACK = "Възникна грешка. Опитайте отново.";

/**
 * Turns an axios/fetch error into a human-readable Bulgarian message.
 * Prefers the API's `detail` field (string or FastAPI validation array),
 * then the raw error message, then the provided fallback.
 */
export const normalizeError = (err, fallback = DEFAULT_FALLBACK) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || fallback;
  return fallback;
};

export default normalizeError;
