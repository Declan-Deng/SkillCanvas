import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inspectWorkflowPlan, repairWorkflowPlan, normalizeWorkflowPlanBindings, applyWorkflowStepPatch } from "../app/workflow-plan-repair.ts";
import { compileSkillIR, deriveTaskInputContract, projectSkillMarkdown, reconcileSkillIRStateLoops } from "../app/skill-ir.ts";

const cap = (id, kind, input, output) => ({ id, kind, input, output, fallback: "Stop the dependent branch if unavailable", affects: ["runtime-workflow"] });
const node = (id, requires, produces, role = "transform", capabilityIds = ["core"]) => ({
  id, requires, produces, role, capabilityIds, when: "When this operation is needed",
  input: requires.join(", "), action: id, output: produces.join(", "), fallback: "Ask for the missing input; do not invent it", mutates: [],
});

for (const role of ["await-input", "await-approval"]) for (const placement of ["requires", "input", "when", "all"]) {
  test(`completion aliases bind atomically: ${role}, ${placement}, with reference metadata omitted`, async () => {
    const terminal = role === "await-input" ? "$input_required" : "$approval_required";
    const context = { inputs: [], capabilities: [cap("core", "llm", "Records", "Report"), {
      id: "reference-weekly-report-structure", kind: "reference", input: "Report context", output: "Writing guidance",
      fallback: "State unavailable", activationCondition: "When writing a weekly report",
    }], workflowSteps: [
      node("draft", ["$request"], ["$draft", "$output_metadata"]),
      { ...node("show", ["$draft", "$output_metadata"], ["$output"], "deliver"), delivers: ["$draft"] },
      { ...node("reply", placement === "requires" || placement === "all" ? ["$output"] : ["$draft"], [terminal], role),
        input: placement === "input" || placement === "all" ? "Review $output with $output_metadata" : "$draft",
        when: placement === "when" || placement === "all" ? "After $output is shown" : "When feedback is requested",
        resumeProduces: ["$feedback"] },
      node("revise", ["$draft", "$feedback"], ["$revised"]),
      { ...node("finish", ["$revised"], ["$output"], "deliver"), delivers: ["$revised"] },
    ] };
    const before = structuredClone(context);
    const result = await repairWorkflowPlan(context, () => assert.fail("deterministic serialization repair needs no model"));
    assert.equal(result.attempts, 0);
    assert.deepEqual(context, before);
    const checkpoint = result.workflowSteps.find((step) => step.id === "reply");
    assert.ok(checkpoint.requires.includes("$draft"));
    assert.ok(!checkpoint.requires.includes("$output"));
    assert.ok(!checkpoint.requires.includes("$revised"));
    assert.deepEqual(checkpoint.resumeProduces, ["$feedback"]);
    if (placement === "input" || placement === "all") assert.match(checkpoint.input, /\$output_metadata/);
    assert.equal(result.workflowSteps.length, context.workflowSteps.length);
    assert.ok(result.workflowSteps.find((step) => step.id === "draft").capabilityIds.includes("reference-weekly-report-structure"));
    const next = inspectWorkflowPlan({ ...context, workflowSteps: result.workflowSteps });
    assert.equal(next.valid, true, next.issues.join("; "));
    assert.deepEqual(next.steps, result.workflowSteps);
  });
}

test("ambiguous delivered artifacts are not guessed from completion prose", () => {
  const context = { inputs: [], capabilities: [cap("core", "llm", "Records", "Reports")], workflowSteps: [
    node("draft", ["$request"], ["$a", "$b"]),
    { ...node("show-a", ["$a"], ["$output"], "deliver"), delivers: ["$a"] },
    { ...node("show-b", ["$b"], ["$output"], "deliver"), delivers: ["$b"] },
    { ...node("reply", [], ["$input_required"], "await-input"), input: "Review $output", resumeProduces: ["$feedback"] },
  ] };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, false);
  const reply = checked.steps.find((step) => step.id === "reply");
  assert.equal(reply.input, "Review $output");
  assert.ok(!reply.requires.includes("$output"));
});

test("live orphan validation is connected by a small delivery patch without losing the real confirmation", async () => {
  const context = { capabilities: [cap("core", "llm", "Source", "Report")], inputs: [], workflowSteps: [
    node("extract", ["$request"], ["parameters"]),
    { ...node("await-confirmation", ["parameters"], ["$input_required"], "await-input"), resumeProduces: ["$confirmed"] },
    node("compose", ["parameters", "$confirmed"], ["report"]),
    node("validate-output", ["report"], ["validation_result"], "validate"),
    { ...node("deliver", ["report"], ["$output"], "deliver"), delivers: ["report"] },
  ] };
  assert.ok(inspectWorkflowPlan(context).issues.some((issue) => issue.includes("validation_result")));
  const before = structuredClone(context);
  const result = await repairWorkflowPlan(context, async () => ({ stepUpdates: [
    { id: "deliver", changes: { requires: ["report", "validation_result"], when: "validation_result passed; otherwise report failures", action: "Deliver checked report only after validation passes" } },
  ], addedSteps: [] }));
  assert.equal(result.attempts, 1);
  assert.deepEqual(context, before);
  assert.deepEqual(result.workflowSteps.map((step) => step.id), ["extract", "await-confirmation", "compose", "validate-output", "deliver"]);
  assert.deepEqual(result.workflowSteps[1].resumeProduces, ["$confirmed"]);
  assert.ok(!result.workflowSteps[3].produces.includes("$output"));
  assert.throws(() => applyWorkflowStepPatch(context.workflowSteps, { stepUpdates: [{ id: "deliver", changes: { id: "renamed" } }] }), /不能改 id/);
  assert.throws(() => applyWorkflowStepPatch(context.workflowSteps, { stepUpdates: [{ id: "missing", changes: {} }] }), /不存在/);
  assert.throws(() => applyWorkflowStepPatch(context.workflowSteps, { stepUpdates: [], addedSteps: [context.workflowSteps[0]] }), /唯一 id/);
  await assert.rejects(repairWorkflowPlan(context, async () => ({ stepUpdates: [{ id: "await-confirmation", changes: { role: "transform" } }] })), /必须保留 await-input/);
});

test("private delivered versions get unique output tokens, but shared consumer versions are never guessed", () => {
  const context = { capabilities: [cap("core", "llm", "Source", "Report")], inputs: [], workflowSteps: [
    node("compose", ["$request"], ["report"]),
    { ...node("deliver-original", ["report"], ["$final_file", "$output"], "deliver"), delivers: ["$final_file"] },
    { ...node("await-feedback", ["report"], ["$input_required"], "await-input"), resumeProduces: ["$feedback"] },
    node("revise", ["report", "$feedback"], ["revision"]),
    { ...node("deliver-revised", ["revision"], ["$final_file", "$output"], "deliver"), delivers: ["$final_file"] },
  ] };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, true, checked.issues.join("; "));
  assert.deepEqual(checked.steps[1].delivers, ["$final_file"]);
  assert.deepEqual(checked.steps[4].delivers, ["$final_file:deliver-revised"]);
  assert.deepEqual(normalizeWorkflowPlanBindings({ ...context, workflowSteps: checked.steps }), checked.steps);
  context.workflowSteps.push(node("ambiguous-reader", ["$final_file"], ["contents"], "read"));
  assert.equal(inspectWorkflowPlan(context).valid, false);
  assert.ok(inspectWorkflowPlan(context).issues.some((issue) => issue.includes("同时由")));
});

