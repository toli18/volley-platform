import { isRailwayHost, isVercelHost, PRODUCTION_ORIGIN } from "./productionOrigins";

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
    if (isRailwayHost(host)) {
      return "";
    }

    // Production Vercel mirror → always hit Railway API (even if env was missing at build).
    if (isVercelHost(host) && import.meta.env.PROD) {
      return fromEnv || PRODUCTION_ORIGIN;
    }

    // Block accidental https-page → http://127.0.0.1 (mixed content / dead on device).
    if (fromEnv.startsWith("http://127.") || fromEnv.startsWith("http://localhost")) {
      if (protocol === "https:" || (host && host !== "localhost" && host !== "127.0.0.1")) {
        return PRODUCTION_ORIGIN;
      }
    }
  }

  if (fromEnv) return fromEnv;

  if (import.meta.env.PROD) {
    return PRODUCTION_ORIGIN;
  }

  return "http://127.0.0.1:8000";
}
