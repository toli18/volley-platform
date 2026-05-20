import { useCallback, useRef } from "react";

const SWIPE_MIN_PX = 52;
const SWIPE_RATIO = 1.25;

/**
 * Horizontal swipe between tab ids (e.g. overview → news → chat → roster).
 */
export function useHorizontalSwipeTabs(activeId, onChange, tabIds) {
  const touchRef = useRef(null);

  const onTouchStart = useCallback((e) => {
    if (!tabIds?.length) return;
    const t = e.touches?.[0];
    if (!t) return;
    touchRef.current = { x: t.clientX, y: t.clientY };
  }, [tabIds]);

  const onTouchEnd = useCallback(
    (e) => {
      const start = touchRef.current;
      touchRef.current = null;
      if (!start || !tabIds?.length) return;
      const t = e.changedTouches?.[0];
      if (!t) return;

      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;

      const idx = tabIds.indexOf(activeId);
      if (idx < 0) return;
      if (dx < 0 && idx < tabIds.length - 1) onChange(tabIds[idx + 1]);
      if (dx > 0 && idx > 0) onChange(tabIds[idx - 1]);
    },
    [activeId, onChange, tabIds]
  );

  return {
    onTouchStart,
    onTouchEnd,
  };
}
