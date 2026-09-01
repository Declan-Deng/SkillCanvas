import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("release interview hides the preview but retains internal input and old feedback evidence", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const interview = page.slice(page.indexOf('className="stage-content interview-stage"'), page.indexOf('{step === "blueprint" &&'));
  assert.doesNotMatch(interview, /discovery-preview-card|本轮预演结果|展开结果|discoveryPreview\.(?:output|title)|先看它做得像不像/);
  assert.match(interview, /确认你的目标、偏好与工作方式/);
  assert.match(interview, /className="question-list"/);
  assert.match(page, /__previewInput:.*discoveryPreview\?\.sampleInput/);
  assert.match(page, /previewFeedbackEvidence\(discoveryPreview, previewFeedback, previewFeedbackCustom\)/);
  assert.match(page, /normalizeDiscoveryPreview\(result.preview\)/);
});
