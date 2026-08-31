import assert from "node:assert/strict";
import test from "node:test";
import { workflow, capabilities, input, foundation, capabilitiesWithInapplicableNulls } from "./fixtures/blueprint.mjs";
import { assertBlueprintStage } from "../app/blueprint-contract.ts";
import { runBlueprintPlanning } from "../app/blueprint-planner.ts";

test("blueprint API normalizes harmless omissions and targets semantic field repairs without rewriting valid steps", async (t) => {
  const omitted = structuredClone(workflow);
  delete omitted.workflowSteps[0].delivers;
  omitted.workflowSteps.forEach((step) => delete step.resumeProduces);
  const missing = structuredClone(omitted);
  delete missing.workflowSteps[0].requires;
  const cases = [
    { name: "inapplicable fields", initial: omitted, status: 200, calls: 1 },
    { name: "legacy envelope", initial: { capabilityPlan: { workflowSteps: omitted.workflowSteps }, loopPlan: omitted.loopPlan }, status: 200, calls: 1 },
    { name: "targeted dependency repair", initial: missing, repair: { repairs: [{ path: "/workflowSteps/0/requires", value: ["input:material"] }] }, status: 200, calls: 2 },
    { name: "protect other fields", initial: missing, repair: { repairs: [{ path: "/workflowSteps/1/action", value: "Bypass approval" }] }, status: 502, calls: 2, errorPath: "/repairs" },
    { name: "repeat malformed field", initial: missing, repair: { repairs: [{ path: "/workflowSteps/0/requires", value: null }] }, status: 502, calls: 2, errorPath: "/workflowSteps/0/requires" },
  ];
  let scenario;
  let calls;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(String(url), "https://blueprint-stages.test/v1/chat/completions");
    calls += 1;
    const request = JSON.parse(options.body);
    const user = JSON.parse(request.messages[1].content);
    if (calls === 1) {
      assert.equal(user.capabilityPlan.workflowSteps, undefined);
      assert.deepEqual(user.capabilityPlan.items, capabilities.capabilityPlan.items.filter((item) => item.layer === "runtime" && item.kind !== "eval"));
    } else {
      assert.match(request.messages[0].content, /REPAIR RESPONSE OVERRIDE/);
      assert.deepEqual(user.issues, [{ path: "/workflowSteps/0/requires", code: "missing", expected: "string[]" }]);
      assert.deepEqual(user.candidate.workflowSteps[1], workflow.workflowSteps[1]);
      assert.deepEqual(user.context.blueprintFoundation, foundation);
    }
    return Response.json({ choices: [{ message: { content: JSON.stringify(calls === 1 ? scenario.initial : scenario.repair) }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 50 } });
  });
  const { default: worker } = await import("../dist/server/index.js");
  for (scenario of cases) {
    calls = 0;
    const response = await worker.fetch(new Request("http://localhost/api/ai", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "blueprint-workflow", ...input.modelIdentity, apiKey: "test-only-not-real", ...input.planInput, blueprintFoundation: foundation, capabilityPlan: { ...capabilities.capabilityPlan, workflowSteps: [{ id: "placeholder", requires: ["unbound:input"] }] } }),
    }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
    const result = await response.json();
    assert.equal(response.status, scenario.status, `${scenario.name}: ${JSON.stringify(result)}`);
    assert.equal(calls, scenario.calls, scenario.name);
    assert.deepEqual(result.usage, { promptTokens: 100 * calls, completionTokens: 50 * calls, estimated: false }, "include cost of rejected candidate and repair");
    if (scenario.status === 200) {
      const output = JSON.parse(result.content);
      assert.deepEqual(output.workflowSteps, workflow.workflowSteps);
      assert.deepEqual(output.loopPlan, workflow.loopPlan);
    } else {
      assert.equal(result.code, "BLUEPRINT_SCHEMA_INVALID");
      assert.equal(result.issues[0].path, scenario.errorPath);
      assert.equal(result.content, undefined);
    }
    if (calls > 1) {
      const logs = globalThis.__skillCanvasAiDiagnostics.filter((log) => log.requestId === result.requestId);
      assert.ok(logs.some((log) => log.event === "ai_blueprint_field_invalid" && log.reason.includes("/workflowSteps/0/requires")));
      assert.ok(logs.some((log) => log.event === "ai_blueprint_shape_invalid" && log.reason.includes("finish=stop")));
      assert.ok(logs.every((log) => !JSON.stringify(log).includes("Bypass approval")), "logs never contain model prose");
    }
  }
});

