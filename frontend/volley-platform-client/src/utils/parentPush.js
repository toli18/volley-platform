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

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
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
  if (!pushSupported()) {
    throw new Error("Браузърът не поддържа известия на този телефон.");
  }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    throw new Error("Разрешението за известия не е дадено.");
  }

  const vapidRes = await axiosInstance.get(API_PATHS.PARENT_PUSH_VAPID);
  const publicKey = vapidRes.data?.public_key;
  if (!publicKey) {
    throw new Error("Сървърът още не е настроен за известия.");
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    try {
      await existing.unsubscribe();
    } catch {
      /* ignore */
    }
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

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
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
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