test("preview confirmation and pre-validation persistence cannot complete the task early", () => {
  const context = { capabilities: [cap("core", "llm", "Source", "Report")], inputs: [], workflowSteps: [
    { ...node("show", ["$request"], ["preview"], "deliver"), action: "展示清单，等待确认", delivers: ["preview"] },
    { ...node("confirm", ["preview"], ["$input_required"], "await-input"), resumeProduces: ["$confirmation"] },
    { ...node("compose", ["preview", "$confirmation"], ["report"]), when: "$confirmation available" },
    { ...node("save", ["report"], ["file", "$output"], "persist"), delivers: ["file"] },
    node("validate", ["file"], ["check"], "validate"),
    { ...node("deliver", ["file", "check"], ["$output"], "deliver"), delivers: ["file"], when: "check passed" },
  ] };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, true, checked.issues.join("; "));
  assert.deepEqual(checked.steps.filter((step) => step.produces.includes("$output")).map((step) => step.id), ["deliver"]);
  assert.equal(checked.steps.find((step) => step.id === "compose").when, "$confirmed available");
  assert.equal(checked.steps.find((step) => step.id === "show").role, "transform");
  assert.equal(checked.steps.filter((step) => step.role === "await-input").length, 1);
  const restored = structuredClone(checked.steps);
  restored.find((step) => step.id === "compose").when = "$confirmation available";
  const replay = inspectWorkflowPlan({ ...context, workflowSteps: restored });
  assert.equal(replay.steps.find((step) => step.id === "compose").when, "$confirmed available");
  assert.equal(replay.valid, true);
});

test("two real approval checkpoints may share an unprefixed pause marker without duplicate business outputs", () => {
  const context = { capabilities: [cap("core", "llm", "Source", "Report")], inputs: [], workflowSteps: [
    node("draft", ["$request"], ["$draft"]),
    { ...node("review", ["$draft"], ["approval_required"], "await-approval"), resumeProduces: ["$first_reply"] },
    node("revise", ["$draft", "$first_reply"], ["$revised"]),
    { ...node("final-review", ["$revised"], ["approval_required"], "await-approval"), resumeProduces: ["$final_reply"] },
    { ...node("save", ["$revised", "$final_reply"], ["$output"], "persist"), delivers: ["$revised"] },
  ] };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, true, checked.issues.join("; "));
  assert.ok(checked.steps.filter((step) => step.role === "await-approval").every((step) => step.produces.includes("$approval_required") && !step.produces.includes("approval_required")));
  assert.deepEqual(checked.steps.find((step) => step.id === "save").requires, ["$revised", "$final_reply"]);
  assert.ok(!checked.initialInputs.includes("$final_reply"));
  const data = structuredClone(context);
  data.workflowSteps[1].produces = ["approval_required"];
  data.workflowSteps[2].requires.push("approval_required");
  assert.ok(normalizeWorkflowPlanBindings(data)[1].produces.includes("approval_required"), "a consumed business token must not be relabeled as a pause");
  const transform = structuredClone(context);
  transform.workflowSteps[1].role = "transform";
  assert.ok(normalizeWorkflowPlanBindings(transform)[1].produces.includes("approval_required"), "not a checkpoint, no alias conversion");
});

test("bare output is a completion alias only for explicit delivery and never for consumed business data", () => {
  const context = { capabilities: [cap("core", "llm", "Source", "Report")], inputs: [], workflowSteps: [
    node("draft", ["$request"], ["$draft"]),
    { ...node("deliver", ["$draft"], ["output"], "deliver"), delivers: ["$draft"] },
  ] };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, true, checked.issues.join("; "));
  assert.deepEqual(checked.steps[1].produces, ["$output"]);
  context.workflowSteps[1].delivers.push("output");
  assert.ok(normalizeWorkflowPlanBindings(context)[1].produces.includes("output"), "a delivered product named output is not a control marker");
});

test("terminal-only delivery cannot masquerade as a real output", () => {
  const context = { capabilities: [cap("core", "llm", "Source", "Report")], inputs: [], workflowSteps: [
    node("draft", ["$request"], ["$draft"]),
    { ...node("save", ["$draft"], ["$output"], "persist"), delivers: ["$output"] },
  ] };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, false);
  assert.ok(checked.issues.some((message) => message.includes("不能只交付完成标记")));
});

test("repair can distinguish colliding saved-file versions without deleting the original file output or approval", async () => {
  const context = { capabilities: [cap("core", "llm", "Source", "Report")], inputs: [], workflowSteps: [
    node("draft", ["$request"], ["draft"]),
    { ...node("review", ["draft"], ["$approval_required"], "await-approval"), resumeProduces: ["approved", "feedback"] },
    { ...node("save", ["draft", "approved"], ["output", "output_path", "$output"], "persist"), delivers: ["output"] },
    node("revise", ["draft", "feedback"], ["revised"]),
    { ...node("review-revised", ["revised"], ["$approval_required"], "await-approval"), resumeProduces: ["revision_approved"] },
    { ...node("save-revised", ["revised", "revision_approved"], ["output", "output_path", "$output"], "persist"), delivers: ["output"] },
  ] };
  assert.equal(inspectWorkflowPlan(context).valid, false);
  const proposal = normalizeWorkflowPlanBindings(context);
  proposal[2].delivers = ["output", "output_path"];
  proposal[5].produces = ["output:save-revised", "output_path_revised", "$output"];
  proposal[5].delivers = ["output:save-revised", "output_path_revised"];
  const result = await repairWorkflowPlan(context, async () => ({ workflowSteps: proposal }));
  assert.equal(result.attempts, 1);
  assert.deepEqual(result.workflowSteps.find((step) => step.id === "save").requires, ["draft", "$approved"]);
  assert.deepEqual(result.workflowSteps.find((step) => step.id === "save-revised").requires, ["revised", "revision_approved"]);
});

test("live-model approval aliases are canonicalized in both edges and input text", () => {
  const context = {
    capabilities: [cap("core", "llm", "Source", "Report")], inputs: [{ id: "material", name: "Source", required: true }],
    workflowSteps: [
      node("draft", ["input:material"], ["$draft"]),
      { ...node("approve", ["$draft"], ["$approval_required"], "await-approval"), resumeProduces: ["$approval"] },
      { ...node("deliver", ["$draft", "$approval"], ["$output"], "deliver"), delivers: ["$draft"] },
      { ...node("wait-material", [], ["$input_required"], "await-input"), resumeProduces: ["input:material"] },
    ],
  };
  const inspected = inspectWorkflowPlan(context);
  assert.equal(inspected.valid, true, inspected.issues.join("; "));
  const delivery = inspected.steps.find((step) => step.id === "deliver");
  assert.ok(delivery.requires.includes("$approved"));
  assert.match(delivery.input, /\$approved/);
  assert.deepEqual(inspected.steps.find((step) => step.id === "wait-material").resumeProduces, ["input:material"]);
});

test("colliding checkpoint reply names are scoped by the exact reviewed artifact, never automatically confirmed", () => {
  const context = { capabilities: [cap("core", "llm", "Source", "Report")], inputs: [], workflowSteps: [
    node("draft", ["$request"], ["$draft"]),
    { ...node("review", ["$draft"], ["$approval_required"], "await-approval"), resumeProduces: ["$confirmed", "revisionFeedback"] },
    node("revise", ["$draft", "revisionFeedback"], ["$revised"]),
    { ...node("review-again", ["$revised"], ["$approval_required"], "await-approval"), resumeProduces: ["$confirmed", "revisionFeedback"] },
    { ...node("save", ["$revised", "$confirmed"], ["$output"], "persist"), delivers: ["$revised"] },
  ] };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, true, checked.issues.join("; "));
  assert.deepEqual(checked.steps.find((step) => step.id === "revise").requires, ["$draft", "revisionFeedback:review"]);
  assert.deepEqual(checked.steps.find((step) => step.id === "save").requires, ["$revised", "$confirmed:review-again"]);
  assert.match(checked.steps.find((step) => step.id === "save").input, /\$confirmed:review-again/);
  assert.ok(!checked.initialInputs.includes("$confirmed:review-again"));
  assert.deepEqual(normalizeWorkflowPlanBindings({ ...context, workflowSteps: checked.steps }), checked.steps, "idempotent");
  const ambiguous = structuredClone(context);
  ambiguous.workflowSteps.splice(4, 0, node("ambiguous-reader", ["$confirmed", "$request"], ["$confirmation_note"]));
  ambiguous.workflowSteps[5].requires.push("$confirmation_note");
  assert.equal(inspectWorkflowPlan(ambiguous).valid, false, "no guessed confirmation owner without matching reviewed content");
});

