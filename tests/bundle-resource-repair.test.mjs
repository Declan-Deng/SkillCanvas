import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import * as canonical from "../app/canonical-mutations.ts";
import { compileSkillIR, auditSkillIRFiles, projectEvalBank, projectSkillIRFiles, bindSkillIREvals, ensureSkillIREvalCoverage, skillIRDigest } from "../app/skill-ir.ts";
import { isCapabilityDeltaContractIssue, isSkillIRProjectionIssue, rebuildSkillIRProjections, repairCapabilityDeltaContract, contractRepairFailureReason } from "../app/skill-projection-repair.ts";
import { validateBundleContentCoherence } from "../app/bundle-validator.ts";
import { compileWorkflowDag } from "../app/workflow-dag.ts";
import { validateImplementationFiles, applySkillIRMutations, validateCanonicalSkillIR } from "../app/canonical-mutations.ts";
import { reconcileRuntimeInputResources, missingBundleResources, deduplicateMissingResourceIssues, contractRepairProgress } from "../app/bundle-resource-repair.ts";
import { auditCapabilityClosure } from "../app/generation-loop-core.ts";
import { auditCrossArtifactConsistency } from "../app/skill-pipeline-core.ts";
import { capabilities, workflow } from "./fixtures/blueprint.mjs";
import { providerRepairNeedsUserAction } from "../app/eval-prompt.ts";
import { issuesAreCompilerOwnedEvalCoverage } from "../app/eval-repair-routing.ts";

function fixture(inputName = "合同 PDF", path = "references/contract.pdf") {
  const plan = structuredClone(capabilities.capabilityPlan);
  plan.items[0].input = inputName;
  const ir = compileSkillIR({ skillName: "inspect-document", idea: "检查提供的文档并交付文本报告", answers: { inputs: inputName }, plan, loop: workflow.loopPlan, requirements: [] });
  const input = ir.inputs.find((item) => item.name.includes(inputName.split(" ")[0])) || ir.inputs[0];
  const reference = { ...structuredClone(ir.capabilities.find((item) => item.kind === "llm")), id: "document-reader", kind: "reference", name: "读取输入文档",
    input: input.name, purpose: `读取 ${path}`, output: "已提取文本", implementation: { path, layer: "runtime", status: "use-provided" },
    necessity: { successLift: "high", bareModelReliable: false, deterministicNeed: false, realResourceAvailable: true, externalDependency: false, decision: "include", reason: "读取实际文件" }, evalCaseIds: [] };
  ir.capabilities.push(reference);
  ir.resourcePlan.resources.push({ capabilityId: reference.id, kind: "reference", path, decision: "include", reason: "Read input", consumerTaskIds: [ir.tasks[0].id] });
  ir.tasks[0].capabilityIds.push(reference.id);
  ir.runtimeContract.workflow = [
    { id: "read", capabilityIds: [reference.id], role: "read", when: "已提供", input: input.name, action: `读取 ${path}`, output: "提取文本", fallback: input.missingBehavior, requires: ["$request"], produces: ["$text"], mutates: [], delivers: [], resumeProduces: [] },
    { id: "report", capabilityIds: ["core"], role: "transform", when: "已读取", input: "文本", action: "生成检查报告", output: "报告", fallback: "说明缺失", requires: ["$text"], produces: ["$report"], mutates: [], delivers: [], resumeProduces: [] },
    { id: "deliver", capabilityIds: ["core"], role: "deliver", when: "报告就绪", input: "报告", action: "返回报告", output: "报告", fallback: "说明缺失", requires: ["$report"], produces: ["$output"], mutates: [], delivers: ["$report"], resumeProduces: [] },
  ];
  return { ir, input, reference };
}

function project(ir) {
  const bank = ensureSkillIREvalCoverage(ir, projectEvalBank(ir));
  const bound = bindSkillIREvals(ir, bank);
  return { ir: bound, files: projectSkillIRFiles(bound) };
}

test("runtime input repair has the same canonical digest before and after JSON persistence", () => {
  const repaired = reconcileRuntimeInputResources(fixture().ir, {});
  const restored = JSON.parse(JSON.stringify(repaired));
  assert.equal(skillIRDigest(repaired), skillIRDigest(restored));
  assert.deepEqual(auditSkillIRFiles(project(repaired).files).filter((issue) => /PROJECTION_DRIFT|已漂移/.test(issue)), []);
});

