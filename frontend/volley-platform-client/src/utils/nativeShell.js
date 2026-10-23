/**
 * Helpers for the Volley Coach BUL Android/iOS WebView shell.
 * Web Push API is not available inside Android WebView — use Chrome once,
 * or native FCM when VolleyNative.requestFcmToken is present.
 */

export function isVolleyNativeApp() {
  if (typeof window === "undefined") return false;
  if (window.VolleyNative && typeof window.VolleyNative.openExternal === "function") {
    return true;
  }
  return /VolleyCoachBULApp/i.test(navigator.userAgent || "");
}

export function openExternalBrowser(url) {
  if (!url) return false;
  try {
    if (window.VolleyNative && typeof window.VolleyNative.openExternal === "function") {
      window.VolleyNative.openExternal(String(url));
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}

/**
 * Promise wrapper around Android JS bridge callback for FCM token.
 * Resolves to token string or null.
 */
export function requestNativeFcmToken() {
  return new Promise((resolve) => {
    const bridge = typeof window !== "undefined" ? window.VolleyNative : null;
    if (!bridge || typeof bridge.requestFcmToken !== "function") {
      resolve(null);
      return;
    }
    const callbackId = `fcm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timeout = window.setTimeout(() => {
      cleanup();
      resolve(null);
    }, 12000);
    const handler = (id, token) => {
      if (id !== callbackId) return;
      cleanup();
      resolve(token ? String(token) : null);
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      if (window.__volleyNativeCb === handler) {
        try {
          delete window.__volleyNativeCb;
        } catch {
          window.__volleyNativeCb = undefined;
        }
      }
    };
    window.__volleyNativeCb = handler;
    try {
      bridge.requestFcmToken(callbackId);
    } catch {
      cleanup();
      resolve(null);
    }
  });
}