test("sequential confirmations are scoped through transitive artifacts and explicit delivery contracts bind their sole producer", async () => {
  const context = { capabilities: [cap("core", "llm", "Request", "Plan")], inputs: [], workflowSteps: [
    node("s1-extract-todos", ["$request"], ["$todos"]),
    { ...node("s2-clarify-todos", ["$todos"], ["$input_required"], "await-input"), resumeProduces: ["$confirmed"] },
    node("s3-draft-plan", ["$todos", "$confirmed"], ["$draft_plan"]),
    node("s4-propose-cuts", ["$draft_plan"], ["$cuts"]),
    { ...node("s5-confirm-cuts", ["$cuts"], ["$input_required"], "await-input"), resumeProduces: ["$confirmed"] },
    { ...node("s6-deliver-plan", ["$cuts", "$confirmed"], ["$output"], "deliver"), delivers: ["$draft_plan"] },
  ] };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, true, checked.issues.join("; "));
  assert.deepEqual(checked.steps.find((step) => step.id === "s2-clarify-todos").resumeProduces, ["$confirmed:s2-clarify-todos"]);
  assert.deepEqual(checked.steps.find((step) => step.id === "s5-confirm-cuts").resumeProduces, ["$confirmed:s5-confirm-cuts"]);
  assert.ok(checked.steps.find((step) => step.id === "s3-draft-plan").requires.includes("$confirmed:s2-clarify-todos"));
  assert.ok(checked.steps.find((step) => step.id === "s6-deliver-plan").requires.includes("$confirmed:s5-confirm-cuts"));
  assert.ok(checked.steps.find((step) => step.id === "s6-deliver-plan").requires.includes("$draft_plan"));
  const repaired = await repairWorkflowPlan(context, () => assert.fail("deterministic normalization must not spend a model request"));
  assert.equal(repaired.attempts, 0);
});

test("a uniquely earliest state writer initializes fields before later revisions mutate them", async () => {
  const context = { capabilities: [cap("core", "llm", "Request", "Weekly plan")], inputs: [], workflowSteps: [
    { ...node("resolve-weekly-inputs", ["$request"], ["$input_required"], "await-input"), resumeProduces: ["$feedback"] },
    { ...node("plan-weekly-priorities", ["$request"], ["weeklyPlanDraft"]), mutates: ["currentWeekPlan", "uncertaintyFlags", "defaultPreference"] },
    { ...node("revise-scoped-days", ["weeklyPlanDraft", "$feedback"], ["revisedWeeklyPlan"]), mutates: ["currentWeekPlan", "uncertaintyFlags", "userCorrections"] },
    { ...node("deliver-weekly-plan", ["revisedWeeklyPlan", "currentWeekPlan", "uncertaintyFlags", "defaultPreference", "userCorrections"], ["$output"], "deliver"), delivers: ["revisedWeeklyPlan"] },
  ] };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, true, checked.issues.join("; "));
  const first = checked.steps.find((step) => step.id === "plan-weekly-priorities");
  const revision = checked.steps.find((step) => step.id === "revise-scoped-days");
  assert.deepEqual(first.mutates, []);
  assert.ok(["currentWeekPlan", "uncertaintyFlags", "defaultPreference"].every((token) => first.produces.includes(token)));
  assert.deepEqual(revision.mutates, ["currentWeekPlan", "uncertaintyFlags"]);
  assert.ok(["currentWeekPlan", "uncertaintyFlags"].every((token) => revision.requires.includes(token)));
  assert.ok(revision.produces.includes("userCorrections"));
  const repaired = await repairWorkflowPlan(context, () => assert.fail("deterministic state initialization must not call the model"));
  assert.equal(repaired.attempts, 0);
});

test("a unique state revision is explicitly ordered before its unique delivery reader", async () => {
  const context = { capabilities: [cap("core", "llm", "Request", "Weekly plan")], inputs: [], workflowSteps: [
    { ...node("plan-weekly-priorities", ["$request"], ["currentWeekPlan", "uncertaintyFlags", "conflictFlags"]), action: "Create the initial weekly plan state" },
    { ...node("collect-corrections", ["currentWeekPlan"], ["$input_required"], "await-input"), resumeProduces: ["$feedback"] },
    { ...node("revise-indicated-days", ["currentWeekPlan", "uncertaintyFlags", "conflictFlags", "$feedback"], ["revisionSummary"]), mutates: ["currentWeekPlan", "uncertaintyFlags", "conflictFlags"] },
    { ...node("deliver-week-plan", ["currentWeekPlan", "uncertaintyFlags", "conflictFlags"], ["$output"], "deliver"), delivers: ["currentWeekPlan"] },
    { ...node("consume-revision-summary", ["revisionSummary"], ["revisionAudit"]), role: "validate" },
    { ...node("deliver-audit", ["revisionAudit"], ["$output"], "deliver"), delivers: ["revisionAudit"] },
  ] };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, true, checked.issues.join("; "));
  const revision = checked.steps.find((step) => step.id === "revise-indicated-days");
  const delivery = checked.steps.find((step) => step.id === "deliver-week-plan");
  const completion = revision.produces.find((token) => token.startsWith("state:") && token.endsWith(":updated-by:revise-indicated-days"));
  assert.ok(completion, "one explicit completion edge orders all fields written by the same unique revision");
  assert.ok(delivery.requires.includes(completion));
  const repaired = await repairWorkflowPlan(context, () => assert.fail("unique state handoff must not call the model"));
  assert.equal(repaired.attempts, 0);
});

test("a terminal-only handoff delivers its unique validated artifact", async () => {
  const context = { capabilities: [cap("core", "llm", "Request", "Weekly plan")], inputs: [], workflowSteps: [
    node("plan", ["$request"], ["weeklyPlan"]),
    node("validate", ["weeklyPlan"], ["validatedWeekPlan"], "validate"),
    { ...node("deliver-week-plan", ["validatedWeekPlan"], ["$output"], "deliver"), delivers: ["$output"] },
  ] };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, true, checked.issues.join("; "));
  assert.deepEqual(checked.steps.find((step) => step.id === "deliver-week-plan").delivers, ["validatedWeekPlan"]);
});

test("a terminal-only handoff cannot discard the sole produced business artifact when raw input is also present", async () => {
  const context = { capabilities: [cap("core", "llm", "Request", "Task table")], inputs: [{ id: "material", name: "原始材料", required: true }], workflowSteps: [
    node("extract-actions", ["input:material"], ["actionTable"]),
    { ...node("s4-deliver", ["input:material"], ["$output"], "deliver"), delivers: ["$output"] },
  ] };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, true, checked.issues.join("; "));
  const delivery = checked.steps.find((step) => step.id === "s4-deliver");
  assert.deepEqual(delivery.delivers, ["actionTable"]);
  assert.ok(delivery.requires.includes("actionTable"));
});

