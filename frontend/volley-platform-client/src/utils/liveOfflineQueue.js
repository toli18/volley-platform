/** Offline buffer for live match score/stat/undo — survives brief network drops. */

function readQueue(storageKey) {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(storageKey, items) {
  try {
    if (!items.length) {
      sessionStorage.removeItem(storageKey);
      return;
    }
    sessionStorage.setItem(storageKey, JSON.stringify(items.slice(-40)));
  } catch {
    /* quota / private mode */
  }
}

export function isLiveNetworkError(err) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err?.response) return false;
  const code = err?.code || "";
  const msg = String(err?.message || "").toLowerCase();
  return (
    code === "ERR_NETWORK" ||
    code === "ECONNABORTED" ||
    msg.includes("network error") ||
    msg.includes("timeout")
  );
}

/**
 * @param {{ storageKey: string, send: (item) => Promise<any>, onState?: (data) => void, onQueued?: () => void, onFlushed?: (n: number) => void, onError?: (err) => void }} opts
 */
export function createLiveOfflineQueue({ storageKey, send, onState, onQueued, onFlushed, onError }) {
  let flushing = false;

  const enqueue = (item) => {
    const q = readQueue(storageKey);
    q.push({ ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
    writeQueue(storageKey, q);
    onQueued?.();
  };

  const pendingCount = () => readQueue(storageKey).length;

  const flush = async () => {
    if (flushing) return 0;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
    const q = readQueue(storageKey);
    if (!q.length) return 0;
    flushing = true;
    let done = 0;
    try {
      while (true) {
        const next = readQueue(storageKey);
        if (!next.length) break;
        const [head, ...rest] = next;
        try {
          const data = await send(head);
          writeQueue(storageKey, rest);
          done += 1;
          if (data) onState?.(data);
        } catch (err) {
          if (isLiveNetworkError(err)) break;
          writeQueue(storageKey, rest);
          onError?.(err);
        }
      }
      if (done) onFlushed?.(done);
      return done;
    } finally {
      flushing = false;
    }
  };

  return { enqueue, flush, pendingCount, isFlushing: () => flushing };
}
