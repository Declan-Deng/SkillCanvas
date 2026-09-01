import assert from "node:assert/strict";
import test from "node:test";
import { HOST_WEB_SEARCH_CAPABILITY, reconcileHostCapabilityAliases } from "../app/capability-routing.ts";
import { applyWorkflowStepPatch, inspectWorkflowPlan, repairWorkflowPlan } from "../app/workflow-plan-repair.ts";

const tool = (id, purpose) => ({ id, kind: "builtin-tool", path: "integrations/tool-contracts.json", name: id,
  input: "用户提供的文档和需要关注的范围", output: "带来源的内容", purpose, requirement: purpose,
  fallback: "Ask for missing source; never invent it", optional: true, enabled: true, scope: "conditional",
  activationCondition: "Only for task-relevant sources", affects: ["tool-routing"] });
const catalog = [tool("host-document-reading", "Read supplied documents"), tool("host-web-search", "Search source evidence")];
const node = (id, requires, produces, role, capabilityIds) => ({ id, requires, produces, role, capabilityIds,
  input: requires.join(", "), output: produces.join(", "), action: id, when: "When needed", fallback: "Stop dependent work", mutates: [] });

test("host aliases converge without merging MCP connections or overriding disabled selections", () => {
  const alias = tool("builtin-document-reading", "Read task material");
  const explicit = { ...catalog[0], enabled: false };
  const mcp = { ...alias, id: "external-reader", kind: "mcp", connection: { server: "private-docs" } };
  const steps = [node("extract", ["$source"], ["facts"], "read", [alias.id])];
  const original = structuredClone({ items: [alias, explicit, mcp], steps });
  const result = reconcileHostCapabilityAliases(original.items, steps, catalog);
  assert.deepEqual(result.items.map((item) => item.id), ["host-document-reading", "external-reader"]);
  assert.equal(result.items[0].enabled, false);
  assert.deepEqual(result.workflowSteps[0].capabilityIds, ["host-document-reading"]);
  assert.deepEqual(reconcileHostCapabilityAliases(result.items, result.workflowSteps, catalog), result);
  assert.equal(original.items.length, 3);
  assert.deepEqual(steps[0].capabilityIds, ["builtin-document-reading"]);
  const unknown = tool("builtin-custom-reader", "Read another repository");
  assert.equal(reconcileHostCapabilityAliases([unknown], [], catalog).items[0].id, unknown.id);
  const optional = reconcileHostCapabilityAliases([alias], [{ ...node("reason", ["$request"], ["report"], "transform", ["core"]), availableCapabilityIds: [alias.id] }], catalog);
  assert.deepEqual(optional.workflowSteps[0].availableCapabilityIds, ["host-document-reading"]);
});

// Reconstruct the reported post-selection failure with unrelated task vocabularies.
for (const domain of ["device-comparison", "invoice-audit", "release-summary"]) {
  test(`${domain}: selecting reader + search preserves work and repairs both tool routes`, async () => {
    const core = { id: "core", kind: "llm", input: "Materials", output: "Report", fallback: "Ask" };
    const facts = `${domain}:facts`, report = `${domain}:report`;
    const steps = [node("extract", ["$source"], [facts], "read", ["builtin-document-reading"]),
      node("compose", [facts, "$request"], [report], "transform", ["core"]),
      { ...node("deliver", [report], ["$output"], "deliver", ["core"]), delivers: [report] }];
    const items = [core, tool("builtin-document-reading", "Read task material"), catalog[0], { ...catalog[1], optional: false, scope: "global" }];
    const reconciled = reconcileHostCapabilityAliases(items, steps, catalog);
    const context = { capabilities: reconciled.items, workflowSteps: reconciled.workflowSteps, inputs: [] };
    // Reproduce an earlier failed repair that renamed a helper's output but
    // did not wire a consumer. Folding must handle this state too.
    context.workflowSteps.push(node("step-capability-host-web-search", ["$request"], ["web_search_results"], "read", ["host-web-search"]));
    assert.equal(inspectWorkflowPlan(context).valid, false);
    const repaired = await repairWorkflowPlan(context, async (request) => {
      assert.equal(request.workflowSteps.filter((step) => step.capabilityIds.includes("host-document-reading")).length, 1);
      assert.ok(!request.workflowSteps.some((step) => step.id.includes("builtin-document-reading")));
      return { stepUpdates: [{ id: "compose", changes: {
        action: "Only for a specific unresolved external fact, search with its query from the request and use verified source results in the report; otherwise compose from supplied material.",
      } }], foldedSteps: [{ id: "step-capability-host-web-search", intoStepId: "compose" }] };
    });
    assert.equal(repaired.attempts, 1);
    assert.deepEqual(repaired.workflowSteps.map((step) => step.id), ["extract", "compose", "deliver"]);
    assert.deepEqual(repaired.workflowSteps[1].requires, [facts, "$request"]);
    assert.deepEqual(repaired.workflowSteps[1].capabilityIds, ["core", "host-web-search"]);
    assert.deepEqual(repaired.workflowSteps[2].delivers, [report]);
    const repeat = await repairWorkflowPlan({ ...context, workflowSteps: repaired.workflowSteps }, () => assert.fail("recheck must not recreate helpers"));
    assert.equal(repeat.attempts, 0);
  });
}

