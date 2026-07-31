import { useCallback, useEffect, useState } from "react";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";

/**
 * Статус на постоянната връзка клуб ↔ БФВ.
 * След authorize с username/password token вече не е нужен.
 */
export default function useClubBvfLink({ enabled = true } = {}) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));

  const reload = useCallback(async () => {
    if (!enabled) return null;
    try {
      setLoading(true);
      const res = await axiosInstance.get(API_PATHS.BVF_ADMIN_STATUS);
      setStatus(res.data || null);
      return res.data;
    } catch {
      setStatus(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);

  const permanent = Boolean(status?.permanent_link || status?.has_bvf_credentials);

  /** JSON body helper — добавя bvf_token само ако е подаден. */
  const tokenBody = (token) => {
    const t = (token || "").trim();
    return t ? { bvf_token: t } : {};
  };

  /** FormData helper. */
  const appendToken = (form, token) => {
    const t = (token || "").trim();
    if (t) form.append("bvf_token", t);
    return form;
  };

  return { status, loading, permanent, reload, tokenBody, appendToken };
}