test("a missing-input branch does not replace normal delivery of an already produced result", async () => {
  const context = { capabilities: [cap("core", "llm", "Contract", "Risk list")], inputs: [], workflowSteps: [
    node("review-contract", ["$request"], ["riskList"]),
    { ...node("step-deliver", ["riskList"], ["$input_required"], "await-input"), delivers: ["riskList"], resumeProduces: ["$feedback"] },
  ] };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, true, checked.issues.join("; "));
  assert.equal(checked.steps.find((step) => step.id === "step-deliver").role, "await-input");
  const delivery = checked.steps.find((step) => step.id === "step-final-delivery");
  assert.ok(delivery, "normal completion hand-off is compiled beside the missing-input branch");
  assert.deepEqual(delivery.delivers, ["riskList"]);
  assert.ok(delivery.produces.includes("$output"));
});

test("a resumed raw input is not protected as a business deliverable during graph repair", async () => {
  const context = { capabilities: [cap("core", "llm", "Request", "Organized result")], inputs: [{ id: "input-custom-adjustment", name: "用户补充的调整要求", required: false }], workflowSteps: [
    node("organize", ["$request"], ["organizedResult"]),
    { ...node("revise-result", ["organizedResult"], ["$input_required"], "await-input"), resumeProduces: ["input:input-custom-adjustment"] },
    node("polish-result", ["missingDraft"], ["finalResult"]),
  ] };
  assert.equal(inspectWorkflowPlan(context).valid, false);
  const result = await repairWorkflowPlan(context, async () => ({
    stepUpdates: [
      { id: "revise-result", changes: { resumeProduces: ["$feedback"] } },
      { id: "polish-result", changes: { requires: ["organizedResult"] } },
    ],
    addedSteps: [{ ...node("deliver-result", ["finalResult"], ["$output"], "deliver"), delivers: ["finalResult"] }],
  }));
  assert.equal(result.attempts, 1);
  assert.equal(result.workflowSteps.find((step) => step.id === "revise-result").role, "await-input");
  assert.ok(!result.workflowSteps.some((step) => step.produces.includes("input:input-custom-adjustment") || step.resumeProduces?.includes("input:input-custom-adjustment")));
  assert.ok(result.workflowSteps.some((step) => step.produces.includes("$output")));
});

test("a declared deterministic format test is bound to its real step and its receipt gates delivery", async () => {
  const context = { capabilities: [
    cap("core", "llm", "Weekly notes", "Weekly report"),
    { ...cap("script-tests-report-format", "script", "Weekly report", "format check result"), purpose: "Validate report format and length" },
  ], inputs: [], workflowSteps: [
    node("compose-report", ["$request"], ["report"]),
    { ...node("step-run-format-script-tests", ["report"], ["$format_check_result"], "validate", ["core"]), action: "Run report format tests" },
    { ...node("deliver-report", ["report"], ["$output"], "deliver"), delivers: ["report"] },
  ] };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, true, checked.issues.join("; "));
  assert.ok(!checked.steps.some((step) => step.id === "step-capability-script-tests-report-format"));
  assert.ok(checked.steps.find((step) => step.id === "step-run-format-script-tests").capabilityIds.includes("script-tests-report-format"));
  assert.ok(checked.steps.find((step) => step.id === "deliver-report").requires.includes("$format_check_result"));
});

test("longitudinal loops are removed at the canonical boundary when persistent state is absent", () => {
  const ir = {
    schemaVersion: "3.0",
    stateRequirement: { needed: false, scope: "none" },
    controlModel: { scopes: [{ id: "retry", scope: "task-retry" }, { id: "history", scope: "longitudinal" }], escalationConditions: [] },
    capabilityDelta: { skillMustTeach: [], modelAlreadyKnows: [], toolOrHostOnly: [], excludedGenericKnowledge: [] },
    domainEvidence: [],
    knowledgeAssessment: { status: "not-needed", missingCategories: [] },
  };
  const fixed = reconcileSkillIRStateLoops(ir);
  assert.deepEqual(fixed.controlModel.scopes.map((scope) => scope.scope), ["task-retry"]);
  assert.match(fixed.controlModel.escalationConditions.join(" "), /跨会话/);
});

test("orphaned outputs from one reader feed the unique root semantic transform", async () => {
  const context = { capabilities: [cap("core", "llm", "Request", "Weekly plan")], inputs: [], workflowSteps: [
    { ...node("read-weekly-inputs", ["$request"], ["weeklyTaskList", "dailyEnergyLevels"], "read"), capabilityIds: ["core"] },
    { ...node("plan-weekly-priorities", ["$request"], ["weeklyPlan"]), capabilityIds: ["core"] },
    node("validate", ["weeklyPlan"], ["validatedWeekPlan"], "validate"),
    { ...node("deliver", ["validatedWeekPlan"], ["$output"], "deliver"), delivers: ["validatedWeekPlan"] },
  ] };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, true, checked.issues.join("; "));
  assert.ok(["weeklyTaskList", "dailyEnergyLevels"].every((token) => checked.steps.find((step) => step.id === "plan-weekly-priorities").requires.includes(token)));
  const repaired = await repairWorkflowPlan(context, () => assert.fail("unique read wiring must not call the model"));
  assert.equal(repaired.attempts, 0);
});

test("a unique delivery retains every orphaned companion artifact without model repair", async () => {
  const context = { capabilities: [cap("core", "llm", "Tasks and constraints", "Weekly plan")], inputs: [], workflowSteps: [
    { ...node("step-parse-input", ["$request"], ["parsedTasks", "unavailableSlots", "missingFlags"]), capabilityIds: ["core"] },
    { ...node("step-estimate-duration", ["parsedTasks"], ["estimatedTasks", "estimateNotes"]), capabilityIds: ["core"] },
    { ...node("step-schedule", ["estimatedTasks"], ["draftPlan", "conflictCandidates"]), capabilityIds: ["core"] },
    { ...node("step-deliver", ["draftPlan"], ["$output"], "deliver", ["core"]), delivers: ["draftPlan"] },
  ] };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, true, checked.issues.join("; "));
  const delivery = checked.steps.find((step) => step.id === "step-deliver");
  for (const token of ["unavailableSlots", "missingFlags", "estimateNotes", "conflictCandidates"]) {
    assert.ok(delivery.requires.includes(token), `${token} must gate the final hand-off`);
    assert.ok(delivery.delivers.includes(token), `${token} must remain observable instead of disappearing`);
  }
  const repaired = await repairWorkflowPlan(context, () => assert.fail("unique companion wiring must not spend a model request"));
  assert.equal(repaired.attempts, 0);
});

test("orphaned companions remain strict when multiple delivery branches make ownership ambiguous", () => {
  const context = { capabilities: [cap("core", "llm", "Request", "Report")], inputs: [], workflowSteps: [
    { ...node("analyze", ["$request"], ["draft", "notes"]), capabilityIds: ["core"] },
    { ...node("deliver-draft", ["draft"], ["$output"], "deliver", ["core"]), delivers: ["draft"] },
    { ...node("revise", ["draft", "$feedback"], ["revision"]), capabilityIds: ["core"] },
    { ...node("deliver-revision", ["revision"], ["$output"], "deliver", ["core"]), delivers: ["revision"] },
  ] };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, false);
  assert.ok(checked.issues.some((issue) => issue.includes("notes 没有被消费")));
});

