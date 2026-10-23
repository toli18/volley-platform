/**
 * Remembers which portal was last used on this device so /app (and the
 * native shell) can reopen that session instead of the login chooser.
 */
const LAST_PORTAL_KEY = "vp_last_portal";

export const PORTAL_COACH = "coach";
export const PORTAL_PARENT = "parent";
export const PORTAL_ROOM = "room";

export function getLastPortal() {
  try {
    const v = localStorage.getItem(LAST_PORTAL_KEY);
    if (v === PORTAL_COACH || v === PORTAL_PARENT || v === PORTAL_ROOM) return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function setLastPortal(kind) {
  try {
    if (kind === PORTAL_COACH || kind === PORTAL_PARENT || kind === PORTAL_ROOM) {
      localStorage.setItem(LAST_PORTAL_KEY, kind);
      return;
    }
    localStorage.removeItem(LAST_PORTAL_KEY);
  } catch {
    /* ignore */
  }
}

export function clearLastPortal() {
  try {
    localStorage.removeItem(LAST_PORTAL_KEY);
  } catch {
    /* ignore */
  }
}

/** Path to reopen for a portal kind, or null if no token for that kind. */
export function resumePathForPortal(kind, { getToken, getParentToken, getTeamRoomToken }) {
  if (kind === PORTAL_COACH && getToken?.()) return "/";
  if (kind === PORTAL_PARENT && getParentToken?.()) return "/parent/portal";
  if (kind === PORTAL_ROOM && getTeamRoomToken?.()) return "/room/portal";
  return null;
}

/**
 * Pick the best resume path: last-used portal with a token, else any active session.
 */
export function resolveResumePath({ getToken, getParentToken, getTeamRoomToken }) {
  const last = getLastPortal();
  const fromLast = resumePathForPortal(last, { getToken, getParentToken, getTeamRoomToken });
  if (fromLast) return fromLast;

  if (getToken?.()) return "/";
  if (getParentToken?.()) return "/parent/portal";
  if (getTeamRoomToken?.()) return "/room/portal";
  return null;
}
