import { resolveApiBaseUrl } from "./apiBaseUrl";

const API_BASE_URL = resolveApiBaseUrl();

export function resolveStaticUrl(path) {
  if (!path) return "";
  if (String(path).startsWith("http://") || String(path).startsWith("https://")) return path;
  const base = API_BASE_URL.replace(/\/$/, "");
  const p = String(path).startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
