import { useCallback, useEffect, useRef, useState } from "react";

import axiosInstance from "./apiClient";

/**
 * Local + server court XY overrides keyed by `${rotation}:${phase}`.
 * Dirty keys keep local edits until PUT succeeds (or poll merge skips them).
 */
export function useLiveCourtPositions({ saveUrl, enabled = true }) {
  const [posByKey, setPosByKey] = useState({});
  const dirtyRef = useRef(new Set());
  const timerRef = useRef(null);
  const saveUrlRef = useRef(saveUrl);
  saveUrlRef.current = saveUrl;

  const hydrateFromServer = useCallback((courtPositions) => {
    if (!courtPositions || typeof courtPositions !== "object") return;
    setPosByKey((prev) => {
      const next = { ...courtPositions };
      for (const k of dirtyRef.current) {
        if (prev[k] != null) next[k] = prev[k];
      }
      return next;
    });
  }, []);

  const persistKey = useCallback(
    (key, positions) => {
      if (!enabled || !saveUrlRef.current) return;
      const [rotRaw, phase] = String(key).split(":");
      const rotation = Number(rotRaw);
      if (!rotation || !phase) return;
      axiosInstance
        .put(saveUrlRef.current, { rotation, phase, positions: positions || {} })
        .then(() => {
          dirtyRef.current.delete(key);
        })
        .catch(() => {
          /* keep dirty — retry on next drag / later */
        });
    },
    [enabled],
  );

  const onPositionsChange = useCallback(
    (key, next) => {
      dirtyRef.current.add(key);
      setPosByKey((prev) => ({ ...prev, [key]: next }));
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        persistKey(key, next);
      }, 450);
    },
    [persistKey],
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { posByKey, hydrateFromServer, onPositionsChange };
}

export function formatServerToast(player) {
  if (!player) return "записано";
  const num = player.jersey_number != null ? `#${player.jersey_number}` : "";
  const name = String(player.athlete_name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)[0] || "";
  const who = [num, name].filter(Boolean).join(" ");
  return who ? `записано на ${who}` : "записано";
}

export function needsUndoConfirm() {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(pointer: coarse)").matches) return true;
    if (window.matchMedia("(max-width: 900px)").matches) return true;
  } catch {
    /* ignore */
  }
  return false;
}
