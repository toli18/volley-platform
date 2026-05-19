const TEAM_ROOM_TOKEN_KEY = "athlete_room_access_token";

export function getTeamRoomToken() {
  return localStorage.getItem(TEAM_ROOM_TOKEN_KEY);
}

export function setTeamRoomToken(token) {
  if (token) localStorage.setItem(TEAM_ROOM_TOKEN_KEY, token);
  else localStorage.removeItem(TEAM_ROOM_TOKEN_KEY);
}

export function clearTeamRoomToken() {
  localStorage.removeItem(TEAM_ROOM_TOKEN_KEY);
}

export function teamRoomLoginPath() {
  return "/room/login";
}

export function teamRoomPortalPath() {
  return "/room/portal";
}

export function teamRoomLoginUrl() {
  if (typeof window === "undefined") return teamRoomLoginPath();
  return `${window.location.origin}${teamRoomLoginPath()}`;
}
