/* Parent portal — Web Push service worker */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Volley Coach Platform";
  const options = {
    body: data.body || "",
    icon: "/bfvb-logo.png",
    badge: "/bfvb-logo.png",
    data: { url: data.url || "/parent/portal" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/parent/portal";
  const base = target.startsWith("http") ? new URL(target) : new URL(target, self.location.origin);
  base.searchParams.set("_sw_refresh", String(Date.now()));
  const url = base.href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (!client.url || !client.url.includes("/parent")) continue;
        try {
          client.postMessage({ type: "PARENT_PORTAL_REFRESH" });
        } catch {
          /* ignore */
        }
        if ("navigate" in client) {
          return client
            .navigate(url)
            .then(() => ("focus" in client ? client.focus() : undefined))
            .catch(() => ("focus" in client ? client.focus() : undefined));
        }
        if ("focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    }),
  );
});
