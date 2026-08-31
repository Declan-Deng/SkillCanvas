import assert from "node:assert/strict";
import test from "node:test";
import { runBlueprintPlanning } from "../app/blueprint-planner.ts";
import { input, stageResults, workflow } from "./fixtures/blueprint.mjs";

test("actual AI endpoint runs split stages and resumes after an SSE length stop without replaying completed stages", async (t) => {
  let activeMode;
  let truncate = true;
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(String(url), "https://blueprint-stages.test/v1/chat/completions");
    const request = JSON.parse(options.body);
    requests.push({ mode: activeMode, request });
    const system = request.messages[0].content;
    if (activeMode === "blueprint-capabilities") {
      assert.match(system, /Do not emit workflowSteps or loopPlan/);
      assert.equal(request.max_tokens, 4000);
    }
    if (activeMode === "blueprint-workflow") {
      assert.match(system, /do not rewrite or re-emit its items or contracts/);
      assert.ok(JSON.parse(request.messages[1].content).capabilityPlan.items.length);
      assert.equal(request.max_tokens, request.stream ? 4000 : 8000);
      if (truncate) {
        const chunk = { choices: [{ index: 0, delta: { content: '{"workflowSteps":[{"id":"compose"' }, finish_reason: "length" }], usage: { prompt_tokens: 123, completion_tokens: 4000 } };
        return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
      }
    }
    return Response.json({ choices: [{ message: { content: JSON.stringify(stageResults[activeMode]) }, finish_reason: "stop" }], usage: { prompt_tokens: 123, completion_tokens: 100 } });
  });
  const { default: worker } = await import("../dist/server/index.js");
  const call = async (mode, payload) => {
    activeMode = mode;
    const response = await worker.fetch(new Request("http://localhost/api/ai", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, ...input.modelIdentity, apiKey: "test-only-not-real", ...payload }),
    }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
    const result = await response.json();
    if (!response.ok) {
      assert.equal(result.code, "AI_OUTPUT_TRUNCATED");
      assert.equal(result.mode, "blueprint-workflow");
      assert.equal(result.usage.completionTokens, 8000, "both failed attempts are accounted for");
      assert.equal(result.content, undefined);
      throw new Error(result.code);
    }
    return JSON.parse(result.content);
  };
  const checkpoint = {};
  await assert.rejects(runBlueprintPlanning({ ...input, checkpoint, call }), /AI_OUTPUT_TRUNCATED/);
  assert.equal(requests.length, 4, "server retries once with a larger ceiling, never loops on truncation");
  truncate = false;
  const result = await runBlueprintPlanning({ ...input, checkpoint, call });
  assert.deepEqual(requests.map((r) => r.mode), ["blueprint-foundation", "blueprint-capabilities", "blueprint-workflow", "blueprint-workflow", "blueprint-workflow"]);
  assert.deepEqual(result.capabilityPlan.workflowSteps, workflow.workflowSteps);
  assert.deepEqual(result.loopPlan, workflow.loopPlan);
});
