import axiosInstance from "./apiClient";
import { API_PATHS } from "./apiPaths";
import {
  isVolleyNativeApp,
  openExternalBrowser,
  requestNativeFcmToken,
} from "./nativeShell";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true
  );
}

export function isInAppBrowser() {
  const ua = navigator.userAgent || "";
  return /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Viber|WhatsApp/i.test(ua);
}

/** True when this browser can run Web Push (Chrome/Safari PWA). Not true inside Android WebView. */
export function pushSupported() {
  return (
    typeof window !== "undefined"
    && window.isSecureContext
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window
  );
}

/** UI can offer push setup (Web Push and/or native shell Chrome/FCM bridge). */
export function pushUiAvailable() {
  return pushSupported() || isVolleyNativeApp();
}

export function pushSetupHint() {
  if (isVolleyNativeApp() && !pushSupported()) {
    return "В приложението известията се включват еднократно през Chrome. После ги получавате както досега (график, такси, новини), докато ползвате app-а.";
  }
  if (!pushSupported()) {
    return "Този браузър не поддържа известия. Опитайте Chrome (Android) или Safari (iPhone).";
  }
  if (isInAppBrowser()) {
    return "Отворете линка в Safari или Chrome (не от Facebook/Viber), после включете известията.";
  }
  if (isIosDevice() && !isStandalonePwa()) {
    return "На iPhone: Safari → Сподели → „Добави на началния екран“ → отворете иконата на екрана → „Включи известия“.";
  }
  return null;
}

function mapSubscribeError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  if (msg.includes("push service error") || msg.includes("registration failed")) {
    if (isIosDevice()) {
      return "На iPhone известията работят най-надеждно след „Добави на началния екран“ (икона на екрана), не от обикновения таб в Safari.";
    }
    if (isInAppBrowser()) {
      return "Отворете сайта в Safari или Chrome, не от вграден браузър в друго приложение.";
    }
    return "Браузърът не успя да се абонира. Опитайте друг браузър или добавете сайта на началния екран.";
  }
  if (msg.includes("failed to register") || msg.includes("serviceworker")) {
    return "Страницата за известия не се зареди. Обновете страницата и опитайте отново.";
  }
  return err?.message || "Неуспешно включване на известията.";
}

function subscribePath(isSession, legacyToken) {
  if (isSession) return API_PATHS.PARENT_PUSH_SUBSCRIBE_ME;
  return API_PATHS.PARENT_PUSH_SUBSCRIBE_TOKEN(legacyToken);
}

function statusPath(isSession, legacyToken) {
  if (isSession) return API_PATHS.PARENT_PUSH_STATUS_ME;
  return API_PATHS.PARENT_PUSH_STATUS_TOKEN(legacyToken);
}

export async function fetchParentPushStatus(isSession, legacyToken) {
  try {
    const res = await axiosInstance.get(statusPath(isSession, legacyToken));
    return res.data || { subscribed: false, push_available: false };
  } catch {
    return { subscribed: false, push_available: false };
  }
}

async function subscribeFcmToken(isSession, legacyToken, token) {
  await axiosInstance.post(subscribePath(isSession, legacyToken), {
    endpoint: `fcm:${token}`,
    keys: { p256dh: "fcm", auth: "fcm" },
  });
  return true;
}

function chromeEnableUrl(isSession, legacyToken) {
  const origin = window.location.origin;
  if (isSession) {
    return `${origin}/parent/portal?enable_push=1`;
  }
  if (legacyToken) {
    return `${origin}/parent/${encodeURIComponent(legacyToken)}?enable_push=1`;
  }
  return `${origin}/parent/login?enable_push=1`;
}

/**
 * Enable push. Prefer in-browser Web Push; then native FCM; then open Chrome once
 * so the same VAPID notifications (schedule, fees, news) keep working.
 */
export async function enableParentPushNotifications(isSession, legacyToken) {
  if (pushSupported()) {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      throw new Error("Разрешението за известия не е дадено.");
    }

    const vapidRes = await axiosInstance.get(API_PATHS.PARENT_PUSH_VAPID);
    const publicKey = String(vapidRes.data?.public_key || "").trim();
    if (!publicKey) {
      throw new Error("Сървърът още не е настроен за известия.");
    }

    let registration;
    try {
      registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    } catch {
      throw new Error("Файлът за известия (sw.js) не се зареди. Обновете страницата.");
    }
    await navigator.serviceWorker.ready;

    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      try {
        await existing.unsubscribe();
      } catch {
        /* ignore */
      }
    }

    let subscription;
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    } catch (err) {
      throw new Error(mapSubscribeError(err));
    }

    const json = subscription.toJSON();
    await axiosInstance.post(subscribePath(isSession, legacyToken), {
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
      },
    });
    return { mode: "webpush" };
  }

  if (isVolleyNativeApp()) {
    const fcmToken = await requestNativeFcmToken();
    if (fcmToken) {
      await subscribeFcmToken(isSession, legacyToken, fcmToken);
      return { mode: "fcm" };
    }
    const opened = openExternalBrowser(chromeEnableUrl(isSession, legacyToken));
    if (!opened) {
      throw new Error("Не можахме да отворим Chrome. Отворете портала в Chrome и включете известията там.");
    }
    const err = new Error(
      "Отворихме Chrome. Натиснете „Включи известия“ там еднократно. След това ще получавате всички известия както досега — и докато ползвате приложението.",
    );
    err.code = "OPENED_CHROME_FOR_PUSH";
    throw err;
  }

  throw new Error(pushSetupHint() || "Браузърът не поддържа известия на този телефон.");
}

function testPath(isSession, legacyToken) {
  if (isSession) return API_PATHS.PARENT_PUSH_TEST_ME;
  return API_PATHS.PARENT_PUSH_TEST_TOKEN(legacyToken);
}

export async function sendParentPushTest(isSession, legacyToken) {
  const res = await axiosInstance.post(testPath(isSession, legacyToken));
  return res.data || { sent: 0, subscriptions: 0, errors: [] };
}

export async function disableParentPushNotifications(isSession, legacyToken) {
  if (pushSupported()) {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const sub = registration ? await registration.pushManager.getSubscription() : null;
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      try {
        await axiosInstance.delete(subscribePath(isSession, legacyToken), {
          params: endpoint ? { endpoint } : undefined,
        });
      } catch {
        /* ignore */
      }
      return;
    }
  }
  // Native shell / already unsubscribed locally — clear server subscriptions for this portal.
  try {
    await axiosInstance.delete(subscribePath(isSession, legacyToken));
  } catch {
    /* ignore */
  }
}

export function shouldAutoEnablePushFromQuery() {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("enable_push") === "1";
  } catch {
    return false;
  }
}

export function clearEnablePushQuery() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("enable_push")) return;
    url.searchParams.delete("enable_push");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* ignore */
  }
}
