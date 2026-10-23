import axiosInstance from "./apiClient";
import { API_PATHS } from "./apiPaths";
import {
  isInAppBrowser,
  isIosDevice,
  isStandalonePwa,
  pushSetupHint,
  pushSupported,
  pushUiAvailable,
} from "./parentPush";
import {
  isVolleyNativeApp,
  openExternalBrowser,
  requestNativeFcmToken,
} from "./nativeShell";

export {
  isInAppBrowser,
  isIosDevice,
  isStandalonePwa,
  pushSetupHint,
  pushSupported,
  pushUiAvailable,
};

function mapSubscribeError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  if (msg.includes("push service error") || msg.includes("registration failed")) {
    if (isIosDevice()) {
      return "На iPhone известията работят най-надеждно след „Добави на началния екран“, после отворете иконата.";
    }
    if (isInAppBrowser()) {
      return "Отворете сайта в Safari или Chrome, не от вграден браузър.";
    }
    return "Браузърът не успя да се абонира. Опитайте друг браузър или добавете на началния екран.";
  }
  return err?.message || "Неуспешно включване на известията.";
}

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

export async function fetchTeamRoomPushStatus() {
  try {
    const res = await axiosInstance.get(API_PATHS.ATHLETE_ROOM_PUSH_STATUS_ME);
    return res.data || { subscribed: false, push_available: false };
  } catch {
    return { subscribed: false, push_available: false };
  }
}

export async function enableTeamRoomPushNotifications() {
  if (pushSupported()) {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      throw new Error("Разрешението за известия не е дадено.");
    }
    const vapidRes = await axiosInstance.get(API_PATHS.ATHLETE_ROOM_PUSH_VAPID);
    const publicKey = String(vapidRes.data?.public_key || "").trim();
    if (!publicKey) {
      throw new Error("Сървърът още не е настроен за известия.");
    }
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
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
    await axiosInstance.post(API_PATHS.ATHLETE_ROOM_PUSH_SUBSCRIBE_ME, {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    });
    return { mode: "webpush" };
  }

  if (isVolleyNativeApp()) {
    const fcmToken = await requestNativeFcmToken();
    if (fcmToken) {
      await axiosInstance.post(API_PATHS.ATHLETE_ROOM_PUSH_SUBSCRIBE_ME, {
        endpoint: `fcm:${fcmToken}`,
        keys: { p256dh: "fcm", auth: "fcm" },
      });
      return { mode: "fcm" };
    }
    const opened = openExternalBrowser(`${window.location.origin}/room/portal?enable_push=1`);
    if (!opened) {
      throw new Error("Не можахме да отворим Chrome. Отворете стаята в Chrome и включете известията.");
    }
    const err = new Error(
      "Отворихме Chrome. Включете известията там еднократно — после ги получавате както досега, докато ползвате приложението.",
    );
    err.code = "OPENED_CHROME_FOR_PUSH";
    throw err;
  }

  throw new Error(pushSetupHint() || "Браузърът не поддържа известия.");
}

export async function disableTeamRoomPushNotifications() {
  if (pushSupported()) {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const sub = registration ? await registration.pushManager.getSubscription() : null;
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      try {
        await axiosInstance.delete(API_PATHS.ATHLETE_ROOM_PUSH_SUBSCRIBE_ME, {
          params: endpoint ? { endpoint } : undefined,
        });
      } catch {
        /* ignore */
      }
      return;
    }
  }
  try {
    await axiosInstance.delete(API_PATHS.ATHLETE_ROOM_PUSH_SUBSCRIBE_ME);
  } catch {
    /* ignore */
  }
}

export async function sendTeamRoomPushTest() {
  const res = await axiosInstance.post(API_PATHS.ATHLETE_ROOM_PUSH_TEST_ME);
  return res.data || { sent: 0, subscriptions: 0, errors: [] };
}
