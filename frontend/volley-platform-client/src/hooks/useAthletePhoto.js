import { useEffect, useState } from "react";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";

function blobLooksLikeImage(blob, contentTypeHeader) {
  if (!blob || blob.size < 24) return false;
  const ctype = String(contentTypeHeader || blob.type || "").toLowerCase();
  if (ctype.includes("application/json") || ctype.includes("text/")) return false;
  if (ctype.startsWith("image/")) return true;
  // FastAPI jpeg + някои проксита връщат octet-stream / празен type
  return !ctype || ctype.includes("octet-stream") || ctype === "binary/octet-stream";
}

/**
 * Loads athlete portrait as blob URL (auth via axios).
 * canFetchFromBvf — опитва GET photo дори без локален кеш (сървърът дърпва от БФВ).
 * photoPath — алтернативен endpoint (напр. athlete-room/me/photo); винаги се опитва.
 */
export default function useAthletePhoto(athleteId, hasPhoto, { canFetchFromBvf = false, photoPath = null } = {}) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    const id = Number(athleteId);
    const path = photoPath || (id ? API_PATHS.TEAM_ATHLETE_PHOTO(id) : null);
    const shouldFetch = Boolean(photoPath) || Boolean(hasPhoto) || Boolean(canFetchFromBvf);
    if (!path || !shouldFetch) {
      setUrl(null);
      return undefined;
    }
    (async () => {
      try {
        const res = await axiosInstance.get(path, {
          responseType: "blob",
          headers: { "Content-Type": undefined },
        });
        if (cancelled) return;
        const blob = res.data;
        const headerType = res.headers?.["content-type"] || res.headers?.["Content-Type"];
        if (!blobLooksLikeImage(blob, headerType)) {
          setUrl(null);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
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
