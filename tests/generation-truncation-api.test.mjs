import assert from "node:assert/strict";
import test from "node:test";
import { providerRepairNeedsUserAction } from "../app/eval-prompt.ts";

test("build, repair and Eval reject provider-reported truncation even when partial JSON parses", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(String(url), "https://generation-truncation.test/v1/chat/completions");
    calls += 1;
    return Response.json({ choices: [{ message: { content: '{"files":{},"canonicalMutations":[],"cases":[]}' }, finish_reason: "length" }], usage: { prompt_tokens: 100, completion_tokens: 80 } });
  });
  const { default: worker } = await import("../dist/server/index.js");
  for (const mode of ["build", "repair", "eval-execute", "eval-grade", "demo"]) {
    calls = 0;
    const response = await worker.fetch(new Request("http://localhost/api/ai", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, provider: "compatible", model: "test-model", baseUrl: "https://generation-truncation.test/v1", apiKey: "test-only-not-a-real-credential", idea: "Create a report" }),
    }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
    const payload = await response.json();
    assert.equal(response.status, 502, `${mode}: ${JSON.stringify(payload)}`);
    assert.equal(payload.code, "AI_OUTPUT_TRUNCATED", mode);
    assert.equal(payload.content, undefined, mode);
    assert.equal(calls, 1, "do not retry the same output budget or accept the partial response");
    assert.deepEqual(payload.usage, { promptTokens: 100, completionTokens: 80, estimated: false });
  }
});

test("provider account failures return an actionable notice and a non-retryable code", async (t) => {
  let active, calls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(String(url), "https://account-failure.test/v1/chat/completions");
    calls += 1;
    return Response.json({ error: { message: active.message } }, { status: active.status });
  });
  const { default: worker } = await import("../dist/server/index.js");
  for (active of [
    { status: 402, message: "Insufficient Balance", code: "AI_ACCOUNT_LIMIT", label: /余额或额度不足/ },
    { status: 402, message: "Payment Required", code: "AI_ACCOUNT_LIMIT", label: /充值后重试当前步骤/ },
    { status: 429, message: "insufficient_quota", code: "AI_ACCOUNT_LIMIT", label: /余额或额度不足/ },
    { status: 401, message: "Invalid API key", code: "AI_PROVIDER_AUTH", label: /检查模型配置/ },
    { status: 403, message: "Forbidden", code: "AI_PROVIDER_AUTH", label: /访问权限/ },
  ]) {
    calls = 0;
    const response = await worker.fetch(new Request("http://localhost/api/ai", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "repair", provider: "compatible", model: "test-model", baseUrl: "https://account-failure.test/v1", apiKey: "test-only-not-a-real-credential", idea: "Create a report" }),
    }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
    const payload = await response.json();
    assert.equal(response.status, 502);
    assert.equal(payload.upstreamStatus, active.status);
    assert.equal(payload.code, active.code);
    assert.equal(payload.retryable, false);
    assert.match(payload.error, active.label);
    assert.doesNotMatch(payload.error, /未收敛|test-only/);
    assert.equal(calls, 1);
    assert.equal(providerRepairNeedsUserAction(Object.assign(new Error(payload.error), { code: payload.code })), true);
  }
});
