import assert from "node:assert/strict";
import test from "node:test";
import { repairWorkflowPlan } from "../app/workflow-plan-repair.ts";

test("workflow-repair API carries the exact graph and rejected edges through a network retry", async (t) => {
  const capabilities = [{ id: "core", kind: "llm", input: "Supplied material", output: "Report", fallback: "Ask for missing material" }];
  const broken = [{ id: "compose", capabilityIds: ["core"], role: "transform", when: "always", input: "$missing_material", action: "Compose report", output: "Report", fallback: "Ask", requires: ["$missing_material"], produces: ["$report"], mutates: [] }];
  const repaired = [
    { ...broken[0], input: "input:material", requires: ["input:material"] },
    { id: "deliver", capabilityIds: ["core"], role: "deliver", when: "Report is ready", input: "$report", action: "Deliver report", output: "Report", fallback: "Ask", requires: ["$report"], produces: ["$output"], delivers: ["$report"], mutates: [] },
  ];
  const upstream = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(String(url), "https://workflow-repair.test/v1/chat/completions");
    const request = JSON.parse(options.body);
    upstream.push(request);
    assert.match(request.messages[0].content, /Repair only the supplied runtime Workflow DAG/);
    assert.match(request.messages[0].content, /stepUpdates/);
    assert.match(request.messages[0].content, /negative_example/);
    const message = request.messages[1].content;
    assert.ok(message.includes("$missing_material"));
    assert.ok(message.includes("input:material"));
    assert.ok(message.includes("compose"));
    assert.ok(!message.includes("apiKey"));
    if (upstream.length === 1) throw new TypeError("Network connection lost");
    return Response.json({ choices: [{ message: { content: JSON.stringify({ stepUpdates: [{ id: "compose", changes: { input: "input:material", requires: ["input:material"] } }], addedSteps: [repaired[1]] }) }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 80 } });
  });
  // The framework captures native fetch at import time; install the mock first
  // so no request can escape to a real provider in this integration test.
  const { default: worker } = await import("../dist/server/index.js");
  const result = await repairWorkflowPlan({ workflowSteps: broken, capabilities, inputs: [{ id: "material", name: "Source material", required: true }] }, async (workflowRepair) => {
    const response = await worker.fetch(new Request("http://localhost/api/ai", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "workflow-repair", provider: "compatible", model: "test-model", baseUrl: "https://workflow-repair.test/v1", apiKey: "test-only-not-a-real-credential", idea: "Produce a report", answers: [{ dimension: "bad-example", question: "Bad example", answer: "Invent a source" }], workflowRepair }),
    }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.deepEqual(payload.usage, { promptTokens: 100, completionTokens: 80, estimated: false });
    return JSON.parse(payload.content);
  });
  assert.equal(result.attempts, 1, "transport retry stays inside the same graph-repair round");
  assert.equal(upstream.length, 2);
  assert.deepEqual(result.workflowSteps.map((step) => step.id), ["compose", "deliver"]);
  const initialGraph = JSON.parse(upstream[0].messages[1].content).dag;
  assert.deepEqual(initialGraph.workflowSteps.map((step) => step.id), ["compose"]);
  assert.ok(upstream[1].messages[1].content.includes(JSON.stringify(initialGraph)), "retry does not truncate or drop the original graph");
});
