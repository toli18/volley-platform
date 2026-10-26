/**
 * Canonical production host: SPA + API on the same origin (Railway).
 * Vercel remains a mirror only — never the sole path for parent/kid login.
 */
export const PRODUCTION_ORIGIN = "https://volley-platform-production.up.railway.app";
export const MIRROR_ORIGIN = "https://volley-platform-bul.vercel.app";
export const LEGACY_MIRROR_ORIGIN = "https://volley-platform.vercel.app";

export const PRODUCTION_HOSTS = new Set([
  "volley-platform-production.up.railway.app",
  "volley-platform-bul.vercel.app",
  "volley-platform.vercel.app",
]);

/** Same path/query on the canonical Railway origin (for failover from Vercel). */
export function railwayMirrorUrl(href = typeof window !== "undefined" ? window.location.href : "/") {
  try {
    const u = new URL(href, PRODUCTION_ORIGIN);
    return `${PRODUCTION_ORIGIN}${u.pathname}${u.search}${u.hash}`;
  } catch {
    return `${PRODUCTION_ORIGIN}/`;
  }
}

export function isVercelHost(hostname) {
  return String(hostname || "")
    .toLowerCase()
    .endsWith(".vercel.app");
}

export function isRailwayHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  return h.endsWith(".up.railway.app") || h.endsWith(".railway.app");
}
