import assert from "node:assert/strict";
import test from "node:test";

test("blueprint API repairs closing punctuation but rejects missing contracts and token-truncated plans", async (t) => {
  const complete = {
    capabilityPlan: { summary: "Keep all requirements", outcomeModel: {}, stateModel: {}, outputContract: {}, riskBranches: [], failureModes: [], workflowSteps: [{ id: "compose", action: "Compose" }], items: [{ id: "core", kind: "llm" }] },
    loopPlan: { mode: "hybrid", goal: "Deliver", subgoals: [], qualityGates: [], cycle: [], maxRounds: 2, stopConditions: [], escalationConditions: [], scopes: [] },
  };
  const fixtures = [
    { raw: JSON.stringify(complete).replace('"scopes":[]', '"scopes":['), finish: "stop", status: 200 },
    { raw: JSON.stringify(complete).slice(0, -1), finish: "stop", status: 200 },
    { raw: JSON.stringify({ capabilityPlan: complete.capabilityPlan }), finish: "stop", status: 502 },
    { raw: JSON.stringify(complete), finish: "length", status: 502 },
    { raw: JSON.stringify(complete).slice(0, -45), finish: "length", status: 502 },
    { raw: "", finish: "length", status: 502 },
  ];
  let fixture;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(String(url), "https://blueprint-json.test/v1/chat/completions");
    calls += 1;
    return Response.json({ choices: [{ message: { content: fixture.raw }, finish_reason: fixture.finish }], usage: { prompt_tokens: 100, completion_tokens: 80 } });
  });
  const { default: worker } = await import("../dist/server/index.js");
  for (fixture of fixtures) {
    calls = 0;
    const response = await worker.fetch(new Request("http://localhost/api/ai", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "blueprint-plan", provider: "compatible", model: "test-model", baseUrl: "https://blueprint-json.test/v1", apiKey: "test-only-not-a-real-credential", idea: "Create a report", blueprintFoundation: { sections: [] }, runtimeInputs: [] }),
    }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
    const payload = await response.json();
    assert.equal(response.status, fixture.status, JSON.stringify(payload));
    if (fixture.status === 200) {
      assert.deepEqual(JSON.parse(payload.content), complete);
      assert.equal(calls, 1, "punctuation recovery must not pay to regenerate the plan");
    } else {
      assert.equal(payload.content, undefined);
      assert.equal(calls, fixture.finish === "length" ? 1 : 2);
      if (fixture.finish === "length") {
        assert.equal(payload.code, "AI_OUTPUT_TRUNCATED");
        assert.match(payload.error, /达到模型输出上限/);
        assert.deepEqual(payload.usage, { promptTokens: 100, completionTokens: 80, estimated: false });
      }
    }
  }
});
