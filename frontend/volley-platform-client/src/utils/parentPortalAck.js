import axiosInstance from "./apiClient";
import { API_PATHS } from "./apiPaths";

export async function ackParentPortalChange({ isSession, token, markerKey, date, scope }) {
  const path = isSession
    ? API_PATHS.PARENT_PORTAL_ACK_CHANGE_ME
    : token
      ? API_PATHS.PARENT_PORTAL_ACK_CHANGE_TOKEN(token)
      : null;
  if (!path) return;
  const body = {};
  if (scope) body.scope = scope;
  else if (markerKey) body.marker_key = markerKey;
  else if (date) body.date = date;
  await axiosInstance.post(path, body);
}

function shouldClearItem(item, { markerKey, date, scope }) {
  if (!item?.highlight_change) return false;
  if (scope === "schedule" || markerKey === "schedule_digest") return true;
  if (markerKey) return item.change_marker_key === markerKey;
  if (date) return item.date === date;
  return false;
}

export function applyAckToScheduleItems(items, payload) {
  return (items || []).map((item) =>
    shouldClearItem(item, payload) ? { ...item, highlight_change: false } : item,
  );
}

export function recomputePendingScheduleDates(items, pendingDates) {
  const highlighted = new Set((items || []).filter((it) => it.highlight_change).map((it) => it.date));
  return (pendingDates || []).filter((d) => highlighted.has(d));
}

export function patchProfileAfterScheduleAck(profile, payload) {
  if (!profile) return profile;
  const clearAllSchedule = payload?.scope === "schedule" || payload?.markerKey === "schedule_digest";
  const monthly_schedule = applyAckToScheduleItems(profile.monthly_schedule, payload);
  const pending_schedule_dates = clearAllSchedule
    ? []
    : recomputePendingScheduleDates(monthly_schedule, profile.pending_schedule_dates);
  const patchEvent = (item) =>
    item && shouldClearItem(item, payload) ? { ...item, highlight_change: false } : item;
  return {
    ...profile,
    monthly_schedule,
    pending_schedule_dates,
    next_training: patchEvent(profile.next_training),
    next_competition: patchEvent(profile.next_competition),
    next_event: patchEvent(profile.next_event),
  };
}
