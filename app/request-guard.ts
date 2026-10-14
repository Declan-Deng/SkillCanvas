declare global { var __skillCanvasRateWindows: Map<string, { startedAt: number; count: number; touchedAt: number }> | undefined; }

export function checkRequestRate(key: string, limit: number, windowMs = 60_000) {
  const store = globalThis.__skillCanvasRateWindows || (globalThis.__skillCanvasRateWindows = new Map());
  const now = Date.now();
  // A warm worker may serve many anonymous sessions. Bound this best-effort
  // abuse guard so stale tenants cannot grow process memory indefinitely.
  if (store.size > 2_000) {
    for (const [storedKey, entry] of store) {
      if (now - entry.touchedAt > windowMs * 2) store.delete(storedKey);
    }
    if (store.size > 1_500) {
      const oldest = [...store.entries()].sort((left, right) => left[1].touchedAt - right[1].touchedAt);
      for (const [storedKey] of oldest) {
        if (store.size <= 1_500) break;
        store.delete(storedKey);
      }
    }
  }
  const current = store.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    store.set(key, { startedAt: now, count: 1, touchedAt: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  current.count += 1;
  current.touchedAt = now;
  return { allowed: current.count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - current.startedAt)) / 1_000)) };
}
