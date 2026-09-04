import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("hero asset is an RGBA PNG with matching intrinsic dimensions", () => {
  const png = readFileSync(new URL("../public/skillcanvas-hero-helper-emoji.png", import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png[25], 6, "RGBA color type preserves transparency");
  assert.equal(png.readUInt32BE(16), 1254);
  assert.equal(png.readUInt32BE(20), 1254);
  assert.match(page, /width="1254" height="1254"/);
});

test("quick-start text is 25 percent smaller without reducing its hit target", () => {
  const rule = css.match(/\.starter-row button\s*\{([^}]+)\}/)[1];
  assert.match(rule, /font-size: 10\.5px;/);
  assert.equal(10.5 / 14, .75);
  assert.match(rule, /min-height: 44px;/);
});

test("hero keeps the headline and adds a decorative local image in the right column", () => {
  assert.match(page, /className="brief-hero"[\s\S]*?AI 不懂你[\s\S]*?来帮你[\s\S]*?className="brief-hero-illustration" src="\/skillcanvas-hero-helper-emoji\.png"[^>]*alt="" aria-hidden="true"/);
  assert.match(css, /\.brief-hero\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) clamp\(140px, 18vw, 210px\);/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*?\.brief-hero \{ grid-template-columns: minmax\(0, 1fr\);/);
});

test("AI selection label and yellow multiple-choice button retain existing behavior", () => {
  assert.match(page, /currentAnsweredCount\}\/.+?questions.length\}<small>AI 已帮你选择<\/small>/);
  assert.doesNotMatch(page, /本轮已回答/);
  assert.match(css, /\.question-multiple-toggle\s*\{[^}]*background: #fff3c4;[^}]*color: #72551b;/);
  assert.match(page, /onClick=\{\(\) => allowMultipleAnswers\(question.id\)\}[^>]*>我想多选/);
});

test("loading overlay omits the entire token panel but retains progress and accounting", () => {
  const overlay = page.slice(page.indexOf("{busyTask && ("));
  assert.doesNotMatch(overlay, /ai-progress-token-usage|本次加载 Token|会话累计/);
  assert.match(overlay, /ai-progress-track/);
  assert.match(page, /setSessionTokenUsage\(reconcile\)/);
  assert.match(page, /setBusyTokenUsage\(reconcile\)/);
});
