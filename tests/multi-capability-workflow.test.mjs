import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { HOST_WEB_SEARCH_CAPABILITY } from "../app/capability-routing.ts";
import { compileWorkflowDag, normalizeWorkflowDagSteps, WORKFLOW_TERMINALS } from "../app/workflow-dag.ts";
import { inspectWorkflowPlan, repairWorkflowPlan } from "../app/workflow-plan-repair.ts";
import { compileSkillIR, projectSkillMarkdown, projectWorkflowRuntimeOperation } from "../app/skill-ir.ts";

// Exercise the actual selectable catalog wording, not weakened read-only mocks.
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const adapterIds = ["host-spreadsheet-analysis", "host-document-reading", "host-image-understanding"];
const adapters = adapterIds.map((id) => {
  const start = page.indexOf(`    id: "${id}"`, page.indexOf("const CAPABILITY_LIBRARY"));
  assert.ok(start > 0);
  const end = page.indexOf("\n  },", start);
  const entry = new Function(`return ({${page.slice(start, end)}})`)();
  return { ...entry, enabled: true, scope: "conditional", affects: ["tool-routing"] };
});
const node = (id, requires, produces, role = "transform", capabilityIds = ["core"]) => ({
  id, capabilityIds, requires, produces, role, input: requires.join(", "), output: produces.join(", "),
  action: id, when: "When needed", fallback: "Ask for missing evidence; never invent it", mutates: [],
});
const core = { id: "core", kind: "llm", name: "Task reasoning", input: "Actual request and available material", output: "Requested report", fallback: "Ask" };

function fixture(goal, renamed = false, selected = adapters) {
  const workflowSteps = [
    node("analyse-materials", ["$request", "$source"], ["$evidence"]),
    node("compare", ["$evidence"], ["$findings"]),
    node("compose", ["$findings"], ["$report"]),
    node("validate", ["$report"], ["$validation"], "validate"),
    { ...node("await-review", ["$report", "$validation"], ["$approval_required"], "await-approval"), resumeProduces: ["$approved", "$feedback"] },
    { ...node("save", ["$report", "$validation", "$approved"], ["$saved_report", "$output"], "persist", ["save-file"]), delivers: ["$saved_report"] },
    node("revise", ["$report", "$feedback"], ["$revised_report"]),
    { ...node("deliver-revised", ["$revised_report"], ["$output"], "deliver"), delivers: ["$revised_report"] },
  ];
  for (const capability of selected) workflowSteps.push({
    ...node(`step-capability-${capability.id}`, [capability.id === "host-document-reading" || renamed ? "$request" : `unbound:step-capability-${capability.id}:input`],
      [renamed ? `$${capability.id.replace(/^host-/, "").replaceAll("-", "_")}_output` : `capability:${capability.id}:output`], "transform", [capability.id]),
    input: capability.input, output: capability.output, action: capability.purpose || capability.requirement,
  });
  return { goal, inputs: [], workflowSteps, capabilities: [core,
    { id: "save-file", kind: "builtin-tool", name: "File writer", input: "$report", output: "Saved file", purpose: "Save the generated report", affects: ["file-output"], fallback: "Stop" }, ...selected] };
}

// Reconstructed from the failure log; not claimed to be the unavailable full
// private browser session. The exact reported orphan tokens are reproduced.
const goal = "我是品牌Dreampairs kids的红人营销，帮我做竞品分析来优化我们店铺的选品、价格设置以及红人营销策略";
test("reported three-adapter failure reproduces six orphan errors in the strict compiler", () => {
  const context = fixture(goal, true);
  const before = compileWorkflowDag(context.workflowSteps, ["$request", "$source"], { terminalOutputs: Object.values(WORKFLOW_TERMINALS), requiredTerminalOutputs: ["$output"] });
  for (const id of adapterIds) for (const type of ["unconsumed-production", "disconnected-step"]) {
    assert.ok(before.issues.some((issue) => issue.stepId === `step-capability-${id}` && issue.type === type));
  }
  assert.equal(before.issues.length, 6);
});

