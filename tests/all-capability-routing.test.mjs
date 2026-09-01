import assert from "node:assert/strict";
import test from "node:test";
import { capabilityCatalog } from "./fixtures/capability-catalog.mjs";
import { inspectWorkflowPlan, repairWorkflowPlan } from "../app/workflow-plan-repair.ts";
import { normalizeWorkflowDagSteps } from "../app/workflow-dag.ts";
import { compileSkillIR, projectSkillMarkdown } from "../app/skill-ir.ts";

const node = (id, requires, produces, role = "transform", capabilityIds = ["core"]) => ({ id, requires, produces, role, capabilityIds,
  when: "For the declared operation", input: requires.join(", "), action: id, output: produces.join(", "), fallback: "Stop the dependent action if evidence or permission is missing", mutates: [] });
const core = { id: "core", name: "Core reasoning", kind: "llm", scope: "task-specific", input: "Request and material", output: "Checked report", fallback: "Ask" };
const active = (capability) => ({ ...capability, enabled: true, scope: "conditional", affects: ["tool-routing"] });
function context(selected, restored = false) {
  const capabilities = [core, ...selected.map(active)];
  const workflowSteps = [node("analyse", ["$request", "$source"], ["facts"]), node("compose", ["facts"], ["report"]),
    node("validate", ["report"], ["checked"], "validate"),
    { ...node("deliver", ["report", "checked"], ["$output"], "deliver"), delivers: ["report"] }];
  if (restored) for (const cap of selected) workflowSteps.push({
    ...node(`step-capability-${cap.id}`, [`unbound:step-capability-${cap.id}:input`], [`$${cap.id.replace(/^host-/, "").replaceAll("-", "_")}_output`], "transform", [cap.id]),
    input: cap.input, action: cap.purpose, output: cap.output,
  });
  return { capabilities, workflowSteps, inputs: [] };
}
const routed = (steps) => new Set(steps.flatMap((step) => [...step.capabilityIds, ...(step.availableCapabilityIds || [])]));

for (const cap of capabilityCatalog) for (const restored of [false, true]) test(`${cap.id}: optional selection routes without invented calls (restored=${restored})`, async () => {
  const original = context([cap], restored), copy = structuredClone(original);
  const result = await repairWorkflowPlan(original, () => assert.fail("unused optional capability must not trigger a model repair"));
  assert.equal(result.attempts, 0);
  assert.deepEqual(original, copy);
  assert.ok(routed(result.workflowSteps).has(cap.id));
  assert.deepEqual(result.workflowSteps.map((step) => step.id), ["analyse", "compose", "validate", "deliver"]);
  assert.deepEqual(result.workflowSteps.map((step) => step.produces), [["facts"], ["report"], ["checked"], ["$output"]]);
  const repeated = await repairWorkflowPlan({ ...original, workflowSteps: normalizeWorkflowDagSteps(result.workflowSteps) }, () => assert.fail("reload must not reinsert helpers"));
  assert.deepEqual(repeated.workflowSteps, result.workflowSteps);
  if (cap.kind === "mcp" || ["host-shell-code", "host-git-workflow", "host-parallel-agents", "host-browser-computer", "host-image-generation", "host-file-workspace"].includes(cap.id)) {
    assert.ok(result.workflowSteps.some((step) => step.availableCapabilityIds?.includes(cap.id)));
    assert.ok(!result.workflowSteps.some((step) => step.capabilityIds.includes(cap.id)), "availability is not scheduled execution");
  }
});

test("every nonempty catalog combination (8191 for 13 entries) preserves all selections and the original graph", () => {
  assert.equal(capabilityCatalog.length, 13, "review the advertised test count when catalog changes");
  for (let mask = 1; mask < 2 ** capabilityCatalog.length; mask++) {
    const selected = capabilityCatalog.filter((_, index) => mask & 2 ** index);
    const input = context(selected, mask % 2 === 0);
    if (mask % 3 === 0) { input.capabilities.reverse(); input.workflowSteps.reverse(); }
    const result = inspectWorkflowPlan(input);
    assert.equal(result.valid, true, `selection ${mask}: ${result.issues.join("; ")}`);
    assert.equal(result.steps.length, 4);
    assert.deepEqual([...routed(result.steps)].sort(), ["core", ...selected.map((cap) => cap.id)].sort());
    assert.deepEqual(result.ordered.map((step) => step.id), ["analyse", "compose", "validate", "deliver"]);
  }
});