for (const [name, path] of [["合同 PDF", "references/contract.pdf"], ["实验记录 DOCX", "references/notes.docx"], ["销售数据 XLSX", "references/data.xlsx"]]) {
  test(`runtime material ${path} is read from the real input without fabricating a bundled file`, () => {
    const { ir, input } = fixture(name, path);
    const before = project(ir);
    assert.ok(auditSkillIRFiles(before.files).some((issue) => issue.includes(path) && issue.includes("不存在")));
    const repaired = reconcileRuntimeInputResources(ir, {});
    assert.notEqual(repaired, ir);
    const owner = repaired.capabilities.find((item) => item.id === "document-reader");
    assert.equal(owner.kind, "builtin-tool");
    assert.equal(owner.implementation.status, "requires-setup");
    assert.equal(owner.necessity.realResourceAvailable, false);
    assert.equal(owner.connection, undefined);
    assert.match(owner.input, new RegExp(input.id));
    assert.ok(owner.fallback.includes(input.missingBehavior));
    assert.equal(repaired.inputs.find((item) => item.id === input.id).availableAtBuild, false);
    assert.ok(repaired.runtimeContract.workflow[0].requires.includes(`input:${input.id}`));
    assert.deepEqual(repaired.runtimeContract.workflow.map((item) => item.produces), ir.runtimeContract.workflow.map((item) => item.produces));
    const dag = compileWorkflowDag(repaired.runtimeContract.workflow, ["$request", "$source", ...repaired.inputs.map((item) => `input:${item.id}`)]);
    assert.equal(dag.valid, true, JSON.stringify(dag.issues));
    const after = project(repaired);
    assert.equal(after.files[path], undefined);
    assert.ok(!after.files["SKILL.md"].includes(path));
    assert.ok(!auditSkillIRFiles(after.files).some((issue) => /实现文件不存在|缺少工具契约/.test(issue)));
    const manifest = JSON.parse(after.files["evals/capability-manifest.json"]);
    const closure = auditCapabilityClosure(after.files, manifest.capabilities);
    assert.ok(!closure.issues.some((issue) => issue.type === "missing-implementation"));
    assert.equal(reconcileRuntimeInputResources(repaired, after.files), repaired, "migration is idempotent");
    assert.equal(ir.capabilities.at(-1).kind, "reference", "caller data is unchanged");
  });
}

test("unrelated, build-time, ambiguous and already bundled references are not erased", () => {
  const { ir, input, reference } = fixture();
  reference.input = "权威行业标准";
  assert.equal(reconcileRuntimeInputResources(ir, {}), ir);
  assert.equal(missingBundleResources(ir, {}).length, 1);
  reference.input = input.name;
  assert.equal(reconcileRuntimeInputResources(ir, { [reference.implementation.path]: "existing bytes" }), ir);
  input.availableAtBuild = true;
  assert.equal(reconcileRuntimeInputResources(ir, {}), ir);
  input.availableAtBuild = false;
  ir.inputs.push({ ...input, id: "ambiguous-input" });
  assert.equal(reconcileRuntimeInputResources(ir, {}), ir);
});

test("waiting for a file does not acquire a dependency on the absent file", () => {
  const { ir } = fixture();
  ir.runtimeContract.workflow[0].role = "await-input";
  ir.runtimeContract.workflow[0].produces = ["$input_required"];
  const repaired = reconcileRuntimeInputResources(ir, {});
  assert.deepEqual(repaired.runtimeContract.workflow[0].requires, ["$request"]);
  assert.deepEqual(repaired.runtimeContract.workflow[0].produces, ["$input_required"]);
});

test("a model repair can bind a filename to an existing input without leaving stale readers", () => {
  const { ir, input, reference } = fixture();
  reference.input = "contract.pdf";
  assert.equal(reconcileRuntimeInputResources(ir, {}), ir, "no guessing from filenames");
  assert.throws(() => applySkillIRMutations(ir, [{ type: "capability.update", capabilityId: reference.id, changes: { kind: "builtin-tool" } }]), /RUNTIME_INPUT_BINDING_REQUIRED/);
  assert.throws(() => applySkillIRMutations(ir, [{ type: "capability.update", capabilityId: reference.id, changes: { kind: "builtin-tool", input: `input:${input.id}-wrong` } }]), /RUNTIME_INPUT_BINDING_REQUIRED/);
  const repaired = applySkillIRMutations(ir, [{ type: "capability.update", capabilityId: reference.id, changes: {
    kind: "builtin-tool", input: `input:${input.id}`,
    implementation: { path: reference.implementation.path, status: "use-provided" },
  } }]).ir;
  const after = project(repaired);
  assert.ok(!after.files["SKILL.md"].includes(reference.implementation.path));
  const owner = repaired.capabilities.find((item) => item.id === reference.id);
  assert.equal(owner.implementation.path, "integrations/tool-contracts.json");
  assert.equal(owner.implementation.status, "requires-setup");
  assert.ok(repaired.runtimeContract.workflow.find((item) => item.id === "read").requires.includes(`input:${input.id}`));
  assert.equal(validateCanonicalSkillIR(repaired).valid, true);
});