for (const task of [goal, "Audit supplier invoices and explain cost discrepancies", "Compare API designs and propose a migration plan"]) {
  for (const renamed of [false, true]) test(`${task.slice(0, 28)}: three selected adapters, renamed=${renamed}`, async () => {
    const context = fixture(task, renamed);
    const original = structuredClone(context);
    const fixed = await repairWorkflowPlan(context, () => assert.fail("these optional input adapters must not spend repair tokens"));
    assert.equal(fixed.attempts, 0);
    assert.deepEqual(context, original, "caller state remains unchanged");
    assert.equal(fixed.workflowSteps.length, 8, "only synthetic helpers removed; every real operation retained");
    const analysis = fixed.workflowSteps.find((step) => step.id === "analyse-materials");
    for (const id of adapterIds) assert.ok(analysis.capabilityIds.includes(id));
    for (const old of original.workflowSteps.filter((step) => !step.id.startsWith("step-capability-"))) {
      const step = fixed.workflowSteps.find((step) => step.id === old.id);
      assert.deepEqual(step.produces, old.produces, `${old.id} keeps its actual outputs`);
      assert.ok(old.requires.every((token) => step.requires.includes(token)));
      if (["persist", "validate", "await-approval", "deliver"].includes(step.role)) assert.deepEqual(step.capabilityIds, old.capabilityIds);
    }
    assert.ok(fixed.workflowSteps.findIndex((step) => step.id === "compose") < fixed.workflowSteps.findIndex((step) => step.id === "save"));
    assert.ok(fixed.workflowSteps.find((step) => step.id === "save").requires.includes("$approved"));
    assert.deepEqual(fixed.workflowSteps.find((step) => step.id === "await-review").produces, ["$approval_required"]);
    const recheck = await repairWorkflowPlan({ ...context, workflowSteps: normalizeWorkflowDagSteps(fixed.workflowSteps) }, () => assert.fail("idempotent recheck"));
    assert.deepEqual(recheck.workflowSteps, fixed.workflowSteps);
  });
}

test("all 15 nonempty selections of the three input adapters and search route without order dependence", async () => {
  const catalog = [...adapters, { ...HOST_WEB_SEARCH_CAPABILITY, scope: "conditional", enabled: true }];
  for (let mask = 1; mask < 16; mask++) {
    const selected = catalog.filter((_, index) => mask & (1 << index));
    const context = fixture("General evidence-based task", true, selected);
    context.workflowSteps.reverse(); context.capabilities.reverse();
    const result = await repairWorkflowPlan(context, () => assert.fail(`mask ${mask} must not need a model`));
    for (const cap of selected) assert.ok(result.workflowSteps.find((step) => step.id === "analyse-materials").capabilityIds.includes(cap.id));
    assert.equal(inspectWorkflowPlan({ ...context, workflowSteps: result.workflowSteps }).valid, true);
  }
});

test("adapters bound to a real intermediate artifact fold only into its actual consumer", async () => {
  const context = fixture(goal, true);
  for (const step of context.workflowSteps.filter((step) => step.id.startsWith("step-capability-"))) step.requires = ["$findings"];
  const fixed = await repairWorkflowPlan(context, () => assert.fail("shared explicit input has an unambiguous consumer"));
  for (const id of adapterIds) {
    assert.deepEqual(fixed.workflowSteps.filter((step) => step.capabilityIds.includes(id)).map((step) => step.id), ["compose"]);
  }
  assert.deepEqual(fixed.workflowSteps.find((step) => step.id === "compose").requires, ["$findings"]);
  assert.ok(fixed.workflowSteps.findIndex((step) => step.id === "compare") < fixed.workflowSteps.findIndex((step) => step.id === "compose"));
});

