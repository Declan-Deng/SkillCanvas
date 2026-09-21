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

test("loading overlay omits token noise and uses truthful dotted waiting/output states", () => {
  const overlay = page.slice(page.indexOf("{busyTask && ("));
  assert.doesNotMatch(overlay, /ai-progress-token-usage|本次加载 Token|会话累计/);
  assert.doesNotMatch(overlay, /thinking-warp|warp-core/);
  assert.match(overlay, /ai-output-stage/);
  assert.match(overlay, /busyOutputText[\s\S]*?WaitingDotField/);
  assert.match(overlay, /DotMatrixProgress progress=/);
  assert.match(css, /\.ai-wind-field i\s*\{[^}]*animation: wind-dot 1\.9s linear infinite;/);
  const windAnimation = css.match(/@keyframes wind-dot\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.doesNotMatch(windAnimation, /translateX/);
  assert.match(windAnimation, /transform: scale\(/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.ai-wind-field i/);
  assert.match(page, /setSessionTokenUsage\(reconcile\)/);
  assert.match(page, /setBusyTokenUsage\(reconcile\)/);
});

test("interview heading uses the transparent pen and final note is below the four questions", () => {
  const pen = readFileSync(new URL("../public/skillcanvas-note-pen.png", import.meta.url));
  assert.equal(pen.subarray(1, 4).toString(), "PNG");
  assert.equal(pen[25], 6, "pen stays transparent");
  assert.match(page, /className="interview-heading-pen" src="\/skillcanvas-note-pen\.png"/);
  const questionListEnd = page.indexOf("{isFinalInterviewRound && (\n                <section className=\"final-note-card\"");
  const footer = page.indexOf('<div className="stage-footer">', questionListEnd);
  assert.ok(questionListEnd > page.indexOf('<div className="question-list">'));
  assert.ok(footer > questionListEnd);
  assert.match(page, /还有什么想说的吗/);
  assert.match(page, /handleContextSources\(event, "background"\)/);
  assert.match(css, /\.final-note-card\s*\{[\s\S]*?#fff3b8;/);
});

test("question cards use restrained hover feedback and distinctive aligned labels", () => {
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.question-card:hover\s*\{[^}]*transform: translateY\(-2px\);/);
  assert.match(css, /\.question-number\s*\{[^}]*font-family: "SkillCanvas DM Mono"/);
  assert.match(css, /\.question-dimension\s*\{[^}]*align-items: center;[^}]*height: 26px;[^}]*justify-content: center;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.question-card:hover\s*\{[^}]*transform: none;/);
});
