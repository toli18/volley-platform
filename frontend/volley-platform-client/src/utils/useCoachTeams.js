import { useEffect, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import axiosInstance from "./apiClient";
import { API_PATHS } from "./apiPaths";

export default function useCoachTeams() {
  const { user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const role = String(user?.role || "").toLowerCase();
  const isHeadCoach = role === "club_head_coach";
  const currentUserId = Number(user?.id || 0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await axiosInstance.get(API_PATHS.TEAMS_LIST);
        let list = Array.isArray(res.data) ? res.data : [];
        if (!isHeadCoach) {
          list = list.filter((t) => Number(t?.coach_id) === currentUserId);
        }
        list = list.filter((t) => t.is_active !== false);
        list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "bg"));
        if (alive) setTeams(list);
      } catch (err) {
        if (!alive) return;
        const detail = err?.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "Неуспешно зареждане на отборите.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isHeadCoach, currentUserId]);

  return { teams, loading, error };
}
