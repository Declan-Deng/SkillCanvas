import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("preview disclaimer and sample disclosure have scoped, accessible styles", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /className="discovery-preview-output-heading"/);
  assert.match(page, /<p className="discovery-preview-disclaimer">这份示例只用于确认工作方式/);
  assert.match(page, /discoveryPreview\.sampleInput && \(\s*<details className="discovery-preview-sample">/);
  assert.match(page, /<summary>[\s\S]*?查看示例输入[\s\S]*?<svg[^>]*aria-hidden="true"[\s\S]*?<\/summary>/);
  assert.match(css, /\.discovery-preview-disclaimer\s*\{[^}]*font-size:[^}]*line-height:[^}]*margin:/);
  assert.match(css, /\.discovery-preview-sample > summary\s*\{[^}]*align-items: center;[^}]*display: flex;[^}]*font-size:/);
  assert.match(css, /\.discovery-preview-sample > summary:focus-visible\s*\{[^}]*outline:/);
  assert.match(css, /\.discovery-preview-sample > summary::-webkit-details-marker\s*\{\s*display: none;/);
  assert.match(css, /\.discovery-preview-sample\[open\] > summary svg\s*\{\s*transform: rotate\(180deg\)/);
  assert.match(css, /\.discovery-preview-sample > \.discovery-preview-output\s*\{[^}]*max-height: 260px;[^}]*padding: 12px;/);
  assert.doesNotMatch(css, /\.discovery-preview-output-card > div\s*\{/);
});