test("a real authored reference can be repaired together with its canonical path and routing", () => {
  const { ir, reference } = fixture();
  reference.input = "已确认的检查规则";
  const path = "references/review-rules.md";
  const updated = applySkillIRMutations(ir, [{ type: "capability.update", capabilityId: reference.id, changes: {
    implementation: { ...reference.implementation, path, status: "generate" },
    routingCondition: "检查文档之前读取已确认规则",
  } }]).ir;
  const document = "# 已确认检查规则\n\n对每项主张记录原文位置；没有支持材料时标注待补充，不补造来源。";
  const bytes = validateImplementationFiles(updated, { [path]: document });
  const after = project(updated);
  Object.assign(after.files, bytes);
  assert.equal(validateCanonicalSkillIR(updated).valid, true);
  assert.ok(after.files["SKILL.md"].includes(path));
  assert.ok(!after.files["SKILL.md"].includes("references/contract.pdf"), "no dangling original path in runtime readers");
  assert.ok(!auditSkillIRFiles(after.files).some((issue) => issue.includes("实现文件不存在")));
  assert.equal(after.files[path], document);
});

test("reference repairs reject fake binaries, protected projections, path traversal and undeclared files", () => {
  const { ir } = fixture();
  for (const path of ["references/contract.pdf", "references/domain-playbook.md", "references/source-evidence.md", "references/../override.md", "references/unowned.md"]) {
    assert.throws(() => validateImplementationFiles(ir, { [path]: "pretend contents" }), /IMPLEMENTATION_FILE_INVALID|REFERENCE_OWNER_MISSING/);
  }
  ir.capabilities.at(-1).implementation.path = "references/real.md";
  assert.throws(() => validateImplementationFiles(ir, { "references/real.md": " " }), /IMPLEMENTATION_FILE_INVALID/);
});

const issue = (type, evidence, files = [], capabilityId) => ({ id: type, priority: "P1", source: "closure", type, evidence, files, capabilityId });
test("one missing file reported by four validators remains one actionable blocker", () => {
  const { ir, reference } = fixture();
  const path = reference.implementation.path;
  const issues = [
    issue("P1_CONTRACT_BLOCKER", `能力 ${reference.id} 的实现文件不存在：${path}`, ["evals/skill-ir.json"]),
    issue("LEGACY_CONTRACT_BLOCKER", "1 项能力声明的具体实现文件不存在"),
    issue("DECLARED_WITHOUT_IMPLEMENTATION", `能力 ${reference.id} 已声明，但实现文件不存在。`, ["evals/capability-manifest.json", path]),
    issue("MISSING_IMPLEMENTATION", `能力 ${reference.id} 没有真实实现文件。`, [path], reference.id),
    issue("UNRELATED", "独立的契约问题"),
  ];
  const deduped = deduplicateMissingResourceIssues(issues, ir, {});
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0].type, "MISSING_IMPLEMENTATION");
  assert.deepEqual(deduped[0].files, [path]);
  assert.equal(deduped[1].type, "UNRELATED");
});

test("no-op and regressive repairs are not progress", () => {
  const a = issue("MISSING_IMPLEMENTATION", "missing document", ["references/rules.md"]);
  const b = issue("OUTPUT", "missing output");
  assert.equal(contractRepairProgress([a], [a]).improved, false);
  assert.match(contractRepairProgress([a], [a]).reason, /未解决任何阻塞/);
  assert.equal(contractRepairProgress([a], [b]).improved, false);
  assert.equal(contractRepairProgress([a, b], [a]).improved, true);
  assert.equal(contractRepairProgress([a], []).improved, true);
});

