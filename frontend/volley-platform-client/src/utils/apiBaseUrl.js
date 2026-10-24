/**
 * Resolve API base URL for axios.
 *
 * Critical: never call http://127.0.0.1 from a phone/browser in production.
 * Railway serves the SPA from the same host as the API — use same-origin "".
 */
export function resolveApiBaseUrl() {
  const fromEnv = String(import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");

  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    const host = String(hostname || "").toLowerCase();

    // Frontend hosted on Railway API host → same origin (avoids stale localhost builds).
    if (host.endsWith(".up.railway.app") || host.endsWith(".railway.app")) {
      return "";
    }

    // Production Vercel → always hit Railway API (even if env was missing at build).
    if (host.endsWith(".vercel.app") && import.meta.env.PROD) {
      return fromEnv || "https://volley-platform-production.up.railway.app";
    }

    // Block accidental https-page → http://127.0.0.1 (mixed content / dead on device).
    if (fromEnv.startsWith("http://127.") || fromEnv.startsWith("http://localhost")) {
      if (protocol === "https:" || (host && host !== "localhost" && host !== "127.0.0.1")) {
        return "https://volley-platform-production.up.railway.app";
      }
    }
  }

  if (fromEnv) return fromEnv;

  if (import.meta.env.PROD) {
    return "https://volley-platform-production.up.railway.app";
  }

  return "http://127.0.0.1:8000";
}
