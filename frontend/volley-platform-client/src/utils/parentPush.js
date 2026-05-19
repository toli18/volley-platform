import axiosInstance from "./apiClient";
import { API_PATHS } from "./apiPaths";

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

export function pushSupported() {
  return (
    typeof window !== "undefined"
    && window.isSecureContext
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window
  );
}

export function pushSetupHint() {
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

export async function enableParentPushNotifications(isSession, legacyToken) {
  const hint = pushSetupHint();
  if (!pushSupported()) {
    throw new Error(hint || "Браузърът не поддържа известия на този телефон.");
  }

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

  return true;
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
  if (!pushSupported()) return;
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
  }
}