// Run the actual page repair coordinator and candidate application. Only the
// model and UI are mocked; IR mutation, resource validation and projection run.
async function runRepairScenario(responses, options = {}) {
  const source = ts.createSourceFile("page.tsx", await readFile(new URL("../app/page.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const wanted = new Set(["runP1ContractRepairLoop", "applyCanonicalCandidate"]);
  const functions = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && wanted.has(node.name?.text)) functions.push(node.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(functions.length, 2);
  const code = ts.transpileModule(functions.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const { ir } = fixture("合同 PDF", "references/check-rules.md");
  let initial = project(ir).files;
  if (options.evalCoverage) {
    const restored = canonical.parseCanonicalSkillIR(initial);
    const seed = JSON.stringify({ evals: [
      { id: "trigger-explicit", eval_family: "trigger", category: "trigger_explicit", should_trigger: true, capability_ids: [], prompt: "请使用这个 Skill 检查我提供的合同文档，并交付一份可以逐项核对的检查报告。" },
      { id: "trigger-implicit", eval_family: "trigger", category: "trigger_implicit", should_trigger: true, capability_ids: [], prompt: "文档和检查目标都已经提供，请沿用确认过的规则继续处理并给出可检查结果。" },
      { id: "trigger-context", eval_family: "trigger", category: "trigger_context", should_trigger: true, capability_ids: [], prompt: "继续检查下一份新文档，保持检查目标，但不要沿用上一份文档中的具体事实。" },
      { id: "trigger-negative", eval_family: "trigger", category: "trigger_negative", should_trigger: false, capability_ids: [], prompt: "只解释合同检查一般关注哪些问题，不要读取、修改或检查我提供的任何文档。" },
      {
        id: "core-document-check", eval_family: "capability", category: "core_capability", should_trigger: true,
        capability_ids: ["core"], graders: ["core_capability"], runnable: true,
        prompt: "合同约定交付日期为九月十五日，逾期每日按合同金额千分之一承担责任。请核对条款并交付带事实边界的检查报告。",
        context: { fixture_status: "ready" }, expected: { behaviors: ["交付合同检查报告"], artifacts: [] },
      },
    ] });
    const goodBank = ensureSkillIREvalCoverage(restored, seed);
    const goodIR = bindSkillIREvals(restored, goodBank);
    const badCases = goodIR.evaluationPlan.cases
      .filter((item) => item.category !== "failure_mode")
      .map((item) => Array.isArray(item.capability_ids) && item.capability_ids.includes("document-reader")
        ? { ...item, capability_ids: item.capability_ids.filter((id) => id !== "document-reader") }
        : item);
    const badBank = JSON.stringify({ version: "2.7", evals: badCases });
    const badIR = bindSkillIREvals(goodIR, badBank);
    initial = projectSkillIRFiles(badIR);
  }
  if (options.referencePresent) initial["references/check-rules.md"] = "# 检查规则\n保留原始证据。";
  if (options.drift) {
    const manifest = JSON.parse(initial["evals/capability-manifest.json"]);
    manifest.skill_ir.digest = "old-in-memory-digest";
    initial["evals/capability-manifest.json"] = JSON.stringify(manifest);
    initial["references/output-contract.md"] += "\nStale projection";
  }
  if (options.invalidCapabilityDelta) {
    const persisted = JSON.parse(initial["evals/skill-ir.json"]);
    persisted.capabilityDelta = {
      status: "ready", summary: "已识别能力差值", bareModelCan: ["读取输入"],
      skillMustTeach: [{
        id: "ordinary-workflow", taskDecision: "读取输入并输出结果",
        bareModelBehavior: "裸模型可以读取输入", requiredSkillBehavior: "读取输入并输出结果",
        whySkillIsNeeded: "确保结果完整", researchQuestions: ["有哪些通用最佳实践"],
      }],
      excludedGenericKnowledge: [], researchFocus: ["有哪些通用最佳实践"],
    };
    initial["evals/skill-ir.json"] = JSON.stringify(persisted, null, 2);
  }
  const events = [], calls = [];
  const collect = (files) => {
    const coverageIssues = options.evalCoverage ? [
      ...(!JSON.parse(files["evals/evals.json"]).evals.some((item) => item.category === "failure_mode")
        ? [issue("LEGACY_CONTRACT_BLOCKER", "评测未同时覆盖触发边界、领域核心能力和真实失败模式")]
        : []),
      ...auditCrossArtifactConsistency(files).issues.filter((item) => item.type === "CAPABILITY_WITHOUT_EVAL"),
    ] : [];
    return { audit: { warnings: [] }, closure: {}, crossArtifact: {}, issues: [
      ...validateBundleContentCoherence(files)
        .filter((item) => item.code === "NON_DEFENSIBLE_CAPABILITY_DELTA")
        .map((item) => issue(item.code, item.message, [item.path])),
      ...missingBundleResources(canonical.parseCanonicalSkillIR(files), files)
        .map((item) => issue("MISSING_IMPLEMENTATION", `能力 ${item.capabilityId} 的实现文件不存在：${item.path}`, [item.path], item.capabilityId)),
      ...auditSkillIRFiles(files).map((evidence) => issue("SKILL_IR_CLOSURE", evidence, ["evals/skill-ir.json"])).filter(isSkillIRProjectionIssue),
      ...coverageIssues,
    ] };
  };
  const validate = (files) => ({ executionReady: !(options.rebuildIntroducesP0 && files !== initial), contractReady: collect(files).issues.length === 0 });
  const deps = {
    ...canonical, reconcileRuntimeInputResources, missingBundleResources, contractRepairProgress, providerRepairNeedsUserAction,
    bindSkillIREvals, ensureSkillIREvalCoverage, projectEvalBank,
    isCapabilityDeltaContractIssue, isSkillIRProjectionIssue, contractRepairFailureReason,
    repairCapabilityDeltaContract,
    rebuildSkillIRProjections: options.noopRebuild ? (files) => ({ files, changedPaths: [] }) : rebuildSkillIRProjections,
    idea: "检查文档", loopPlan: workflow.loopPlan, BUILD_REPAIR_MAX_ROUNDS: 2,
    ensureCanonicalBundledResources: (value) => value,
    finalizeSkillFiles: (files, _idea, _answers, _source, _plan, _loop, value) => {
      const bank = ensureSkillIREvalCoverage(value, files["evals/evals.json"] || projectEvalBank(value));
      const bound = bindSkillIREvals(value, bank);
      return { ...files, ...projectSkillIRFiles(bound) };
    },
    validateBundle: async (files) => validate(files), collectP1ContractState: collect,
    issuesAreCompilerOwnedEvalCoverage,
    isSafeSkillFilePath: (path) => !path.includes(".."),
    allowedP1MutationTypes: () => ["identity.update", "capability.update"], canonicalMutationTargetCatalog: () => ({}),
    setBuildLoop: () => {}, setGenerationLoop: () => {}, setFiles: (files) => events.push({ event: "preserved-files", files }),
    reportClientGenerationLoopEvent: (event, data) => events.push({ event, ...data }),
    runP0StaticRepairLoop: async (files) => ({ files, validation: validate(files), rounds: 0 }),
    callAI: async (_mode, body) => {
      calls.push(structuredClone(body));
      const response = responses[Math.min(calls.length - 1, responses.length - 1)];
      if (response instanceof Error) throw Object.assign(response, { repairTest: { calls, events, initial } });
      return response;
    },
  };
  const run = new Function(...Object.keys(deps), `${code}\nreturn runP1ContractRepairLoop;`)(...Object.values(deps));
  const result = await run({ files: initial, validation: validate(initial), generationPlan: capabilities.capabilityPlan, answers: {}, sourceText: "", skillIR: ir });
  return { result, initial, events, calls };
}

test("production P1 repairs projection drift without a model call or consuming semantic rounds", async () => {
  const run = await runRepairScenario([], { drift: true, referencePresent: true });
  assert.equal(run.result.passed, true);
  assert.equal(run.result.rounds, 0);
  assert.equal(run.calls.length, 0);
  assert.equal(run.result.files["evals/skill-ir.json"], run.initial["evals/skill-ir.json"]);
  assert.equal(run.result.files["references/check-rules.md"], run.initial["references/check-rules.md"]);
  assert.ok(run.events.some((event) => event.phase === "projection-repair" && event.accepted));
});

test("production P1 closes missing failure coverage and a focused capability edge without a model call", async () => {
  const run = await runRepairScenario([], { evalCoverage: true, referencePresent: true });
  assert.equal(run.result.passed, true, run.result.failureReason);
  assert.equal(run.result.rounds, 1);
  assert.equal(run.calls.length, 0);
  assert.ok(run.events.some((event) => event.event === "generation_loop_candidate" && event.accepted === true));
});

test("production P1 repairs an invalid Capability Delta without any model call", async () => {
  const run = await runRepairScenario([], { invalidCapabilityDelta: true, referencePresent: true });
  assert.equal(run.result.passed, true, run.result.failureReason);
  assert.equal(run.result.rounds, 1);
  assert.equal(run.calls.length, 0);
  const restored = JSON.parse(run.result.files["evals/skill-ir.json"]);
  assert.equal(restored.capabilityDelta.status, "insufficient");
  assert.deepEqual(restored.capabilityDelta.skillMustTeach, []);
  assert.ok(run.events.some((event) => event.event === "generation_loop_candidate" && event.accepted === true));
});

test("production P1 removes projection blockers before asking the model about a real missing reference", async () => {
  const run = await runRepairScenario([{ implementationFiles: { "references/check-rules.md": "# 检查规则\n逐条核对来源。" } }], { drift: true });
  assert.equal(run.result.passed, true);
  assert.equal(run.calls.length, 1);
  assert.equal(run.result.rounds, 1);
  assert.ok(run.calls[0].evaluation.blockers.every((blocker) => !/PROJECTION_DRIFT|已漂移/.test(blocker)));
  assert.equal(run.calls[0].evaluation.missingResources.length, 1);
});

test("production P1 stops a no-op compiler repair without sending projections to the model", async () => {
  const run = await runRepairScenario([], { drift: true, referencePresent: true, noopRebuild: true });
  assert.equal(run.result.passed, false);
  assert.equal(run.calls.length, 0);
  assert.equal(run.result.files, run.initial);
  assert.match(run.result.failureReason, /程序重建未通过/);
  assert.match(run.result.failureReason, /评测尚未启动/);
  assert.doesNotMatch(run.result.failureReason, /不收敛|未收敛/);
});

test("production P1 rejects a projection candidate that introduces a P0 failure", async () => {
  const run = await runRepairScenario([], { drift: true, referencePresent: true, rebuildIntroducesP0: true });
  assert.equal(run.result.passed, false);
  assert.equal(run.calls.length, 0);
  assert.equal(run.result.files, run.initial);
  assert.match(run.result.failureReason, /基础检查阻塞/);
});

test("production P1 coordinator rejects ineffective edits and then converges with the real missing reference", async () => {
  const run = await runRepairScenario([
    { canonicalMutations: [{ type: "identity.update", changes: { summary: "Changed prose, not the missing file" } }] },
    { canonicalMutations: [], implementationFiles: { "references/check-rules.md": "# 检查规则\n逐条记录对应原文位置；缺少支持材料时标注待补充，不编造来源。" } },
  ]);
  assert.equal(run.result.passed, true);
  assert.equal(run.calls.length, 2);
  assert.equal(run.calls[1].skillIR.identity.summary, JSON.parse(run.initial["evals/skill-ir.json"]).identity.summary);
  assert.match(run.calls[1].rejectedHistory.join("\n"), /未解决任何阻塞/);
  assert.deepEqual(run.events.filter((event) => event.event === "generation_loop_candidate").map((event) => event.accepted), [false, true]);
  assert.equal(run.result.issues.length, 0);
});

test("production P1 coordinator retains the original bundle when two repairs still do not resolve its file", async () => {
  const run = await runRepairScenario([{ canonicalMutations: [{ type: "identity.update", changes: { summary: "ineffective change" } }] }]);
  assert.equal(run.result.passed, false);
  assert.deepEqual(run.result.files, run.initial);
  assert.equal(run.calls.length, 2);
  assert.equal(run.result.issues.length, 1);
  assert.ok(run.events.filter((event) => event.event === "generation_loop_candidate").every((event) => event.accepted === false));
});

test("production P1 coordinator stops on insufficient balance and preserves files without a second repair", async () => {
  for (const failure of [new Error("Insufficient Balance（请求 test）"), Object.assign(new Error("模型账户余额或额度不足，请充值后重试当前步骤。"), { code: "AI_ACCOUNT_LIMIT" })]) {
    await assert.rejects(runRepairScenario([failure]), (error) => {
      assert.equal(error, failure);
      assert.equal(error.repairTest.calls.length, 1);
      assert.deepEqual(error.repairTest.events.find((event) => event.event === "preserved-files").files, error.repairTest.initial);
      assert.equal(error.repairTest.events.some((event) => /仍未收敛/.test(event.reason)), false);
      return true;
    });
  }
});