test("full blueprint API chain normalizes missing review flags and capability nulls, preserving model-authored content", async (t) => {
  const initialFoundation = structuredClone(foundation);
  initialFoundation.sections.forEach((section) => delete section.status);
  const initialCapabilities = capabilitiesWithInapplicableNulls();
  const initialWorkflow = structuredClone(workflow);
  initialWorkflow.workflowSteps.forEach((step) => step.capabilityIds = ["semantic-0"]);
  const modes = [];
  let activeMode;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const request = JSON.parse(options.body);
    modes.push(activeMode);
    assert.doesNotMatch(request.messages[0].content, /REPAIR RESPONSE OVERRIDE/, "metadata must not trigger a paid repair");
    const payload = { "blueprint-foundation": initialFoundation, "blueprint-capabilities": initialCapabilities, "blueprint-workflow": initialWorkflow }[activeMode];
    return Response.json({ choices: [{ message: { content: JSON.stringify(payload) }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 50 } });
  });
  const { default: worker } = await import("../dist/server/index.js");
  const result = await runBlueprintPlanning({ ...input, checkpoint: {}, call: async (mode, payload) => {
    activeMode = mode;
    const response = await worker.fetch(new Request("http://localhost/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, ...input.modelIdentity, apiKey: "test-only-not-real", ...payload }) }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    return JSON.parse(data.content);
  } });
  assert.deepEqual(modes, ["blueprint-foundation", "blueprint-capabilities", "blueprint-workflow"]);
  assert.ok(result.foundation.sections.every((section) => section.status === "attention"));
  assert.deepEqual(result.foundation.sections.map(({content}) => content), foundation.sections.map(({content}) => content));
  assert.deepEqual(result.capabilityPlan.workflowSteps, initialWorkflow.workflowSteps);
});

test("foundation semantic omissions are repaired at the API boundary, never returned as a successful partial stage", async (t) => {
  const partial = structuredClone(foundation);
  delete partial.sections[2].content;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls += 1;
    const request = JSON.parse(options.body);
    if (calls === 2) {
      const payload = JSON.parse(request.messages[1].content);
      assert.deepEqual(payload.issues, [{ path: "/sections/2/content", code: "missing", expected: "non-empty string" }]);
      assert.match(payload.context, /Task goal/);
    }
    return Response.json({ choices: [{ message: { content: JSON.stringify(calls === 1 ? partial : { repairs: [{ path: "/sections/2/content", value: foundation.sections[2].content }] }) }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 50 } });
  });
  const { default: worker } = await import("../dist/server/index.js");
  const response = await worker.fetch(new Request("http://localhost/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "blueprint-foundation", ...input.modelIdentity, apiKey: "test-only-not-real", ...input.foundationInput }) }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(calls, 2);
  assert.deepEqual(JSON.parse(result.content), foundation);
  assert.deepEqual(result.usage, { promptTokens: 200, completionTokens: 100, estimated: false });
});

test("capability API accepts all 18 inapplicable fields in one request but repairs an actual missing script path", async (t) => {
  const nullable = capabilitiesWithInapplicableNulls();
  const script = structuredClone(nullable);
  Object.assign(script.capabilityPlan.items[0], { kind: "script", deterministicAdvantage: "Deterministically validate every record" });
  let scenario;
  let calls;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls += 1;
    const request = JSON.parse(options.body);
    assert.match(request.messages[0].content, /Kind-specific fields/);
    if (calls > 1) {
      const payload = JSON.parse(request.messages[1].content);
      assert.deepEqual(payload.issues, [{ path: "/capabilityPlan/items/0/path", code: "type", expected: "non-empty string" }]);
      assert.equal(payload.candidate.capabilityPlan.items[1].path, "SKILL.md", "inapplicable fields normalized before repair");
    }
    return Response.json({ choices: [{ message: { content: JSON.stringify(calls === 1 ? scenario.initial : { repairs: [{ path: "/capabilityPlan/items/0/path", value: "scripts/check.py" }] }) }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 50 } });
  });
  const { default: worker } = await import("../dist/server/index.js");
  for (scenario of [{ initial: nullable, calls: 1 }, { initial: script, calls: 2 }]) {
    calls = 0;
    const response = await worker.fetch(new Request("http://localhost/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "blueprint-capabilities", ...input.modelIdentity, apiKey: "test-only-not-real", ...input.planInput, blueprintFoundation: foundation }) }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(calls, scenario.calls);
    assertBlueprintStage("blueprint-capabilities", JSON.parse(result.content));
    assert.equal(result.usage.promptTokens, calls * 100);
  }
});
