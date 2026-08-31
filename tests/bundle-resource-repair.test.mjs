import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import * as canonical from "../app/canonical-mutations.ts";
import { compileSkillIR, auditSkillIRFiles, projectSkillMarkdown, projectCapabilityManifest, projectToolContracts, projectToolingReference, bindSkillIREvals, ensureSkillIREvalCoverage } from "../app/skill-ir.ts";
import { compileWorkflowDag } from "../app/workflow-dag.ts";
import { validateImplementationFiles, applySkillIRMutations, validateCanonicalSkillIR } from "../app/canonical-mutations.ts";
import { reconcileRuntimeInputResources, missingBundleResources, deduplicateMissingResourceIssues, contractRepairProgress } from "../app/bundle-resource-repair.ts";
import { auditCapabilityClosure } from "../app/generation-loop-core.ts";
import { capabilities, workflow } from "./fixtures/blueprint.mjs";

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
  const bank = ensureSkillIREvalCoverage(ir, "");
  const bound = bindSkillIREvals(ir, bank);
  return { ir: bound, files: {
    "SKILL.md": projectSkillMarkdown(bound), "evals/skill-ir.json": JSON.stringify(bound),
    "evals/capability-manifest.json": JSON.stringify(projectCapabilityManifest(bound)), "evals/evals.json": bank,
    "integrations/tool-contracts.json": projectToolContracts(bound), "references/tooling.md": projectToolingReference(bound),
  } };
}

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
async function runRepairScenario(responses) {
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
  const initial = project(ir).files;
  const events = [], calls = [];
  const collect = (files) => ({ audit: { warnings: [] }, closure: {}, crossArtifact: {}, issues: missingBundleResources(canonical.parseCanonicalSkillIR(files), files)
    .map((item) => issue("MISSING_IMPLEMENTATION", `能力 ${item.capabilityId} 的实现文件不存在：${item.path}`, [item.path], item.capabilityId)) });
  const validate = (files) => ({ executionReady: true, contractReady: collect(files).issues.length === 0 });
  const deps = {
    ...canonical, reconcileRuntimeInputResources, missingBundleResources, contractRepairProgress,
    idea: "检查文档", loopPlan: workflow.loopPlan, BUILD_REPAIR_MAX_ROUNDS: 2,
    ensureCanonicalBundledResources: (value) => value,
    finalizeSkillFiles: (files, _idea, _answers, _source, _plan, _loop, value) => ({ ...files, ...project(value).files }),
    validateBundle: async (files) => validate(files), collectP1ContractState: collect,
    p1IssuesAreCompilerOwnedEvalEdges: () => false,
    isSafeSkillFilePath: (path) => !path.includes(".."),
    allowedP1MutationTypes: () => ["identity.update", "capability.update"], canonicalMutationTargetCatalog: () => ({}),
    setBuildLoop: () => {}, setGenerationLoop: () => {},
    reportClientGenerationLoopEvent: (event, data) => events.push({ event, ...data }),
    runP0StaticRepairLoop: async (files) => ({ files, validation: validate(files), rounds: 0 }),
    callAI: async (_mode, body) => {
      calls.push(structuredClone(body));
      return responses[Math.min(calls.length - 1, responses.length - 1)];
    },
  };
  const run = new Function(...Object.keys(deps), `${code}\nreturn runP1ContractRepairLoop;`)(...Object.values(deps));
  const result = await run({ files: initial, validation: validate(initial), generationPlan: capabilities.capabilityPlan, answers: {}, sourceText: "", skillIR: ir });
  return { result, initial, events, calls };
}

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