test("do not fold required tools, required MCP, writes, consumed products or real business outputs", () => {
  for (const change of [
    (c, h) => { c.scope = "global"; c.optional = false; },
    (c, h) => { c.kind = "mcp"; c.optional = false; },
    (c, h) => { c.affects = ["file-output"]; },
    (c, h) => { h.role = "persist"; },
    (c, h) => { h.requires = ["derived_records"]; },
    (c, h) => { h.produces = ["$saved_spreadsheet"]; },
    (c, h) => { h.mutates = ["$source"]; },
    (c, h) => { h.produces = ["$output"]; },
  ]) {
    const context = fixture("Not a bypass", true, [structuredClone(adapters[0])]);
    const helper = context.workflowSteps.at(-1), capability = context.capabilities.at(-1);
    change(capability, helper);
    const checked = inspectWorkflowPlan(context);
    assert.ok(checked.steps.some((step) => step.id === helper.id));
    if (helper.role !== "persist") assert.equal(checked.valid, false, String(change));
  }
  const context = fixture("Real shared tool result", true, [adapters[0]]);
  const helper = context.workflowSteps.at(-1);
  context.workflowSteps.find((step) => step.id === "compare").requires.push(...helper.produces);
  assert.ok(inspectWorkflowPlan(context).steps.some((step) => step.id === helper.id));
});

test("Canonical compilation retains conditional adapters and projects actual argument/result use before reasoning", async () => {
  const context = fixture(goal, true);
  const fixed = await repairWorkflowPlan(context, () => assert.fail("no repair call"));
  const ir = compileSkillIR({
    skillName: "competitive-analysis", idea: goal, answers: { trigger: goal },
    plan: {
      summary: goal, outcomeModel: { ultimateGoal: goal, controllableOutcomes: ["Evidence-based recommendations"], uncontrollableOutcomes: [], observableIndicators: ["Traceable evidence"] },
      stateModel: { needed: false, scope: "none", reason: "One task", fields: [], expiry: "Session", correction: "Ask", missingBehavior: "Ask", privacyBoundary: "Only provided data" },
      outputContract: { mode: "human", format: "Analysis report", requiredSections: ["Findings", "Recommendations"], artifactPatterns: [], validation: ["Claims reference supplied evidence"] },
      riskBranches: [], failureModes: [], workflowSteps: fixed.workflowSteps,
      items: context.capabilities.map((capability) => ({ ...capability, path: capability.path || "SKILL.md", name: capability.name || capability.id,
        layer: "runtime", scope: capability.scope || "task-specific", status: "use-provided", enabled: true,
        requirement: capability.requirement || "Process actual inputs", purpose: capability.purpose || "Produce the declared result", reason: "Required task operation",
        activationCondition: capability.routingCondition || "When the corresponding task operation needs it", routingCondition: capability.routingCondition || "When the corresponding task operation needs it",
        evaluationCriteria: ["Actual evidence used"], mustNotAffect: [] })),
    },
    loop: { mode: "hybrid", goal, maxRounds: 2, stopConditions: ["Delivered"], escalationConditions: ["Missing material"], scopes: [] },
    requirements: [{ id: "goal", requirement: goal, provenance: "user_explicit", modality: "MUST", hard: true, source: "user" }],
  });
  const step = ir.runtimeContract.workflow.find((s) => s.id === "analyse-materials");
  const operation = projectWorkflowRuntimeOperation(step, ir.capabilities.filter((cap) => step.capabilityIds.includes(cap.id)));
  for (const id of adapterIds) assert.ok(step.capabilityIds.includes(id));
  assert.match(operation, /actual arguments from `\$request`, `\$source`/);
  assert.match(operation, /use the returned evidence in this step before producing `\$evidence`/);
  assert.match(operation, /analysis only.*separate declared persist step/);
  assert.match(operation, /Otherwise continue without calling this tool/);
  assert.match(operation, /Reuse already verified evidence/);
  assert.match(operation, /If required material is missing, ask for it/);
  assert.ok(operation.indexOf("VERIFY_HOST") < operation.indexOf("`REASON`"));
  const markdown = projectSkillMarkdown(ir);
  assert.doesNotMatch(markdown, /unbound:|\$spreadsheet_analysis_output|\$document_reading_output|\$image_understanding_output/);
  assert.match(markdown, /\$approved/);
});