test("declared session state and checkpoint-owned replies normalize without a repair request", async () => {
  const context = {
    capabilities: [cap("core", "llm", "Product facts and audience", "Draft and revision")],
    inputs: [],
    stateFields: ["draftStatus"],
    workflowSteps: [
      node("s1-read-brief", ["$request"], ["brief"]),
      { ...node("s2-generate-draft", ["brief"], ["draft"]), mutates: ["draftStatus"] },
      { ...node("s3-deliver-draft", ["draft"], ["draftPresented", "$draft_feedback", "$draft_approved", "$output"], "deliver"),
        delivers: ["draft", "$draft_feedback", "$draft_approved"], mutates: ["draftStatus"] },
      { ...node("s4-await-feedback", ["draftPresented"], ["$input_required"], "await-input"),
        resumeProduces: ["$draft_feedback", "$draft_approved"], mutates: ["draftStatus"] },
      { ...node("s5-revise", ["draft", "$draft_feedback", "$draft_approved"], ["revisedDraft"]), mutates: ["draftStatus"] },
      { ...node("s6-deliver-revision", ["revisedDraft"], ["$output"], "deliver"), delivers: ["revisedDraft"], mutates: ["draftStatus"] },
    ],
  };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, true, checked.issues.join("; "));
  const preview = checked.steps.find((step) => step.id === "s3-deliver-draft");
  assert.ok(!preview.produces.includes("$draft_feedback") && !preview.produces.includes("$draft_approved"));
  assert.deepEqual(preview.delivers, ["draft"]);
  const checkpoint = checked.steps.find((step) => step.id === "s4-await-feedback");
  assert.deepEqual(checkpoint.resumeProduces, ["$draft_feedback", "$draft_approved"]);
  assert.ok(checked.steps.filter((step) => step.mutates.includes("draftStatus")).every((step) => step.requires.includes("draftStatus")));
  assert.ok(checked.initialInputs.includes("draftStatus"));
  const repaired = await repairWorkflowPlan(context, () => assert.fail("declared state and reply ownership are deterministic bindings"));
  assert.equal(repaired.attempts, 0);
});

test("explicit checkpoint tokens in step prose become real dependencies", () => {
  const context = {
    capabilities: [cap("core", "llm", "Brief", "Draft")], inputs: [], workflowSteps: [
      { ...node("ask-for-details", ["$request"], ["$input_required"], "await-input"), resumeProduces: ["$supplemented_inputs"] },
      { ...node("write-draft", ["$request"], ["draft"]), input: "$request and $supplemented_inputs" },
      { ...node("deliver-draft", ["draft"], ["$output"], "deliver"), delivers: ["draft"] },
    ],
  };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, true, checked.issues.join("; "));
  assert.ok(checked.steps.find((step) => step.id === "write-draft").requires.includes("$supplemented_inputs"));
});

test("normal workflow path does not require a reply from an optional insufficiency branch", () => {
  const context = {
    capabilities: [cap("core", "llm", "Weekly records", "Report")], inputs: [], workflowSteps: [
      { ...node("read", ["$request"], ["$records_read"]), input: "$request" },
      { ...node("ask-if-insufficient", ["$records_read"], ["$input_required"], "await-input"), resumeProduces: ["$supplemented_records"] },
      { ...node("compose", ["$records_read", "$supplemented_records"], ["$draft"]),
        input: "$records_read（及用户补充后的 $supplemented_records，如触发不足分支）", when: "$records_read 判定记录充足" },
      { ...node("deliver", ["$draft"], ["$output"], "deliver"), delivers: ["$draft"] },
    ],
  };
  const checked = inspectWorkflowPlan(context);
  const compose = checked.steps.find((step) => step.id === "compose");
  assert.ok(!compose.requires.includes("$supplemented_records"));
  assert.match(compose.input, /若有/);
});

test("an output-less request for missing weekly focus becomes a real pause terminal", () => {
  const context = {
    capabilities: [cap("core", "llm", "Weekly records", "Report")], inputs: [], workflowSteps: [
      { ...node("read", ["$request"], ["records"]), input: "$request" },
      { ...node("step-resolve-weekly-focus", ["records"], [], "transform"), when: "缺少本周重点时", action: "询问用户补充本周重点，等待回复", output: "本周重点", fallback: "未回复时暂停" },
      { ...node("deliver", ["records"], ["$output"], "deliver"), delivers: ["records"] },
    ],
  };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, true, checked.issues.join("; "));
  assert.equal(checked.steps.find((step) => step.id === "step-resolve-weekly-focus")?.role, "await-input");
  assert.ok(checked.steps.find((step) => step.id === "step-resolve-weekly-focus")?.produces.includes("$input_required"));
});

test("checkpoint control markers and optional file availability do not become business dependencies", async () => {
  const hostFile = {
    id: "host-file-workspace", kind: "builtin-tool", input: "用户授权范围内的文件路径和任务要求",
    output: "可验证的文件内容或明确的文件变更", fallback: "只给出可复制文本",
    requirement: "按任务读取、创建、修改和检查本地文件", purpose: "处理真实文件",
    routingCondition: "任务明确涉及已有文件、项目目录或文件交付时", optional: true,
    scope: "conditional", affects: ["output-contract"],
  };
  const context = {
    capabilities: [cap("core", "llm", "Customer message", "Reply draft"), hostFile], inputs: [], workflowSteps: [
      node("resolve", ["$request", "$source"], ["$customer_email", "$order_status"]),
      { ...node("missing-email", ["$input_required"], ["$input_required"], "await-input"), input: "$input_required", resumeProduces: ["$customer_email"] },
      { ...node("draft", ["$customer_email"], ["$draft_reply"]), input: "$customer_email、$order_status" },
      { ...node("deliver-draft", ["$draft_reply"], ["$output"], "deliver"), delivers: ["$draft_reply"] },
      { ...node("confirm", ["$output"], ["$approval_required"], "await-approval"), input: "$approval_required", resumeProduces: ["$confirmed"] },
      node("formalize", ["$draft_reply", "$confirmed"], ["$formal_reply"]),
      { ...node("deliver-formal", ["$formal_reply"], ["$output"], "deliver"), delivers: ["$formal_reply"] },
    ],
  };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, true, checked.issues.join("; "));
  const missing = checked.steps.find((step) => step.id === "missing-email");
  assert.ok(!missing.requires.includes("$input_required"));
  const confirm = checked.steps.find((step) => step.id === "confirm");
  assert.ok(!confirm.requires.includes("$output"));
  assert.ok(confirm.requires.includes("$draft_reply"));
  assert.ok(!checked.steps.some((step) => step.id === "step-capability-host-file-workspace"));
  assert.ok(checked.steps.some((step) => step.availableCapabilityIds?.includes("host-file-workspace")));
  const repaired = await repairWorkflowPlan(context, () => assert.fail("control markers and optional host tools bind deterministically"));
  assert.equal(repaired.attempts, 0);
});

test("unused optional file capability cannot create an orphan workflow step", async () => {
  const file = {
    id: "host-file-workspace", kind: "builtin-tool", input: "用户授权的文件", output: "可验证的文件内容",
    requirement: "按需读取或修改文件", purpose: "处理真实文件", fallback: "未授权时不操作文件",
    optional: true, scope: "conditional", affects: ["output-contract"],
  };
  const context = { capabilities: [cap("core", "llm", "Weekly records", "Weekly report"), file], inputs: [], workflowSteps: [
    node("validate", ["$request"], ["draft"], "validate"),
    { ...node("deliver", ["draft"], ["$output"], "deliver"), delivers: ["draft"] },
  ] };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, true, checked.issues.join("; "));
  assert.ok(!checked.steps.some((step) => step.id === "step-capability-host-file-workspace"));
  const repaired = await repairWorkflowPlan(context, () => assert.fail("unused optional capability must not trigger model repair"));
  assert.equal(repaired.attempts, 0);
  assert.ok(repaired.workflowSteps.some((step) => step.id === "deliver"));
});

