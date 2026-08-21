declare global { var __skillCanvasRateWindows: Map<string, { startedAt: number; count: number }> | undefined; }

export function checkRequestRate(key: string, limit: number, windowMs = 60_000) {
  const store = globalThis.__skillCanvasRateWindows || (globalThis.__skillCanvasRateWindows = new Map());
  const now = Date.now();
  const current = store.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    store.set(key, { startedAt: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  current.count += 1;
  return { allowed: current.count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - current.startedAt)) / 1_000)) };
}
