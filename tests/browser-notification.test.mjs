import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("notification service worker focuses an existing app window before opening a new one", async () => {
  const source = await readFile(new URL("../public/notification-sw.js", import.meta.url), "utf8");
  assert.match(source, /notificationclick/);
  assert.match(source, /includeUncontrolled:\s*true/);
  assert.match(source, /existing\.focus\(\)/);
  assert.match(source, /clients\.openWindow\("\/"\)/);
});

test("browser metadata and notifications use the SkillCanvas artwork", async () => {
  const [layout, page, favicon, tabIcon, notificationIcon, appleIcon] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/favicon.ico", import.meta.url)),
    readFile(new URL("../public/skillcanvas-tab-robot-95d2d7c1.png", import.meta.url)),
    readFile(new URL("../public/skillcanvas-notification-icon.png", import.meta.url)),
    readFile(new URL("../public/skillcanvas-apple-icon.png", import.meta.url)),
  ]);
  assert.match(layout, /icon: \[\{ url: "\/skillcanvas-tab-robot-95d2d7c1\.png"/);
  assert.match(layout, /shortcut: "\/skillcanvas-tab-robot-95d2d7c1\.png"/);
  assert.doesNotMatch(layout, /icon: \[[\s\S]*\/favicon\.ico/);
  assert.match(layout, /\/skillcanvas-apple-icon\.png/);
  assert.match(page, /icon:\s*"\/skillcanvas-notification-icon\.png"/);
  assert.equal(favicon.subarray(0, 4).toString("hex"), "00000100");
  for (const icon of [tabIcon, notificationIcon, appleIcon]) {
    assert.equal(icon.subarray(1, 4).toString("ascii"), "PNG");
  }
});