for (const cap of capabilityCatalog) test(`${cap.id}: a required concrete call and its real output cannot disappear`, async () => {
  const input = context([cap]); input.capabilities[1].optional = false;
  const operation = node("actual-tool-call", ["$source"], ["actual_result"], "transform", [cap.id]);
  input.workflowSteps = [operation, node("compose", ["actual_result"], ["report"]), { ...node("deliver", ["report"], ["$output"], "deliver"), delivers: ["report"] }];
  const valid = await repairWorkflowPlan(input, () => assert.fail("already wired"));
  assert.ok(valid.workflowSteps[0].capabilityIds.includes(cap.id));
  const broken = structuredClone(input);
  broken.workflowSteps[1].requires = ["actual_result", "missing_input"];
  await assert.rejects(repairWorkflowPlan(broken, () => ({ stepUpdates: [
    { id: "actual-tool-call", changes: { capabilityIds: ["core"], availableCapabilityIds: [cap.id] } },
    { id: "compose", changes: { requires: ["actual_result"] } },
  ] })), /必须保留已规划的工具|可选能力/);
});

test("availability cannot substitute required artifacts, state writes or real approval", () => {
  for (const mutation of [
    (c) => { c.capabilities[1].optional = false; },
    (c) => { c.capabilities[1].scope = "global"; },
    (c) => { c.capabilities[1].affects = ["file-output"]; },
    (c) => { c.workflowSteps[0].availableCapabilityIds = ["not-in-catalog"]; },
    (c) => { c.workflowSteps[0].role = "await-approval"; c.workflowSteps[0].resumeProduces = ["$approved"]; },
    (c) => { c.workflowSteps[0].mutates = ["$source"]; },
  ]) {
    const input = context([capabilityCatalog[0]]);
    input.workflowSteps[0].availableCapabilityIds = [capabilityCatalog[0].id];
    mutation(input);
    assert.equal(inspectWorkflowPlan(input).valid, false);
  }
});

test("arbitrary custom MCP/tool providers use the same availability mechanism, without an ID whitelist", async () => {
  const selected = ["builtin-tool", "mcp"].map((kind) => ({ ...capabilityCatalog[0], id: `custom-${kind}`, kind }));
  const result = await repairWorkflowPlan(context(selected), () => assert.fail("no per-ID patch"));
  for (const cap of selected) assert.ok(result.workflowSteps.some((step) => step.availableCapabilityIds?.includes(cap.id)));
});

test("all selected tools survive Canonical IR and SKILL projection with explicit execution/authorization boundaries", async () => {
  const input = context(capabilityCatalog);
  const result = await repairWorkflowPlan(input, () => assert.fail("no repair"));
  const idea = "Compare products using supplied evidence and explain recommendations";
  const ir = compileSkillIR({ skillName: "compare-products", idea, answers: {}, plan: {
    summary: idea, outcomeModel: { ultimateGoal: idea, controllableOutcomes: ["Traceable findings"], uncontrollableOutcomes: [], observableIndicators: ["Evidence used"] },
    stateModel: { needed: false, scope: "none", reason: "Single task", fields: [], expiry: "Session", correction: "Ask", missingBehavior: "Ask", privacyBoundary: "Task materials only" },
    outputContract: { mode: "human", format: "Report", requiredSections: ["Findings"], artifactPatterns: [], validation: ["Traceability"] },
    riskBranches: [], failureModes: [], workflowSteps: result.workflowSteps,
    items: input.capabilities.map((cap) => ({ ...cap, path: cap.path || "SKILL.md", layer: "runtime", status: "use-provided", enabled: true,
      requirement: cap.requirement || "Reason from evidence", purpose: cap.purpose || "Compare evidence", reason: "Declared task implementation",
      activationCondition: cap.routingCondition || "When this task needs this operation", routingCondition: cap.routingCondition || "When this task needs this operation",
      mustNotAffect: [], evaluationCriteria: cap.evaluationCriteria || ["Grounded output"] })),
  }, loop: { mode: "hybrid", goal: idea, maxRounds: 2, stopConditions: ["Delivered"], escalationConditions: ["Missing evidence"], scopes: [] },
  requirements: [{ id: "goal", requirement: idea, provenance: "user_explicit", source: "user", modality: "MUST", hard: true }] });
  const skill = projectSkillMarkdown(ir);
  for (const cap of capabilityCatalog) { assert.ok(ir.capabilities.some((item) => item.id === cap.id)); assert.ok(routed(ir.runtimeContract.workflow).has(cap.id)); }
  assert.match(skill, /Selection is not execution or authorization/);
  assert.match(skill, /No new side effects are authorized/);
  assert.match(skill, /configured\/verified metadata is not proof/i);
  assert.match(skill, /non-overlapping inputs\/outputs/);
  assert.doesNotMatch(skill, /unbound:|step-capability-/);
  assert.ok(ir.capabilities.filter((cap) => cap.kind === "mcp").every((cap) => !cap.connection.verified), "selection must never fake a connection");
});
