export const TEAM_ROOM_REFRESH_MSG = "TEAM_ROOM_REFRESH";

export function listenTeamRoomRefresh(onRefresh) {
  if (typeof window === "undefined" || typeof onRefresh !== "function") {
    return () => {};
  }
  const onSwMessage = (event) => {
    if (event?.data?.type === TEAM_ROOM_REFRESH_MSG) onRefresh();
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

export function consumeSwRefreshSearchParam(search, onRefresh) {
  const sp = new URLSearchParams(search || "");
  if (!sp.has("_sw_refresh")) return null;
  sp.delete("_sw_refresh");
  onRefresh();
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}