test("alternative terminal deliveries may close the same declared state without a fake cross-branch edge", async () => {
  const context = {
    capabilities: [cap("core", "llm", "Brief", "Draft")], inputs: [], stateFields: ["draftDelivered"], workflowSteps: [
      node("write-draft", ["$request"], ["draft"]),
      { ...node("deliver-original", ["draft"], ["$output"], "deliver"), delivers: ["draft"], mutates: ["draftDelivered"] },
      { ...node("await-feedback", ["draft"], ["$input_required"], "await-input"), resumeProduces: ["$feedback"] },
      node("revise-draft", ["draft", "$feedback"], ["revisedDraft"]),
      { ...node("deliver-revised", ["revisedDraft"], ["$output"], "deliver"), delivers: ["revisedDraft"], mutates: ["draftDelivered"] },
    ],
  };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, true, checked.issues.join("; "));
  assert.ok(checked.steps.filter((step) => step.mutates.includes("draftDelivered")).every((step) => step.requires.includes("draftDelivered")));
  const repaired = await repairWorkflowPlan(context, () => assert.fail("conditional terminal state writes are already explicit"));
  assert.equal(repaired.attempts, 0);
});

test("alternative draft branches commit their shared final state only at their own handoffs", async () => {
  const context = {
    capabilities: [cap("core", "llm", "Weekly records", "Weekly report")], inputs: [],
    stateFields: ["finalReport"], workflowSteps: [
      node("categorize-records", ["$request"], ["categoryStructure"]),
      { ...node("draft-report", ["categoryStructure", "finalReport"], ["draftReport"]), input: "categoryStructure", mutates: ["finalReport"] },
      { ...node("await-structure-feedback", ["categoryStructure"], ["$input_required"], "await-input"), resumeProduces: ["$feedback"] },
      node("revise-structure", ["categoryStructure", "$feedback"], ["revisedStructure"]),
      { ...node("draft-report-revised", ["revisedStructure", "finalReport"], ["revisedReport"]), input: "revisedStructure", mutates: ["finalReport"] },
      { ...node("deliver-original", ["draftReport"], ["$output"], "deliver"), delivers: ["draftReport"] },
      { ...node("deliver-revised", ["revisedReport"], ["$output"], "deliver"), delivers: ["revisedReport"] },
    ],
  };
  const checked = inspectWorkflowPlan(context);
  assert.equal(checked.valid, true, checked.issues.join("; "));
  assert.ok(checked.steps.filter((step) => step.id.startsWith("draft-report")).every((step) => !step.mutates.includes("finalReport")));
  assert.ok(checked.steps.filter((step) => step.id.startsWith("deliver-")).every((step) => step.mutates.includes("finalReport") && step.requires.includes("finalReport")));
  assert.ok(!checked.steps.find((step) => step.id === "draft-report-revised").requires.includes("draftReport"), "alternative branch must not run an unchosen draft first");
  assert.deepEqual(normalizeWorkflowPlanBindings({ ...context, workflowSteps: checked.steps }), checked.steps);
  const repaired = await repairWorkflowPlan(context, () => assert.fail("alternative branch state commit must not call the model"));
  assert.equal(repaired.attempts, 0);
  for (const attached of [false, true]) {
    const withReference = structuredClone(context);
    withReference.capabilities.push(cap("guide", "reference", "Context", "Guidance"));
    if (attached) withReference.workflowSteps.filter((step) => step.id.startsWith("draft-report"))
      .forEach((step) => step.capabilityIds.push("guide"));
    const checkedReference = inspectWorkflowPlan(withReference);
    assert.equal(checkedReference.valid, true, checkedReference.issues.join("; "));
    assert.deepEqual(inspectWorkflowPlan({ ...withReference, workflowSteps: checkedReference.steps }).steps, checkedReference.steps);
  }
});

test("safe partial repair survives a failed invocation and rejected patches never overwrite it", async () => {
  const { context, repaired } = fixture();
  let saved;
  let calls = 0;
  await assert.rejects(repairWorkflowPlan(context, async () => {
    calls++;
    if (calls === 1) return { workflowSteps: repaired.map((step) => step.id === "extract-resume" ? { ...step, input: "$resume_pdf", requires: ["$resume_pdf"] } : step) };
    return { stepUpdates: [{ id: "analyze-specification", changes: { id: "forbidden-rename" } }] };
  }, undefined, (steps) => { saved = steps; }), /WORKFLOW_DAG_INVALID/);
  assert.ok(saved.some((step) => step.id === "analyze-specification"));
  assert.ok(!saved.some((step) => step.id === "forbidden-rename"));
  const result = await repairWorkflowPlan({ ...context, workflowSteps: saved }, async (request) => {
    assert.ok(request.workflowSteps.some((step) => step.id === "analyze-specification"));
    return { workflowSteps: repaired };
  });
  assert.equal(result.attempts, 1);
});

test("shared delivery or intermediate state reads do not silently suppress unordered writes", () => {
  const base = {
    capabilities: [cap("core", "llm", "Source", "Report")], inputs: [], stateFields: ["finalReport"], workflowSteps: [
      { ...node("draft-a", ["$request"], ["draftA"]), mutates: ["finalReport"] },
      { ...node("draft-b", ["$request"], ["draftB"]), mutates: ["finalReport"] },
      { ...node("deliver", ["draftA", "draftB"], ["$output"], "deliver"), delivers: ["draftA", "draftB"] },
    ],
  };
  assert.ok(inspectWorkflowPlan(base).issues.some((issue) => issue.includes("未排序的读写/写写冲突")));
  const withReader = structuredClone(base);
  withReader.workflowSteps.splice(2, 0, node("inspect-state", ["finalReport"], ["inspection"]));
  withReader.workflowSteps[3].requires.push("inspection");
  assert.ok(inspectWorkflowPlan(withReader).issues.some((issue) => issue.includes("未排序的读写/写写冲突")));
  const explicitStateRead = structuredClone(base);
  explicitStateRead.workflowSteps[0].input = "finalReport";
  assert.ok(inspectWorkflowPlan(explicitStateRead).issues.some((issue) => issue.includes("未排序的读写/写写冲突")));
});

test("invalid root producers can be corrected without deleting real task outputs", async () => {
  const draft = node("draft", ["input:material"], ["$draft"]);
  const bad = { ...node("wait", [], ["input:material", "$input_required"], "await-input"), resumeProduces: [] };
  const delivery = { ...node("deliver", ["$draft"], ["$output", "$output_revised"], "deliver"), delivers: ["$draft"] };
  const context = { capabilities: [cap("core", "llm", "Source", "Report")], inputs: [{ id: "material", name: "Source", required: true }], workflowSteps: [bad, draft, delivery] };
  const result = await repairWorkflowPlan(context, async () => ({ workflowSteps: [
    { ...bad, produces: ["$input_required"], resumeProduces: ["input:material"] }, draft, { ...delivery, produces: ["$output"] },
  ] }));
  assert.equal(result.attempts, 1);
  assert.ok(result.workflowSteps.find((step) => step.id === "draft").produces.includes("$draft"));
});

