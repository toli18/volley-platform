import { useEffect, useState } from "react";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";

/**
 * Loads athlete portrait as blob URL (auth via axios).
 * canFetchFromBvf — опитва GET photo дори без локален кеш (сървърът дърпва от БФВ).
 */
export default function useAthletePhoto(athleteId, hasPhoto, { canFetchFromBvf = false } = {}) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    const id = Number(athleteId);
    if (!id || (!hasPhoto && !canFetchFromBvf)) {
      setUrl(null);
      return undefined;
    }
    (async () => {
      try {
        const res = await axiosInstance.get(API_PATHS.TEAM_ATHLETE_PHOTO(id), {
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
  }, [athleteId, hasPhoto, canFetchFromBvf]);

  return url;
}
