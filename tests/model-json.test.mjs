import assert from "node:assert/strict";
import test from "node:test";

import { normalizeModelJsonContent } from "../app/model-json.ts";

test("normalizes fenced JSON and invalid backslash escapes", () => {
  const parsed = JSON.parse(normalizeModelJsonContent(String.raw`\`\`\`json
{"pattern":"\\s+","ok":true}
\`\`\``));
  assert.equal(parsed.pattern, String.raw`\s+`);
  assert.equal(parsed.ok, true);
});

test("repairs literal control characters, trailing commas, and prose quotes inside JSON strings", () => {
  const raw = `{"summary":"先做"理解预演"，再继续\n下一步","items":["A","B",],}`;
  const parsed = JSON.parse(normalizeModelJsonContent(raw));
  assert.equal(parsed.summary, "先做\"理解预演\"，再继续\n下一步");
  assert.deepEqual(parsed.items, ["A", "B"]);
});

test("does not manufacture an object from non-JSON prose", () => {
  assert.equal(normalizeModelJsonContent("I could not complete the request"), "");
});

test("keeps the first complete JSON value when a provider appends closing tokens", () => {
  const normalized = normalizeModelJsonContent('{"executions":[{"caseId":"one","triggered":true,"output":"ok","artifacts":[],"trace":[]}]}]}}');
  assert.deepEqual(JSON.parse(normalized), {
    executions: [{ caseId: "one", triggered: true, output: "ok", artifacts: [], trace: [] }],
  });
});

test("repairs prose quotes before discarding a malformed provider suffix", () => {
  const normalized = normalizeModelJsonContent('{"executions":[{"caseId":"one","output":"用户说"可以"，然后继续","trace":[]}]}]}');
  assert.equal(JSON.parse(normalized).executions[0].output, '用户说"可以"，然后继续');
});

test("planning punctuation repair preserves all values and nested container types", () => {
  const value = { capabilityPlan: { summary: 'keep ] } , and "quotes" verbatim', items: [{ id: "core" }] }, loopPlan: { scopes: [{ id: "feedback" }] } };
  const raw = JSON.stringify(value);
  const missingArrayClose = raw.replace('"scopes":[{"id":"feedback"}]', '"scopes":[{"id":"feedback"}');
  const missingRootClose = raw.slice(0, -1);
  for (const input of [missingArrayClose, missingRootClose]) {
    assert.equal(normalizeModelJsonContent(input), "", "closure repair is opt-in for planning only");
    assert.deepEqual(JSON.parse(normalizeModelJsonContent(input, { repairContainers: true })), value);
  }
});

test("planning recovery cannot fabricate truncated strings, keys, numbers, or list values", () => {
  for (const raw of ['{"items":["unfinished', '{"summary":', '{"maxRounds":1e', '{"items":[{"id":"core"},', '{"items":[{"id":"core"}],"loopPlan":']) {
    assert.equal(normalizeModelJsonContent(raw, { repairContainers: true }), "", raw);
  }
});
