import test from "node:test";
import assert from "node:assert/strict";
import { checkRequestRate } from "../app/request-guard.ts";

test("rate windows isolate operation classes for the same tenant", () => {
  globalThis.__skillCanvasRateWindows = new Map();
  assert.equal(checkRequestRate("tenant:ai:preview", 1).allowed, true);
  assert.equal(checkRequestRate("tenant:ai:preview", 1).allowed, false);
  assert.equal(checkRequestRate("tenant:ai:build", 1).allowed, true);
});

test("rate window storage remains bounded even when every entry is fresh", () => {
  globalThis.__skillCanvasRateWindows = new Map(
    Array.from({ length: 2_001 }, (_, index) => [`tenant-${index}`, { startedAt: Date.now(), count: 1, touchedAt: Date.now() + index }]),
  );
  checkRequestRate("new-tenant", 1);
  assert.ok(globalThis.__skillCanvasRateWindows.size <= 1_501);
});
