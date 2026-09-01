import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("build toolbar copy and evaluation actions share one height, overriding compact sizing", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.build-toolbar \.toolbar-actions\s*\{[^}]*align-items: stretch;/);
  assert.match(css, /\.build-toolbar \.toolbar-actions > button\s*\{[^}]*min-height: 46px;/);
});

async function materialComponent() {
  const source = await readFile(new URL("../app/material-input.tsx", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  const resolved = outputText.replace(/from "(react(?:\/jsx-runtime)?|\.\/reference-upload)"/g, (_, path) => `from "${path === "./reference-upload" ? new URL("../app/reference-upload.ts", import.meta.url).href : import.meta.resolve(path)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(resolved).toString("base64")}`);
}

test("shared material field renders a keyboard-accessible upload button, icon and parser status", async () => {
  const { MaterialInput } = await materialComponent();
  const html = renderToStaticMarkup(createElement(MaterialInput, {
    id: "test-material", className: "context-field", title: "反例", tag: "禁止行为", placeholder: "补充材料", value: "原文",
    onChange() {}, onUpload() {}, upload: { loading: true, warning: false, message: "正在提取" },
  }));
  assert.match(html, /<textarea[^>]*aria-labelledby="test-material-label"[^>]*disabled/);
  assert.match(html, /<input[^>]*type="file"[^>]*multiple[^>]*accept="\.pdf,\.md/);
  assert.match(html, /<button[^>]*type="button"[^>]*disabled[^>]*aria-busy="true"/);
  assert.match(html, /<svg[^>]*aria-hidden="true"/);
  assert.match(html, /role="status" aria-live="polite">正在提取/);
  assert.match(html, /2 \/ 20,000/);
  assert.doesNotMatch(html, /<label/);
});

test("all four reference types and both interview examples use the same upload component and preserve their roles", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /CONTEXT_FIELDS\.filter[\s\S]*?<MaterialInput[\s\S]*?handleContextSources\(event, field.id\)/);
  for (const field of ["idealOutput", "negativeOutput"]) assert.match(page, new RegExp(`handleContextSources\\(event, "${field}"\\)`));
  const handler = page.slice(page.indexOf("async function handleContextSources"), page.indexOf("function updateSourceRole"));
  assert.match(handler, /\[fieldId\]: appended.text/);
  assert.doesNotMatch(handler, /setSourceText|setSourceInsights/);
  assert.match(page, /再给AI一点材料 <b className="optional-tag">可选<\/b>/);
  assert.doesNotMatch(page, /告诉 AI 什么样才算对/);
  assert.match(page, /disabled=\{busy \|\| materialsLoading\}/);
});

test("release presentation hides success noise without disabling blockers", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /文件发布检查已通过|<span>规则与结构<\/span>|<span>个人上下文<\/span>/);
  assert.match(page, /bundleAudit.blockers.length > 0 && <div className="finding-card">/);
  assert.match(page, /onClick=\{downloadBundle\} disabled=\{bundleAudit.blockers.length > 0\}/);
  assert.match(page, /className="feedback-scenario-button"[^>]*onClick=\{\(\) => void runEvaluation\(\)\}[^>]*><svg[\s\S]*?<\/svg>换个场景验证/);
});

test("quick-start options stretch equally and new controls have focus and narrow-screen support", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.starter-row\s*\{[^}]*align-items: stretch;[^}]*grid-auto-rows: 1fr;/);
  assert.match(css, /\.starter-row button\s*\{[^}]*align-items: center;[^}]*display: flex;/);
  assert.match(css, /\.material-input-footer\s*\{[^}]*flex-wrap: wrap;/);
  assert.match(css, /\.material-upload-button:focus-visible,[\s\S]*?outline: 2px/);
  assert.match(css, /\.feedback-scenario-button svg\s*\{[^}]*height: 18px/);
});

test("question toggle shares tag dimensions, capability heading has an icon, and only pending steps are muted", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(css, /\.question-meta\s*\{[^}]*--question-tag-height: 20px;/);
  assert.match(css, /\.question-meta b,\s*\.question-meta i,\s*\.question-multiple-toggle\s*\{[^}]*font-size: 8\.75px;[^}]*height: var\(--question-tag-height\);[^}]*padding: 0 6px;/);
  assert.doesNotMatch(css, /\.question-multiple-toggle\s*\{[^}]*min-height:/);
  assert.match(css, /\.question-multiple-toggle::after\s*\{[^}]*inset: -12px -4px;/);
  assert.match(page, /className="capability-library-title"><img src="\/icons\/tabler\/plug.svg" alt="" aria-hidden="true" \/>添加能力/);
  assert.match(css, /\.capability-library-control strong\s*\{[^}]*font-size: 18px;/);
  assert.match(css, /\.step-item:not\(\.active\):not\(\.done\)\s*\{[^}]*color: #6c7571;/);
  assert.match(css, /\.step-item:not\(\.active\):not\(\.done\) \.step-index\s*\{[^}]*border-color: #c3cbc6;/);
  assert.doesNotMatch(css, /\.step-item:hover\s*\{/);
});
