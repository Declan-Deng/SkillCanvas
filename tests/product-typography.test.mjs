import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const shell = css.match(/\.app-shell\s*\{([^}]+)\}/)[1];

test("seven product text tiers are scoped to the app, with readable code kept separate", () => {
  const scale = { caption: 12, label: 14, body: 16, lead: 18, title: 20, "section-title": 24, "page-title": 32, code: 14 };
  for (const [name, size] of Object.entries(scale)) {
    assert.ok(shell.includes(`--app-type-${name}: ${size}px;`), name);
  }
  assert.ok(shell.includes("--type-body: var(--app-type-body)"));
  assert.ok(shell.includes("--type-caption: var(--app-type-caption)"));
  const root = css.match(/:root\s*\{([^}]+)\}/)[1];
  assert.doesNotMatch(root, /--app-type-/);
  const scopedOverrides = css.match(/\.skill-demo-card\s*\{([^}]+)\}/)[1];
  assert.doesNotMatch(scopedOverrides, /--type-[\w-]+:\s*[\d.]+px/);
  assert.ok(scopedOverrides.includes("--type-body: var(--app-type-body,"));
});

test("the six steps and shared workspace consume semantic typography, not ad-hoc sizes", () => {
  const rules = [
    [".starter-row button", "label"],
    [".question-options button", "body"],
    [".blueprint-card textarea", "body"],
    [".build-product-status p", "body"],
    [".skill-demo-head h3", "title"],
    [".release-preview-head h3", "title"],
    [".file-tree button", "caption"],
    [".inspector-callout p", "label"],
    [".model-options small", "caption"],
  ];
  for (const [selector, tier] of rules) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rule = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1];
    assert.ok(rule?.includes(`font-size: var(--app-type-${tier},`), selector);
  }
  assert.match(css, /\.code-pane code,\s*\.skill-file-editor\s*\{[^}]*font-size: var\(--app-type-code,/);
});

test("larger text retains room in tags, flow cards and file headers", () => {
  assert.match(css, /--question-tag-height: 24px;/);
  assert.match(css, /\.workflow-step-card\s*\{[^}]*min-height: 300px;/);
  assert.match(css, /\.code-tab\s*\{[^}]*height: 52px;/);
  assert.match(css, /\.code-pane pre,\s*\.skill-file-editor\s*\{[^}]*height: calc\(100% - 52px\);/);
  assert.match(css, /\.skill-file-workspace \.valid-mark\s*\{[^}]*max-width: 55%;[^}]*white-space: normal;/);
});

test("responsive text shrinks display titles, not body or editor readability", () => {
  assert.match(css, /\.app-shell\s*\{\s*--app-type-display: clamp\(34px, 9\.6vw, 40px\);\s*--app-type-page-title: 28px;/);
  const declarations = [...css.matchAll(/--app-type-(body|code|caption|label):\s*([^;]+);/g)];
  assert.equal(declarations.length, 4, "mobile must not introduce a competing small-text scale");
});
