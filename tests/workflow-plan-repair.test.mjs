import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inspectWorkflowPlan, repairWorkflowPlan, normalizeWorkflowPlanBindings, applyWorkflowStepPatch } from "../app/workflow-plan-repair.ts";
import { compileSkillIR, deriveTaskInputContract, projectSkillMarkdown } from "../app/skill-ir.ts";

const cap = (id, kind, input, output) => ({ id, kind, input, output, fallback: "Stop the dependent branch if unavailable", affects: ["runtime-workflow"] });
const node = (id, requires, produces, role = "transform", capabilityIds = ["core"]) => ({
  id, requires, produces, role, capabilityIds, when: "When this operation is needed",
  input: requires.join(", "), action: id, output: produces.join(", "), fallback: "Ask for the missing input; do not invent it", mutates: [],
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
  ambiguous.workflowSteps[4].requires = ["$confirmed", "$request"];
  assert.equal(inspectWorkflowPlan(ambiguous).valid, false, "no guessed confirmation owner without matching reviewed content");
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
  const first = build.indexOf("await ensureValidGenerationWorkflow(generationPlan)");
  const research = build.indexOf("await runBuildTimeKnowledgeCompiler");
  const last = build.lastIndexOf("await ensureValidGenerationWorkflow(generationPlan)");
  const canonical = build.indexOf("const canonicalIR = createCanonicalSkillIR");
  assert.ok(first >= 0 && first < research && research < last && last < canonical);
  assert.match(page, /runtimeInputs: deriveTaskInputContract/);
  assert.doesNotMatch(page, /normalizedWorkflow\.map[^\n]+\.filter\(\(step\) => step\.capabilityIds\.length > 0\)/);
  const route = await readFile(new URL("../app/api/ai/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(mode === "workflow-repair"\) return/);
  assert.match(route, /system: WORKFLOW_REPAIR_PROMPT/);
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
