const STORAGE_PREFIX = "parent_portal_push_hint_seen_";

export function pushHintStorageKey(isSession, legacyToken) {
  if (isSession) return `${STORAGE_PREFIX}session`;
  if (legacyToken) return `${STORAGE_PREFIX}token_${legacyToken.slice(0, 12)}`;
  return `${STORAGE_PREFIX}anon`;
}

export function shouldAutoOpenPushHint(isSession, legacyToken) {
  try {
    return !localStorage.getItem(pushHintStorageKey(isSession, legacyToken));
  } catch {
    return false;
  }
}

export function markPushHintSeen(isSession, legacyToken) {
  try {
    localStorage.setItem(pushHintStorageKey(isSession, legacyToken), String(Date.now()));
  } catch {
    /* ignore */
  }
}
