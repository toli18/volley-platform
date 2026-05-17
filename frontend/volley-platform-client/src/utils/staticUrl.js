const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export function resolveStaticUrl(path) {
  if (!path) return "";
  if (String(path).startsWith("http://") || String(path).startsWith("https://")) return path;
  const base = API_BASE_URL.replace(/\/$/, "");
  const p = String(path).startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
