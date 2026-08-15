import { useEffect, useState } from "react";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";

/**
 * Loads athlete portrait as blob URL (auth via axios).
 * canFetchFromBvf — опитва GET photo дори без локален кеш (сървърът дърпва от БФВ).
 * photoPath — алтернативен endpoint (напр. athlete-room/me/photo).
 */
export default function useAthletePhoto(athleteId, hasPhoto, { canFetchFromBvf = false, photoPath = null } = {}) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    const id = Number(athleteId);
    const path = photoPath || (id ? API_PATHS.TEAM_ATHLETE_PHOTO(id) : null);
    if (!path || (!hasPhoto && !canFetchFromBvf)) {
      setUrl(null);
      return undefined;
    }
    (async () => {
      try {
        const res = await axiosInstance.get(path, {
          responseType: "blob",
        });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data);
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [athleteId, hasPhoto, canFetchFromBvf, photoPath]);

  return url;
}
