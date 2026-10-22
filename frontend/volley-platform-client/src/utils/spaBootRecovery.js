/**
 * Recover from blank white screens after deploy when a tab still holds a stale
 * index.html / chunk hash (common on Vercel + mobile Safari/Chrome).
 */

const RELOAD_KEY = "vp-spa-boot-reload-once";

function alreadyReloaded() {
  try {
    return sessionStorage.getItem(RELOAD_KEY) === "1";
  } catch {
    return false;
  }
}

function markReloaded() {
  try {
    sessionStorage.setItem(RELOAD_KEY, "1");
  } catch {
    /* ignore */
  }
}

function clearReloadMark() {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* ignore */
  }
}

export async function clearSpaClientCaches() {
  const jobs = [];
  if (typeof caches !== "undefined" && caches?.keys) {
    jobs.push(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).catch(() => {})
    );
  }
  if (typeof navigator !== "undefined" && navigator.serviceWorker?.getRegistrations) {
    jobs.push(
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {})
    );
  }
  await Promise.all(jobs);
}

export async function recoverStaleSpaBoot(reason = "stale-chunk") {
  if (typeof window === "undefined") return false;
  if (alreadyReloaded()) {
    clearReloadMark();
    return false;
  }
  markReloaded();
  try {
    await clearSpaClientCaches();
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_spa", String(Date.now()));
  // Keep a breadcrumb for support without breaking auth routes.
  url.searchParams.set("_recover", String(reason).slice(0, 40));
  window.location.replace(url.toString());
  return true;
}

export function installSpaBootRecovery() {
  if (typeof window === "undefined") return;

  const reloadOnce = (reason) => {
    void recoverStaleSpaBoot(reason);
  };

  window.addEventListener("vite:preloadError", (event) => {
    try {
      event.preventDefault();
    } catch {
      /* ignore */
    }
    reloadOnce("vite-preload");
  });

  window.addEventListener("unhandledrejection", (event) => {
    const message = String(event?.reason?.message || event?.reason || "");
    if (
      message.includes("Failed to fetch dynamically imported module") ||
      message.includes("Importing a module script failed") ||
      message.includes("error loading dynamically imported module")
    ) {
      try {
        event.preventDefault();
      } catch {
        /* ignore */
      }
      reloadOnce("dynamic-import");
    }
  });

  window.addEventListener(
    "error",
    (event) => {
      const target = event?.target;
      const tag = target && target.tagName ? String(target.tagName).toLowerCase() : "";
      if (tag === "script" || tag === "link") {
        const src = String(target.src || target.href || "");
        if (src.includes("/assets/")) {
          reloadOnce("asset-error");
        }
      }
    },
    true
  );
}
