const KEY = "team_room_push_hint_seen";

export function shouldAutoOpenTeamRoomPushHint() {
  try {
    return localStorage.getItem(KEY) !== "1";
  } catch {
    return false;
  }
}

export function markTeamRoomPushHintSeen() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
}
