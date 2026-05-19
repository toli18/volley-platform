import axiosInstance from "./apiClient";
import { API_PATHS } from "./apiPaths";

export async function ackAthleteRoomChange({ markerKey, date, scope }) {
  const body = {};
  if (scope) body.scope = scope;
  else if (markerKey) body.marker_key = markerKey;
  else if (date) body.date = date;
  await axiosInstance.post(API_PATHS.ATHLETE_ROOM_ACK_CHANGE_ME, body);
}

export { applyAckToScheduleItems, patchProfileAfterScheduleAck } from "./parentPortalAck";
