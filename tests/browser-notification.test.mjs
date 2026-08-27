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
  const [layout, page, favicon, browserIcon, notificationIcon, appleIcon] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/favicon.ico", import.meta.url)),
    readFile(new URL("../public/skillcanvas-browser-icon.png", import.meta.url)),
    readFile(new URL("../public/skillcanvas-notification-icon.png", import.meta.url)),
    readFile(new URL("../public/skillcanvas-apple-icon.png", import.meta.url)),
  ]);
  assert.match(layout, /\/favicon\.ico\?v=20260827/);
  assert.match(layout, /\/skillcanvas-browser-icon\.png/);
  assert.match(layout, /\/skillcanvas-apple-icon\.png/);
  assert.match(page, /icon:\s*"\/skillcanvas-notification-icon\.png"/);
  assert.equal(favicon.subarray(0, 4).toString("hex"), "00000100");
  for (const icon of [browserIcon, notificationIcon, appleIcon]) {
    assert.equal(icon.subarray(1, 4).toString("ascii"), "PNG");
  }
});
