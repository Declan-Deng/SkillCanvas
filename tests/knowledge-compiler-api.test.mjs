import assert from "node:assert/strict";
import test from "node:test";

test("knowledge API rejects parseable length-stopped JSON without identical retry and returns spent usage", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests++;
    const request = JSON.parse(options.body);
    assert.match(request.messages[1].content, /Emit ONLY decision_rules, failure_modes/);
    return Response.json({ choices: [{ message: { content: '{"atoms":[]}' }, finish_reason: "length" }], usage: { prompt_tokens: 1200, completion_tokens: 6400 } });
  });
  const { default: worker } = await import("../dist/server/index.js");
  const response = await worker.fetch(new Request("http://localhost/api/ai", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "knowledge-compile", provider: "compatible", baseUrl: "https://knowledge.test/v1", apiKey: "test-only", model: "test", knowledgeBatch: { categories: ["decision_rules", "failure_modes"] } }),
  }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  const data = await response.json();
  assert.equal(response.status, 502);
  assert.equal(data.code, "AI_OUTPUT_TRUNCATED");
  assert.equal(data.content, undefined);
  assert.equal(data.usage.completionTokens, 6400);
  assert.equal(requests, 1);
});

test("knowledge verification receives full positive recovery and negative example evidence, not only four policy fields", async (t) => {
  const recovery = `${"保留所有已确认条件。".repeat(1600)}缺失时写“未提供”，继续处理其他项目`;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const request = JSON.parse(options.body);
    assert.match(request.messages[0].content, /exact output labels, confirmation timing/);
    assert.match(request.messages[0].content, /set sourceSupported=false/i);
    assert.match(request.messages[0].content, /Audit EVERY clause/);
    assert.match(request.messages[0].content, /ALL previous batches/);
    const payload = JSON.parse(request.messages[1].content);
    assert.equal(payload.confirmedInterviewEvidence[0].answer, recovery);
    assert.equal(payload.confirmedInterviewEvidence[0].evidenceKind, "positive_requirement");
    assert.equal(payload.confirmedInterviewEvidence[1].evidenceKind, "negative_example");
    assert.deepEqual(payload.acceptedKnowledge, [{ fingerprint: "earlier-verified-rule" }]);
    return Response.json({ choices: [{ message: { content: '{"verdicts":[]}' }, finish_reason: "stop" }], usage: { prompt_tokens: 1200, completion_tokens: 20 } });
  });
  const { default: worker } = await import("../dist/server/index.js");
  const response = await worker.fetch(new Request("http://localhost/api/ai", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "knowledge-verify", provider: "compatible", baseUrl: "https://knowledge-verify.test/v1", apiKey: "test-only", model: "test", acceptedKnowledge: [{ fingerprint: "earlier-verified-rule" }], answers: [
      { key: "failure-response", dimension: "失败模式", question: "缺失时希望怎么处理？", answer: recovery },
      { key: "bad-example", question: "不希望出现什么？", answer: "偷偷换掉我指定的标签" },
    ] }),
  }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200);
});
