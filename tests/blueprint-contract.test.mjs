import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBlueprintStage, blueprintStageIssues, assertBlueprintStage, applyBlueprintFieldRepairs } from "../app/blueprint-contract.ts";
import { blueprintStagePrompt } from "../app/blueprint-planner.ts";
import { inspectWorkflowPlan } from "../app/workflow-plan-repair.ts";
import { workflow, capabilities, input, foundation } from "./fixtures/blueprint.mjs";

test("missing foundation review status stays unconfirmed without changing original evidence", () => {
  const raw = structuredClone(foundation);
  delete raw.sections[0].status;
  raw.sections[1].status = null;
  const normalized = normalizeBlueprintStage("blueprint-foundation", raw);
  assertBlueprintStage("blueprint-foundation", normalized);
  assert.equal(normalized.sections[0].status, "attention");
  assert.equal(normalized.sections[1].status, "attention");
  assert.equal(normalized.sections[2].status, "ready");
  assert.deepEqual(normalized.sections.map(({content}) => content), raw.sections.map(({content}) => content));
  delete raw.sections[0].content;
  assert.throws(() => assertBlueprintStage("blueprint-foundation", normalizeBlueprintStage("blueprint-foundation", raw)), /content/);
});

test("capability kind-specific nulls normalize without a model retry or invented routing", () => {
  const raw = structuredClone(capabilities);
  raw.capabilityPlan.items[0].scope = "conditional";
  raw.capabilityPlan.items[0].activationCondition = "Only when the user supplies the source and requests this report";
  for (const item of raw.capabilityPlan.items) {
    for (const field of ["path", "routingCondition", "deterministicAdvantage", "connection"]) item[field] = null;
  }
  const normalized = normalizeBlueprintStage("blueprint-capabilities", raw);
  assertBlueprintStage("blueprint-capabilities", normalized);
  assert.equal(normalized.capabilityPlan.items[0].path, "SKILL.md");
  assert.equal(normalized.capabilityPlan.items[1].path, "evals/");
  assert.equal(normalized.capabilityPlan.items[0].routingCondition, raw.capabilityPlan.items[0].activationCondition);
  assert.deepEqual(normalized.capabilityPlan.items[0].connection, { server: "", tools: [], verified: false });
  assert.equal(raw.capabilityPlan.items[0].connection, null);
  assert.deepEqual(normalizeBlueprintStage("blueprint-capabilities", normalized), normalized, "idempotent");
  assert.deepEqual(normalized.capabilityPlan.outputContract, raw.capabilityPlan.outputContract);
});

test("missing semantic capability fields still require repair, never guessed paths or authorization", () => {
  for (const [kind, field] of [["script", "path"], ["reference", "path"], ["asset", "path"], ["script", "deterministicAdvantage"], ["mcp", "connection"], ["llm", "input"], ["llm", "output"], ["llm", "fallback"], ["llm", "activationCondition"]]) {
    const raw = structuredClone(capabilities);
    const item = raw.capabilityPlan.items[0];
    item.kind = kind;
    item[field] = null;
    const normalized = normalizeBlueprintStage("blueprint-capabilities", raw);
    assert.ok(blueprintStageIssues("blueprint-capabilities", normalized).some((issue) => issue.path === `/capabilityPlan/items/0/${field}`), `${kind}.${field}`);
    assert.equal(normalized.capabilityPlan.items[0][field], null);
  }
  const raw = structuredClone(capabilities);
  raw.capabilityPlan.items[0].activationCondition = null;
  raw.capabilityPlan.items[0].routingCondition = null;
  const normalized = normalizeBlueprintStage("blueprint-capabilities", raw);
  assert.equal(normalized.capabilityPlan.items[0].routingCondition, null, "no generic always-on condition");
});

test("existing capability routing, source text and MCP connection remain unchanged", () => {
  const raw = structuredClone(capabilities);
  raw.capabilityPlan.items[0].kind = "mcp";
  raw.capabilityPlan.items[0].connection = { server: "user-selected-server", tools: ["read"], verified: false };
  assert.deepEqual(normalizeBlueprintStage("blueprint-capabilities", raw), raw);
  assert.match(blueprintStagePrompt("blueprint-capabilities", input.planInput).system, /Kind-specific fields/);
});

