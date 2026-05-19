export const PARENT_PORTAL_REFRESH_MSG = "PARENT_PORTAL_REFRESH";

/** Subscribe to SW push-open refresh and ?_sw_refresh= URL param. Returns cleanup. */
export function listenParentPortalRefresh(onRefresh) {
  if (typeof window === "undefined" || typeof onRefresh !== "function") {
    return () => {};
  }

  const onSwMessage = (event) => {
    if (event?.data?.type === PARENT_PORTAL_REFRESH_MSG) onRefresh();
  };

  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("message", onSwMessage);
  }

  return () => {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.removeEventListener("message", onSwMessage);
    }
  };
}

/** If opened from notification with ?_sw_refresh=, strip param and refresh once. */
export function consumeSwRefreshSearchParam(search, onRefresh) {
  const sp = new URLSearchParams(search || "");
  if (!sp.has("_sw_refresh")) return null;
  sp.delete("_sw_refresh");
  onRefresh();
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}
