import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { EVAL_COMPILER_VERSION, providerRepairNeedsUserAction } from "../app/eval-prompt.ts";
import { validateBundleContentCoherence } from "../app/bundle-validator.ts";
import * as evidence from "../app/evidence-gates.ts";
import { normalizeDiscoveryPreview } from "../app/discovery-preview.ts";
import { normalizePlannedDemoTurns } from "../app/demo-episode.ts";
import { completedNumericDecisionFixture, confirmedCorrectionEvalEvidence, productiveCheckpointRequested } from "../app/workflow-compiler.ts";
import { compileSkillIR, bindSkillIREvals, ensureSkillIREvalCoverage, projectEvalBank, reconcileSkillIRContentPermission, reconcileSkillIRActionPermissions, reconcileSkillIRInputResolutions, reconcileSkillIRSourceEvidence } from "../app/skill-ir.ts";
import { reconcileRuntimeInputResources } from "../app/bundle-resource-repair.ts";
import { capabilityOwnsArtifacts, caseProvidesCapabilityEvidence } from "../app/skill-pipeline-core.ts";
import { evalCaseIsRunnable } from "../app/skill-ir.ts";
import { capabilities, workflow } from "./fixtures/blueprint.mjs";

const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const wanted = ["createSpecificEvals", "currentEvalContractDigest", "stableEvalContractValue", "firstTaskExample", "capabilityIsActive", "normalizeSkillDemo", "contentPolicyAllowsFactualCreation", "contentPolicyExplicitlyRestrictsExpansion", "reconcileConfirmedContentPolicy", "reconcileConfirmedContentPolicyArtifact", "ensureCanonicalBundledResources"];
const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && wanted.includes(node.name?.text)).map((node) => node.getText(ast));
assert.equal(functions.length, wanted.length);
const dependencies = {
  ...evidence, EVAL_COMPILER_VERSION, completedNumericDecisionFixture, confirmedCorrectionEvalEvidence, productiveCheckpointRequested,
  reconcileSkillIRContentPermission, reconcileSkillIRActionPermissions, reconcileSkillIRInputResolutions, reconcileSkillIRSourceEvidence, reconcileRuntimeInputResources,
  normalizePlannedDemoTurns,
  // These UI policy helpers are orthogonal to fixture construction; keep a
  // simple text-only plan. Prompt construction and Canonical projection run.
  reconcileCapabilityPlanContentPermission: (plan) => plan,
  confirmedContentPolicy: () => "按用户材料执行",
  capabilityOwnsArtifacts,
  normalizeCapabilityScope: () => "task-specific",
};
const compiled = ts.transpileModule(functions.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const { createSpecificEvals, firstTaskExample, normalizeSkillDemo, reconcileConfirmedContentPolicyArtifact, ensureCanonicalBundledResources } = new Function(...Object.keys(dependencies), `${compiled}; return { createSpecificEvals, firstTaskExample, normalizeSkillDemo, reconcileConfirmedContentPolicyArtifact, ensureCanonicalBundledResources };`)(...Object.values(dependencies));
const promptIssues = (files) => validateBundleContentCoherence(files).filter((issue) => issue.code === "INCOMPLETE_PROMPT");
const longTask = `请分析以下完整要求：“${"竞品的选品、渠道与价格需要有证据，".repeat(9)}不要把折扣价当成日常价”。`;

test("confirmed task wording overrides an earlier preview example in Eval fixtures", () => {
  assert.equal(firstTaskExample({ __previewTask: "替我发送周报给主管", "trigger-language": "帮我整理周报，发送由我决定" }, "整理周报"), "帮我整理周报，发送由我决定");
  assert.equal(firstTaskExample({ __previewTask: "替我发送周报给主管", "trigger-language": "帮我整理这周周报", "real-task": "以聊天记录为主，需要它提炼接口依赖" }, "整理周报"), "帮我整理这周周报");
  assert.equal(firstTaskExample({ __previewTask: "替我发送周报给主管", "real-task": "只生成周报文件" }, "整理周报"), "只生成周报文件");
});

test("long quoted tasks and materials survive the production Eval compiler and canonical projection", () => {
  for (const [open, close] of [["“", "”"], ["「", "」"], ["『", "』"], ["（", "）"], ["【", "】"]]) {
    const task = longTask.replaceAll("“", open).replaceAll("”", close);
    const material = `材料：${open}${"完整证据及产品说明。".repeat(470)}${close}\n最后一项限制：不得省略退货成本。`;
    const answers = { inputs: "产品材料", __previewInput: material, "trigger-language": `请检查${open}价格；退货；渠道${close}并交付报告。` };
    const bank = createSpecificEvals("compare-products", task, answers, workflow.loopPlan, capabilities.capabilityPlan);
    const cases = JSON.parse(bank).evals;
    assert.equal(JSON.parse(bank).version, EVAL_COMPILER_VERSION);
    assert.equal(cases.filter((item) => item.id.startsWith("no-trigger-nearest-neighbor")).length, 4);
    for (const item of cases.filter((item) => item.id.startsWith("no-trigger-nearest-neighbor"))) assert.ok(item.prompt.includes(task));
    const core = cases.find((item) => item.id === "core-core");
    assert.ok(core.prompt.includes(material), "the complete material, including its final constraint, must survive");
    assert.ok(core.prompt.includes(answers["trigger-language"]), "a quoted semicolon must not split a task example");
    assert.deepEqual(promptIssues({ "evals/evals.json": bank }), []);
    const ir = compileSkillIR({ skillName: "compare-products", idea: task, answers, plan: capabilities.capabilityPlan, loop: workflow.loopPlan, requirements: [] });
    const bound = bindSkillIREvals(ir, ensureSkillIREvalCoverage(ir, bank));
    // The original regression only tested binding, missing the destructive
    // permission reconciliation that runs again immediately before freeze.
    const frozen = ensureCanonicalBundledResources(bound, {}, answers);
    const projected = projectEvalBank(frozen);
    assert.ok(JSON.parse(projected).evals.some((item) => item.prompt.includes(material)));
    assert.deepEqual(promptIssues({ "evals/evals.json": projected, "evals/skill-ir.json": JSON.stringify(frozen) }), []);
    assert.equal(projectEvalBank(bindSkillIREvals(frozen, projected)), projected, "reprojection must not reintroduce a clipped source");
  }
});

test("every synthesized negative/permission fixture retains the full task rather than 80/100-character fragments", () => {
  // Reproduce the old cut inside a quotation, independently of the validator.
  assert.notEqual(longTask.slice(0, 80).split("“").length, longTask.slice(0, 80).split("”").length);
  const prompts = [...evidence.hardNegativePrompts(longTask), ...[{}, { allowFactualCreation: true }, { explicitRestriction: true }].flatMap((options) => evidence.realisticFailureFixtures(longTask, options).map((item) => item.prompt))];
  for (const prompt of prompts) {
    assert.ok(prompt.includes(longTask));
    assert.equal(prompt.split("“").length, prompt.split("”").length);
  }
});

test("file-delivery Eval has its own approved turn while semantic Eval still waits for approval", () => {
  const plan = structuredClone(capabilities.capabilityPlan);
  plan.outputContract = { mode: "artifact", format: "Markdown", requiredSections: ["报告"], artifactPatterns: ["outputs/*.md"], validation: ["文件存在"] };
  const writer = {
    ...structuredClone(plan.items[0]), id: "host-file-workspace", kind: "builtin-tool", name: "读取与编辑工作区文件",
    affects: ["artifact-output", "output-contract"], output: "真实存在的 Markdown 文件",
    activationCondition: "用户确认后写入文件", requirement: "创建并交付 Markdown 文件",
    evaluationCriteria: ["文件路径可检查"],
  };
  plan.items.push(writer);
  const bank = JSON.parse(createSpecificEvals("weekly-report", "整理每周汇报", {
    inputs: "一周工作记录", __previewInput: "周一完成接口联调；周三确认下周发布窗口。",
    "delivery-checkpoint": "先给我看草稿，等我确认后再定稿",
  }, workflow.loopPlan, plan));
  const semantic = bank.evals.find((item) => item.id === "core-core");
  const file = bank.evals.find((item) => item.id === "core-host-file-workspace");
  assert.equal(semantic.context.workflow_checkpoint, "productive-partial-delivery");
  assert.match(semantic.prompt, /不得把尚未收到的答复说成已经确认/);
  assert.doesNotMatch(semantic.prompt, /优先级规则|每次确认规则/);
  assert.match(semantic.expected.behaviors.join("；"), /必要输入或确认缺失时，不要求最终产物/);
  assert.doesNotMatch(semantic.expected.behaviors.join("；"), /完成当前实际任务并交付至少一个符合输出契约的可检查结果/);
  assert.equal(file.context.workflow_checkpoint, "required-value-provided");
  assert.equal(evalCaseIsRunnable(file), true);
  assert.deepEqual(file.expected.artifacts, ["outputs/*.md"]);
  assert.match(file.prompt, /隔离评测前置回合：用户已补齐/);
  assert.doesNotMatch(file.prompt, /本用例没有提供优先级规则等关键决策/);
  assert.equal(caseProvidesCapabilityEvidence(file, writer), true);
});

test("literal, mixed and unbalanced punctuation inside input is not proof of a truncated model response", () => {
  const prompts = [
    '请将字符 “ 替换为直角引号，并保留其余内容。',
    '请分析“产品价格"，然后给出依据。',
    '下面是待分析的原始材料：\n他说：“还有一项限制\n以上材料由用户提供，请指出其中的问题。',
    '统计 `“` 的出现次数。',
    '检查这条命令：\n```python\nprint("“")\n```',
    '把引号字符表示为 "“"',
    '只输出字符 “',
  ];
  assert.deepEqual(promptIssues({ "evals/evals.json": JSON.stringify({ evals: prompts.map((prompt) => ({ prompt })) }) }), []);
  for (const prompt of ["请完成任务，但不要采用“", "需要检查的内容如下：【", "请补充材料；"]) {
    assert.ok(promptIssues({ "evals/evals.json": JSON.stringify({ evals: [{ prompt }] }) }).length > 0);
  }
});

test("Demo normalization keeps complete executable input, including the text after the old 4000-character cut", () => {
  const sample = `“${"用户材料。".repeat(1000)}”最后还有一个不可省略的条件。`;
  assert.equal(normalizeSkillDemo({ userPrompt: sample, output: "示例结果" }).userPrompt, sample);
  const preview = normalizeDiscoveryPreview({ userPrompt: sample, sampleInput: sample, output: "本次结果只用于确认工作方式，不代表真实执行的结果。", learned: ["一", "二"], feedbackOptions: ["一", "二", "三"] });
  assert.equal(preview.userPrompt, sample);
  assert.equal(preview.sampleInput, sample);
});

test("legacy Eval banks are migrated before P0/P1 repair and cannot hide behind a restored frozen version", () => {
  assert.equal(EVAL_COMPILER_VERSION, "2.14");
  assert.match(source, /evalNeedsRebuild = parsed\.version !== EVAL_COMPILER_VERSION/);
  assert.match(source, /restoreFrozenBundleExactly = saved\.sessionSchemaVersion === SESSION_SCHEMA_VERSION[\s\S]*saved\.pipelineContractVersion === PIPELINE_CONTRACT_VERSION[\s\S]*savedEvalVersion === EVAL_COMPILER_VERSION/);
  const loop = source.slice(source.indexOf("async function runOptimizationLoop("));
  assert.ok(loop.indexOf("evalVersion !== EVAL_COMPILER_VERSION") < loop.indexOf("await runP0StaticRepairLoop("));
  assert.ok(loop.indexOf("evalVersion !== EVAL_COMPILER_VERSION") < loop.indexOf("await runP1ContractRepairLoop("));
  assert.doesNotMatch(source, /__previewInput[^\n]*slice\(0, 4_000\)|userPrompt\.trim\(\)\.slice\(0, 4_000\)/);
});

test("permission reconciliation and final freeze never rewrite Eval prompts, material, counterexamples or assertions", () => {
  const task = "检查产品材料并生成报告";
  const sample = evidence.realisticFailureFixtures(task)[0].prompt;
  // Without permission to create new facts, there is no content-permission
  // conflict to reconcile, so the quoted counterexample stays intact.
  assert.equal(evidence.reconcileContentPermissionText(sample, evidence.resolveContentPermission({})), sample);
  for (const answers of [{}, { "evidence-policy": "可以扩写并新增内容" }, { "evidence-policy": "只润色，不新增事实" }]) {
    const plan = capabilities.capabilityPlan;
    const ir = compileSkillIR({ skillName: "inspect-product", idea: task, answers, plan, loop: workflow.loopPlan, requirements: [] });
    const cases = [{ id: "regression-quote", prompt: sample, context: { material: "材料原话：不新增事实或数据。", conversation: [{ prompt: "请检查规则：“不编造经历”。" }] }, expected: { must_not: ["不新增事实或数据。"], user_counterexamples: [{ originalQuote: "编造数据后直接交付" }] } }];
    const original = bindSkillIREvals(ir, JSON.stringify({ evals: cases }));
    const originalCases = structuredClone(original.evaluationPlan.cases);
    for (const path of ["evals/evals.json", "evals/skill-ir.json", "evals/capability-manifest.json"]) {
      const text = path === "evals/evals.json" ? projectEvalBank(original) : JSON.stringify(original);
      assert.equal(reconcileConfirmedContentPolicyArtifact(path, text, answers), text, path);
    }
    let frozen = original;
    for (let attempt = 0; attempt < 3; attempt++) {
      frozen = ensureCanonicalBundledResources(frozen, {}, answers);
      assert.deepEqual(frozen.evaluationPlan.cases, originalCases);
      assert.deepEqual(promptIssues({ "evals/evals.json": projectEvalBank(frozen), "evals/skill-ir.json": JSON.stringify(frozen) }), []);
    }
  }
});

test("retry replaces the old damaged compiler bank from intact sources before freezing without model repair", () => {
  const task = "检查产品材料并生成报告";
  const answers = { inputs: "产品说明", __previewInput: "这是一份真实任务的产品说明，其中有价格、销量和来源信息，请据此完成分析。" };
  const ir = compileSkillIR({ skillName: "inspect-product", idea: task, answers, plan: capabilities.capabilityPlan, loop: workflow.loopPlan, requirements: [] });
  const broken = bindSkillIREvals(ir, JSON.stringify({ version: "2.8", evals: [{ id: "old-broken", prompt: "用户并没有要求采用“" }] }));
  assert.ok(promptIssues({ "evals/skill-ir.json": JSON.stringify(broken) }).length);
  const bank = createSpecificEvals("inspect-product", task, answers, workflow.loopPlan, capabilities.capabilityPlan);
  const frozen = ensureCanonicalBundledResources(bindSkillIREvals(broken, bank), {}, answers);
  const result = projectEvalBank(frozen);
  assert.equal(JSON.parse(result).version, EVAL_COMPILER_VERSION);
  assert.ok(JSON.parse(result).evals.every((item) => item.id !== "old-broken"));
  assert.deepEqual(promptIssues({ "evals/evals.json": result, "evals/skill-ir.json": JSON.stringify(frozen) }), []);
});

test("account failures require user action while transient errors remain retryable", () => {
  for (const message of ["Insufficient Balance（请求 example）", "insufficient_quota", "额度不足", "Invalid API key", "模型服务返回 402"]) assert.equal(providerRepairNeedsUserAction(new Error(message)), true);
  for (const message of ["Network error", "模型服务返回 429", "timeout", "invalid JSON"]) assert.equal(providerRepairNeedsUserAction(new Error(message)), false);
  assert.equal(providerRepairNeedsUserAction(Object.assign(new Error("Provider error"), { code: "AI_ACCOUNT_LIMIT" })), true);
});