// Reconstructed from the reported error, not a copy of private session data.
// The same broken graph is exercised with three unrelated task vocabularies.
function fixture(domain = "resume") {
  const tokens = domain === "resume"
    ? ["$resume_pdf", "$resume_text", "$jd_keywords", "$jd_requirements", "$relevant_projects", "$rewritten_resume", "$revised_resume"]
    : domain === "budget"
      ? ["$transactions_csv", "$transactions", "$budget_categories", "$budget_constraints", "$relevant_expenses", "$budget_report", "$revised_report"]
      : ["$release_spec", "$release_records", "$audience_terms", "$release_requirements", "$relevant_changes", "$release_notes", "$revised_notes"];
  const [raw, parsed, keywords, requirements, selected, draft, revised] = tokens;
  const context = {
    inputs: [{ id: "source", name: "Original material", required: true }, { id: "brief", name: "Target specification", required: true }],
    capabilities: [cap("core", "llm", "Material and target specification", "Requested content"), cap("reader", "builtin-tool", "Source file", "Parsed records"), cap("host-web-search", "builtin-tool", "Specific open question", "Supported evidence")],
    workflowSteps: [
      node(`extract-${domain}`, [raw], [parsed], "read", ["reader"]),
      node(`rewrite-${domain}`, [parsed, keywords, requirements, selected], [draft]),
      node(`revise-${domain}`, [draft, "$feedback"], [revised]),
      node("step-capability-host-web-search", ["unbound:step-capability-host-web-search:input"], ["capability:host-web-search:output"], "read", ["host-web-search"]),
    ],
  };
  const repaired = [
    { ...node(`extract-${domain}`, ["input:source"], [parsed], "read", ["reader"]), action: "Read the actual supplied file with the host reader; ask if missing" },
    node("analyze-specification", ["input:brief"], [keywords, requirements]),
    node("select-relevant-records", [parsed, requirements], [selected]),
    { ...node(`rewrite-${domain}`, [parsed, keywords, requirements, selected], [draft], "transform", ["core", "host-web-search"]), action: "Compose from the selected records. Only for a specific unresolved external fact, search and verify sources; otherwise continue without search." },
    { ...node("deliver-normal", [draft], ["$output"], "deliver"), delivers: [draft], when: "Draft satisfies the confirmed output contract" },
    { ...node("collect-feedback", [draft], ["$input_required"], "await-input"), action: "Show the draft and wait for actual user feedback", resumeProduces: ["$feedback"], when: "User wants a revision" },
    node(`revise-${domain}`, [draft, "$feedback"], [revised]),
    { ...node("deliver-revision", [revised], ["$output"], "deliver"), delivers: [revised], when: "Revised result satisfies the confirmed output contract" },
  ];
  return { context, repaired, tokens };
}

test("reported missing input/intermediate/feedback/search/terminal errors are reproduced before repair", () => {
  const { context } = fixture();
  const result = inspectWorkflowPlan(context);
  assert.equal(result.valid, false);
  for (const token of ["$resume_pdf", "$jd_keywords", "$jd_requirements", "$relevant_projects", "$feedback", "unbound:step-capability-host-web-search:input"]) {
    assert.ok(result.issues.some((message) => message.includes(`依赖未满足：${token}`)), token);
    assert.ok(!result.initialInputs.includes(token));
  }
  assert.ok(result.issues.some((message) => message.includes("没有产生终态输出：$output")));
});

for (const domain of ["resume", "budget", "release"]) test(`bounded graph repair reconnects ${domain} without creating fake roots or blocking normal delivery on feedback`, async () => {
  const { context, repaired, tokens } = fixture(domain);
  const original = structuredClone(context);
  const events = [];
  const result = await repairWorkflowPlan(context, async (request) => {
    assert.equal(request.attempt, 1);
    assert.deepEqual(request.initialInputs, ["$request", "$source", "input:source", "input:brief"]);
    assert.ok(request.inputs.every((input) => /Not fabricated/.test(input.availability)));
    return { workflowSteps: repaired };
  }, (event) => events.push(event));
  assert.equal(result.attempts, 1);
  assert.deepEqual(context, original, "repair must not mutate the saved plan");
  assert.deepEqual(events.map((event) => event.status), ["repairing", "passed"]);
  assert.equal(inspectWorkflowPlan({ ...context, workflowSteps: result.workflowSteps }).valid, true);
  const order = result.workflowSteps.map((step) => step.id);
  assert.ok(order.indexOf(`extract-${domain}`) < order.indexOf(`rewrite-${domain}`));
  assert.ok(order.indexOf("analyze-specification") < order.indexOf(`rewrite-${domain}`));
  assert.ok(order.indexOf("collect-feedback") < order.indexOf(`revise-${domain}`));
  assert.deepEqual(result.workflowSteps.find((step) => step.id === "deliver-normal").requires, [tokens[5]]);
  assert.deepEqual(result.workflowSteps.find((step) => step.id === "collect-feedback").resumeProduces, ["$feedback"]);
  assert.ok(!result.workflowSteps.find((step) => step.id === "collect-feedback").produces.includes("$output"));
  assert.ok(result.workflowSteps.find((step) => step.id === `rewrite-${domain}`).capabilityIds.includes("host-web-search"));
});

test("already valid DAG incurs zero model requests and repair is idempotent", async () => {
  const { context, repaired } = fixture();
  const result = await repairWorkflowPlan({ ...context, workflowSteps: repaired }, async () => assert.fail("valid graph must not call AI"));
  assert.equal(result.attempts, 0);
  const repeat = await repairWorkflowPlan({ ...context, workflowSteps: result.workflowSteps }, async () => assert.fail("recheck must stay free"));
  assert.deepEqual(repeat, result);
});

test("unfixed graph stops after two proposals with precise feedback rather than weakening the gate", async () => {
  const { context } = fixture();
  let calls = 0;
  const events = [];
  await assert.rejects(repairWorkflowPlan(context, async (request) => {
    calls += 1;
    assert.equal(request.attempt, calls);
    return { workflowSteps: context.workflowSteps };
  }, (event) => events.push(event)), /WORKFLOW_DAG_INVALID.*2 轮.*\$resume_pdf/s);
  assert.equal(calls, 2);
  assert.equal(events.at(-1).status, "failed");
});

test("bad proposals cannot delete work, replace good dependencies with $request, or fabricate feedback", async () => {
  const { context, repaired } = fixture();
  for (const bad of [
    [],
    repaired.filter((step) => step.id !== "revise-resume"),
    repaired.map((step) => step.id === "rewrite-resume" ? { ...step, input: "$request", requires: ["$request"] } : step),
    repaired.map((step) => step.id === "collect-feedback" ? { ...step, role: "transform", action: "Infer feedback", produces: ["$feedback"], resumeProduces: [] } : step),
    repaired.map((step) => step.id === "rewrite-resume" ? { ...step, role: undefined, produces: [...step.produces, "$output"] } : step),
  ]) {
    let calls = 0;
    const result = await repairWorkflowPlan(context, async (request) => {
      calls += 1;
      if (calls === 2) assert.ok(request.issues.length, "second attempt receives rejection details");
      return { workflowSteps: calls === 1 ? bad : repaired };
    });
    assert.equal(result.attempts, 2);
  }
});

test("ownerless steps inherit a real semantic owner, and disabled capability ids cannot re-enter", async () => {
  const { context, repaired } = fixture();
  context.workflowSteps[0].capabilityIds = [];
  const inspected = inspectWorkflowPlan(context);
  assert.ok(!inspected.issues.some((issue) => issue.includes("extract-resume 缺少有效")));
  assert.ok(inspected.steps.find((step) => step.id === "extract-resume").capabilityIds.includes("core"));
  const result = await repairWorkflowPlan(context, async (request) => {
    assert.ok(request.workflowSteps.find((step) => step.id === "extract-resume").capabilityIds.includes("core"));
    return { workflowSteps: repaired };
  });
  assert.equal(result.attempts, 1);
  const withoutDisabled = inspectWorkflowPlan({ ...context, workflowSteps: repaired.map((step) => ({ ...step, capabilityIds: ["disabled-tool"] })) });
  assert.ok(withoutDisabled.steps.every((step) => !step.capabilityIds.includes("disabled-tool")));
});