test("omitted inapplicable control arrays, numeric limits and presentation labels normalize without inventing behavior", () => {
  const raw = structuredClone(workflow);
  delete raw.workflowSteps[0].delivers;
  raw.workflowSteps.forEach((step) => delete step.resumeProduces);
  delete raw.loopPlan.label;
  raw.loopPlan.maxRounds = "2";
  const normalized = normalizeBlueprintStage("blueprint-workflow", raw);
  assertBlueprintStage("blueprint-workflow", normalized);
  assert.deepEqual(normalized.workflowSteps, workflow.workflowSteps);
  assert.equal(normalized.loopPlan.maxRounds, 2);
  assert.equal(normalized.loopPlan.label, "");
  assert.equal(raw.workflowSteps[0].delivers, undefined, "does not mutate model response");
});

test("legacy envelope is unwrapped but conflicting workflow copies are rejected", () => {
  const wrapped = { capabilityPlan: { workflowSteps: workflow.workflowSteps }, loopPlan: workflow.loopPlan };
  const normalized = normalizeBlueprintStage("blueprint-workflow", wrapped);
  assertBlueprintStage("blueprint-workflow", normalized);
  assert.deepEqual(normalized.workflowSteps, workflow.workflowSteps);
  const conflicting = { ...wrapped, workflowSteps: workflow.workflowSteps.slice(0, 1) };
  assert.throws(() => assertBlueprintStage("blueprint-workflow", normalizeBlueprintStage("blueprint-workflow", conflicting)), /conflicting/);
});

test("required dependencies, mutation declaration, delivery and reply artifacts never receive invented defaults", () => {
  const raw = structuredClone(workflow);
  delete raw.workflowSteps[0].requires;
  delete raw.workflowSteps[0].mutates;
  delete raw.workflowSteps[1].delivers;
  raw.workflowSteps.push({ ...structuredClone(workflow.workflowSteps[0]), id: "ask", role: "await-approval", produces: ["$approval_required"] });
  delete raw.workflowSteps[2].resumeProduces;
  const normalized = normalizeBlueprintStage("blueprint-workflow", raw);
  const issues = blueprintStageIssues("blueprint-workflow", normalized);
  assert.deepEqual(issues.map((issue) => issue.path), ["/workflowSteps/0/requires", "/workflowSteps/0/mutates", "/workflowSteps/1/delivers", "/workflowSteps/2/resumeProduces"]);
  assert.throws(() => assertBlueprintStage("blueprint-workflow", normalized), /workflowSteps\/0\/requires/);
  assert.equal(normalized.workflowSteps[2].resumeProduces, undefined);
});

test("field repair preserves all accepted content and rejects unauthorized edits", () => {
  const candidate = structuredClone(workflow);
  delete candidate.workflowSteps[0].requires;
  const repair = { candidate, issues: blueprintStageIssues("blueprint-workflow", candidate) };
  const fixed = applyBlueprintFieldRepairs("blueprint-workflow", repair, { repairs: [{ path: "/workflowSteps/0/requires", value: ["input:material"] }] });
  assert.deepEqual(fixed, workflow);
  assert.equal(candidate.workflowSteps[0].requires, undefined);
  assert.throws(() => applyBlueprintFieldRepairs("blueprint-workflow", repair, { repairs: [{ path: "/workflowSteps/1/action", value: "skip approval" }] }), /protected/);
  assert.throws(() => applyBlueprintFieldRepairs("blueprint-workflow", repair, workflow), /field repairs/);
  assert.throws(() => applyBlueprintFieldRepairs("blueprint-workflow", repair, { repairs: [{ path: "/workflowSteps/0/requires", value: "invented string" }] }), /string\[\]/);
});

test("wire acceptance cannot bypass strict semantic graph errors", () => {
  const candidate = structuredClone(workflow);
  candidate.workflowSteps[0].requires = ["$missing_material"];
  candidate.workflowSteps[0].capabilityIds = [];
  assertBlueprintStage("blueprint-workflow", candidate);
  const result = inspectWorkflowPlan({ workflowSteps: candidate.workflowSteps, capabilities: capabilities.capabilityPlan.items, inputs: [{ id: "material", name: "Source", required: true }] });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((error) => error.includes("$missing_material")));
});

test("planner does not pass compiler placeholder steps as approved workflow", () => {
  const plan = { ...capabilities.capabilityPlan, workflowSteps: [{ id: "unbound", requires: ["unbound:input"] }] };
  const { user } = blueprintStagePrompt("blueprint-workflow", { ...input.planInput, capabilityPlan: plan });
  const sent = JSON.parse(user).capabilityPlan;
  assert.equal(sent.workflowSteps, undefined);
  assert.deepEqual(sent.items, plan.items.filter((item) => item.layer === "runtime" && item.kind !== "eval"));
  assert.deepEqual(sent.outputContract, plan.outputContract);
});