test("folding a duplicate reader retains its consumed product on the real extraction step", () => {
  const helper = node("step-capability-host-document-reading", ["$source"], ["facts"], "read", ["host-document-reading"]);
  const steps = [node("extract", ["$source"], ["facts"], "read", ["host-document-reading"]), helper,
    node("compose", ["facts"], ["report"], "transform", ["core"])];
  const payload = { stepUpdates: [{ id: "extract", changes: { action: "Read source with the host document parser; reuse actual parsed facts" } }],
    foldedSteps: [{ id: helper.id, intoStepId: "extract" }] };
  assert.equal(applyWorkflowStepPatch(steps, payload, catalog).length, 2);
  assert.throws(() => applyWorkflowStepPatch(steps, { ...payload, stepUpdates: [{ id: "extract", changes: { action: "read", produces: ["other"] } }] }, catalog), /保留已被消费的产物/);
  assert.throws(() => applyWorkflowStepPatch(steps, { ...payload, stepUpdates: [] }, catalog), /必须更新/);
  assert.throws(() => applyWorkflowStepPatch(steps, { ...payload, foldedSteps: [{ id: "extract", intoStepId: "compose" }] }, catalog), /不能合并/);
  assert.throws(() => applyWorkflowStepPatch(steps, payload, [{ ...catalog[0], kind: "mcp" }]), /不能合并/);
  assert.throws(() => applyWorkflowStepPatch(steps, payload, [{ ...catalog[0], purpose: "Read and write files" }]), /不能合并/);
  assert.throws(() => applyWorkflowStepPatch(steps.map((step) => step.id === helper.id ? { ...step, mutates: ["state"] } : step), payload, catalog), /不能合并/);
});

test("unknown capability ids are rejected before rebinding creates phantom tool nodes", async () => {
  const core = { id: "core", kind: "llm", input: "Source", output: "Report", fallback: "Stop" };
  const context = { inputs: [], capabilities: [core], workflowSteps: [node("compose", ["missing"], ["report"], "transform", ["core"]),
    { ...node("deliver", ["report"], ["$output"], "deliver", ["core"]), delivers: ["report"] }] };
  let calls = 0;
  const result = await repairWorkflowPlan(context, async (request) => {
    calls++;
    if (calls === 1) return { stepUpdates: [{ id: "compose", changes: { requires: ["$request"], capabilityIds: ["invented"] } }] };
    assert.ok(request.issues.some((issue) => issue.includes("未启用能力 invented")));
    assert.ok(!request.workflowSteps.some((step) => step.id === "step-capability-core"));
    return { stepUpdates: [{ id: "compose", changes: { requires: ["$request"] } }] };
  });
  assert.equal(result.attempts, 2);
});

for (const renamed of [false, true]) test(`actual selectable search entry routes without a model call (renamed=${renamed})`, async () => {
  const core = { id: "core", kind: "llm", input: "Materials", output: "Report", fallback: "Ask" };
  const context = { inputs: [], capabilities: [core, { ...HOST_WEB_SEARCH_CAPABILITY, enabled: true }], workflowSteps: [
    node("compose", ["$request"], ["report"], "transform", ["core"]),
    node("validate", ["report"], ["checked"], "validate", ["core"]),
    { ...node("deliver", ["report", "checked"], ["$output"], "deliver", ["core"]), delivers: ["report"] },
  ] };
  if (renamed) context.workflowSteps.push(node("step-capability-host-web-search", ["$request"], ["web_search_results"], "read", ["host-web-search"]));
  const result = await repairWorkflowPlan(context, () => assert.fail("catalog lookup should be bound deterministically"));
  assert.equal(result.attempts, 0);
  assert.deepEqual(result.workflowSteps.find((step) => step.capabilityIds.includes("host-web-search"))?.id, "compose");
  assert.ok(result.workflowSteps.every((step) => !step.id.startsWith("step-capability-")));
});

test("a newly selected optional document reader is embedded in a real consumer, never a delivery", async () => {
  const core = { id: "core", kind: "llm", input: "Materials", output: "Report", fallback: "Ask" };
  const context = { inputs: [], capabilities: [core, catalog[0]], workflowSteps: [
    node("compose", ["$request"], ["report"], "transform", ["core"]),
    { ...node("deliver", ["report"], ["$output"], "deliver", ["core"]), delivers: ["report"] },
  ] };
  const result = await repairWorkflowPlan(context, () => assert.fail("optional input adapter needs no model repair"));
  assert.equal(result.attempts, 0);
  assert.deepEqual(result.workflowSteps.map((step) => step.id), ["compose", "deliver"]);
  assert.deepEqual(result.workflowSteps[0].requires, ["$request"]);
  assert.ok(result.workflowSteps[0].capabilityIds.includes("host-document-reading"));
  assert.deepEqual(result.workflowSteps[0].produces, ["report"]);
  assert.deepEqual(result.workflowSteps[1].capabilityIds, ["core"]);
});

test("optional lookup cannot discard a derived query dependency to appear connected", () => {
  const core = { id: "core", kind: "llm", input: "Materials", output: "Report", fallback: "Ask" };
  const context = { inputs: [], capabilities: [core, { ...HOST_WEB_SEARCH_CAPABILITY, enabled: true }], workflowSteps: [
    node("compose", ["$request"], ["report"], "transform", ["core"]),
    node("step-capability-host-web-search", ["derived_query"], ["web_results"], "read", ["host-web-search"]),
    { ...node("deliver", ["report"], ["$output"], "deliver", ["core"]), delivers: ["report"] },
  ] };
  const result = inspectWorkflowPlan(context);
  assert.equal(result.valid, false);
  assert.ok(result.steps.some((step) => step.requires.includes("derived_query")));
  assert.ok(result.issues.some((issue) => issue.includes("derived_query")));
});