test("invalid cyclic edges can be corrected without deleting the steps or their artifacts", async () => {
  const context = {
    inputs: [], capabilities: [cap("core", "llm", "$request", "report")],
    workflowSteps: [node("read", ["report"], ["records"], "read"), { ...node("compose", ["records"], ["report", "$output"], "deliver"), delivers: ["report"] }],
  };
  const result = await repairWorkflowPlan(context, async () => ({ workflowSteps: context.workflowSteps.map((step) => step.id === "read" ? { ...step, input: "$request", requires: ["$request"] } : step) }));
  assert.equal(result.attempts, 1);
  assert.deepEqual(result.workflowSteps.map((step) => step.id), ["read", "compose"]);
});

test("accepted repaired plan passes the actual Canonical SkillIR compiler and exports reply-owned feedback", async () => {
  const { context, repaired } = fixture("budget");
  const idea = "根据分析材料和目标说明整理预算报告";
  const answers = { inputs: "分析材料；目标说明" };
  const inputs = deriveTaskInputContract({ idea, answers });
  assert.ok(inputs.length >= 2);
  const workflowSteps = repaired.map((step) => ({ ...step,
    requires: step.requires.map((token) => token === "input:source" ? `input:${inputs[0].id}` : token === "input:brief" ? `input:${inputs[1].id}` : token),
    input: step.input.replaceAll("input:source", `input:${inputs[0].id}`).replaceAll("input:brief", `input:${inputs[1].id}`),
  }));
  const fixed = await repairWorkflowPlan({ ...context, inputs }, async () => ({ workflowSteps }));
  const ir = compileSkillIR({
    skillName: "budget-report", idea, answers,
    plan: { summary: idea, stateModel: { needed: true, scope: "session", missingBehavior: "Ask for missing material" },
      outcomeModel: { ultimateGoal: idea, controllableOutcomes: ["Report matches supplied evidence"], uncontrollableOutcomes: [], observableIndicators: ["Requested report is delivered"] },
      outputContract: { mode: "human", format: "Budget report", requiredSections: ["Report"], artifactPatterns: [], validation: [] },
      riskBranches: [], failureModes: [], workflowSteps: fixed.workflowSteps,
      items: context.capabilities.map((capability) => ({ ...capability, name: capability.id, path: "SKILL.md", layer: "runtime", scope: "task-specific", status: "generate", enabled: true,
        requirement: capability.input, purpose: capability.output, reason: "Required task operation", activationCondition: "When this task needs it", routingCondition: "When this task needs it", evaluationCriteria: ["Uses actual inputs"], mustNotAffect: [] })),
    },
    loop: { mode: "hybrid", goal: idea, maxRounds: 2, stopConditions: ["Result delivered"], escalationConditions: ["Input missing"], scopes: [] },
    requirements: [{ id: "goal", requirement: idea, provenance: "user_explicit", modality: "MUST", hard: true, source: "user" }],
  });
  assert.ok(ir.runtimeContract.workflow.some((step) => step.id === "deliver-revision"));
  assert.match(projectSkillMarkdown(ir), /Resume after real user reply only: `\$feedback`/);
});

test("live generator validates before paid research and again before Canonical compilation", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const build = page.slice(page.indexOf("async function compileSkill()"), page.indexOf("async function compileSkill()") + 12_000);
  const first = build.indexOf("await ensureValidGenerationWorkflow(generationPlan");
  const research = build.indexOf("await runBuildTimeKnowledgeCompiler");
  const last = build.lastIndexOf("await ensureValidGenerationWorkflow(generationPlan");
  const canonical = build.indexOf("const canonicalIR = createCanonicalSkillIR");
  assert.ok(first >= 0 && first < research && research < last && last < canonical);
  assert.doesNotMatch(build, /throw new Error\("CAPABILITY_DELTA_INSUFFICIENT/);
  assert.match(build, /未识别出需要额外教授的专业能力/);
  assert.match(page, /runtimeInputs: deriveTaskInputContract/);
  assert.doesNotMatch(page, /normalizedWorkflow\.map[^\n]+\.filter\(\(step\) => step\.capabilityIds\.length > 0\)/);
  const route = await readFile(new URL("../app/api/ai/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(mode === "workflow-repair"\) return/);
  assert.match(route, /system: WORKFLOW_REPAIR_PROMPT/);
});

test("binding diagnostics identify stages without leaking task content", () => {
  const context = { inputs: [], capabilities: [cap("core", "llm", "Input", "Output"), cap("guide", "reference", "Context", "Guidance")], workflowSteps: [
    node("draft", ["$request"], ["$draft"]),
    { ...node("finish", ["$draft"], ["$output"], "deliver"), delivers: ["$draft"] },
  ] };
  const checked = inspectWorkflowPlan(context);
  assert.ok(checked.bindingChanges.some((change) => change.stage === "bind-capabilities"));
  assert.ok(checked.bindingChanges.every((change) => Object.keys(change).sort().join(",") === "stage,stepIds"));
});

test("observed terse repair response inherits roles and control ownership, binds a declared file and routes optional search", async () => {
  const { context, repaired } = fixture();
  context.inputs = [{ id: "input-custom-简历", name: "简历", required: true, representations: ["pdf"] }, { id: "brief", name: "JD", required: true }];
  context.workflowSteps[0].input = "用户提供的简历PDF";
  context.capabilities[2] = { ...context.capabilities[2], optional: true, requirement: "Search and verify current sources", purpose: "Search for source evidence", activationCondition: "Only when a material claim needs fresh external verification" };
  const shortResponse = repaired.map((step) => {
    const { role, ...short } = step;
    if (step.id === "extract-resume") return { ...short, input: "用户提供的简历PDF", requires: ["$resume_pdf"] };
    if (step.id === "rewrite-resume") return { ...short, capabilityIds: ["core"] };
    if (step.id === "collect-feedback") return { ...short, action: "等待用户反馈", capabilityIds: ["user"] };
    if (step.id.startsWith("deliver-")) return { ...short, action: "交付最终结果", capabilityIds: [] };
    return short;
  });
  const result = await repairWorkflowPlan(context, async () => ({ workflowSteps: shortResponse }));
  assert.equal(result.attempts, 1, "missing boundary metadata must not waste the first graph repair");
  assert.deepEqual(result.workflowSteps.find((step) => step.id === "extract-resume").requires, ["input:input-custom-简历"]);
  for (const id of ["collect-feedback", "deliver-normal", "deliver-revision"]) assert.ok(result.workflowSteps.find((step) => step.id === id).capabilityIds.includes("core"));
  assert.ok(!result.workflowSteps.some((step) => step.id === "step-capability-host-web-search"));
  assert.ok(result.workflowSteps.find((step) => step.id === "rewrite-resume").capabilityIds.includes("host-web-search"));
});

test("ambiguous raw-file aliases and derived artifacts are never promoted to initial inputs", () => {
  const { context } = fixture();
  context.inputs = ["first", "second"].map((id) => ({ id, name: id, required: true, representations: ["pdf"] }));
  const inspected = inspectWorkflowPlan(context);
  assert.ok(inspected.issues.some((issue) => issue.includes("依赖未满足：$resume_pdf")));
  assert.ok(inspected.issues.some((issue) => issue.includes("依赖未满足：$jd_keywords")));
});

test("partial but structurally safe progress is supplied to the next graph-repair round", async () => {
  const { context, repaired } = fixture();
  let round = 0;
  const result = await repairWorkflowPlan(context, async (request) => {
    round += 1;
    if (round === 2) {
      assert.ok(request.workflowSteps.some((step) => step.id === "analyze-specification"));
      assert.ok(request.issues.some((issue) => issue.includes("$resume_pdf")));
    }
    return { workflowSteps: round === 1 ? repaired.map((step) => step.id === "extract-resume" ? { ...step, input: "$resume_pdf", requires: ["$resume_pdf"] } : step) : repaired };
  });
  assert.equal(result.attempts, 2);
});
