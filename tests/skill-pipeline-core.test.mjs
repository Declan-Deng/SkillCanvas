import assert from "node:assert/strict";
import test from "node:test";

import {
  FAILURE_ATTRIBUTION_MUTATIONS,
  applyPatchPlan,
  attributeEvalFailure,
  auditCrossArtifactConsistency,
  capabilityOwnsArtifacts,
  caseProvidesCapabilityEvidence,
  candidateUtility,
  constrainPatchPlan,
  estimateDomainValueDensity,
  inferEvalFamily,
  makeContractIssues,
  normalizePatchPlan,
  optimizationPolicyFor,
  pruneBundleDeterministically,
  reconcileArtifactProducerCapabilities,
  validatePatchPlan,
} from "../app/skill-pipeline-core.ts";

test("Eval failures are attributed to one bounded Canonical SkillIR owner", () => {
  assert.equal(attributeEvalFailure("缺少用于选择候选方案的判断规则").type, "missing_decision_rule");
  assert.equal(attributeEvalFailure("空值和异常输入没有例外分支").type, "missing_exception");
  assert.equal(attributeEvalFailure("MCP 参数错误且没有检查调用回执", "integration").type, "missing_tool_knowledge");
  assert.equal(attributeEvalFailure("输出没有执行可观察的验收检查").type, "missing_verification");
  assert.equal(attributeEvalFailure("系统规则与用户明确要求相互冲突").type, "instruction_conflict");
  assert.deepEqual(FAILURE_ATTRIBUTION_MUTATIONS.missing_exception, ["risk-branch.add", "risk-branch.update", "risk-branch.remove"]);
});

test("attributed Eval failures reject whole-Skill or cross-owner patches", () => {
  const issue = {
    id: "eval-missing-exception",
    priority: "P1",
    type: "EVAL_MISSING_EXCEPTION",
    source: "eval",
    evidence: "缺例外：空值输入没有失败恢复",
    files: ["SKILL.md"],
    failureType: "missing_exception",
    allowedMutationTypes: FAILURE_ATTRIBUTION_MUTATIONS.missing_exception,
  };
  const wrong = normalizePatchPlan({
    strategy: "repair_contract",
    issueIds: [issue.id],
    impact: { scope: "task-specific", affectedArtifacts: ["requirements"], regressionFamilies: ["capability"] },
    canonicalMutations: [{ type: "requirement.add", requirement: { id: "generic", statement: "handle errors" } }],
    operations: [{ action: "edit", path: "scripts/run.py", find: "old", replacement: "new" }],
  });
  assert.ok(wrong);
  const wrongValidation = validatePatchPlan({ plan: wrong, issues: [issue], files: { "scripts/run.py": "old" }, capabilities: [] });
  assert.equal(wrongValidation.valid, false);
  assert.match(wrongValidation.errors.join("；"), /risk-branch|不能改写实现文件/);

  const correct = normalizePatchPlan({
    strategy: "repair_contract",
    issueIds: [issue.id],
    impact: { scope: "task-specific", affectedArtifacts: ["riskBranches"], regressionFamilies: ["capability"] },
    canonicalMutations: [{ type: "risk-branch.add", branch: { id: "missing-input", condition: "required input is absent", action: "request the minimum missing input", stopOrRedirect: "stop dependent steps until supplied" } }],
    operations: [],
  });
  assert.ok(correct);
  assert.equal(validatePatchPlan({ plan: correct, issues: [issue], files: {}, capabilities: [] }).valid, true);
});

test("decision rules learned from Eval retain provenance instead of becoming model folklore", () => {
  const issue = {
    id: "eval-missing-decision-rule",
    priority: "P2",
    type: "EVAL_MISSING_DECISION_RULE",
    source: "eval",
    evidence: "case-routing-3 缺少判断何时停止自动补写的决策规则",
    files: ["references/domain-playbook.md", "evals/skill-ir.json"],
    failureType: "missing_decision_rule",
    allowedMutationTypes: FAILURE_ATTRIBUTION_MUTATIONS.missing_decision_rule,
    evalCaseIds: ["case-routing-3"],
  };
  const withoutEvidence = normalizePatchPlan({
    strategy: "distill_knowledge",
    issueIds: [issue.id],
    impact: { scope: "conditional", affectedArtifacts: ["domainEvidence"], regressionFamilies: ["capability"] },
    canonicalMutations: [{
      type: "domain-evidence.add",
      evidence: { id: "stop-rule", rule: "遇到未知字段时停止", category: "decision_rules", applies_when: "字段来源未知" },
    }],
    operations: [],
  });
  assert.ok(withoutEvidence);
  const rejected = validatePatchPlan({ plan: withoutEvidence, issues: [issue], files: {}, capabilities: [] });
  assert.equal(rejected.valid, false);
  assert.match(rejected.errors.join("；"), /source_urls|eval_case_ids/);

  const withEvidence = normalizePatchPlan({
    strategy: "distill_knowledge",
    issueIds: [issue.id],
    impact: { scope: "conditional", affectedArtifacts: ["domainEvidence"], regressionFamilies: ["capability"] },
    canonicalMutations: [{
      type: "domain-evidence.add",
      evidence: {
        id: "stop-rule",
        rule: "字段没有可追溯来源时停止自动补写并请求确认",
        category: "decision_rules",
        applies_when: "输出字段没有用户材料或已授权来源",
        exception: "用户已明确允许自由创作",
        evidence_type: "eval_failure",
        confidence: 0.8,
        eval_case_ids: ["case-routing-3"],
      },
    }],
    operations: [],
  });
  assert.ok(withEvidence);
  assert.equal(validatePatchPlan({ plan: withEvidence, issues: [issue], files: {}, capabilities: [] }).valid, true);
});

test("tool failures can only update the attributed capability", () => {
  const issue = {
    id: "eval-tool-receipt",
    priority: "P1",
    type: "EVAL_MISSING_TOOL_KNOWLEDGE",
    source: "eval",
    evidence: "文件解析工具没有核对调用回执",
    files: ["integrations/tool-contracts.json", "evals/skill-ir.json"],
    capabilityId: "pdf-reader",
    failureType: "missing_tool_knowledge",
    allowedMutationTypes: FAILURE_ATTRIBUTION_MUTATIONS.missing_tool_knowledge,
  };
  const wrongTarget = normalizePatchPlan({
    strategy: "repair_contract",
    issueIds: [issue.id],
    impact: { scope: "conditional", affectedCapabilities: ["web-search"], regressionFamilies: ["integration"] },
    canonicalMutations: [{ type: "capability.update", capabilityId: "web-search", changes: { fallback: "retry" } }],
    operations: [],
  });
  assert.ok(wrongTarget);
  const result = validatePatchPlan({ plan: wrongTarget, issues: [issue], files: {}, capabilities: [] });
  assert.equal(result.valid, false);
  assert.match(result.errors.join("；"), /pdf-reader/);
});

test("only structured execution issues can enter P0", () => {
  const contractIssues = makeContractIssues(["artifact_checker.py SyntaxError", "invalid JSON", "领域知识不够具体"]);
  assert.ok(contractIssues.every((issue) => issue.priority === "P1"));
  const executionIssue = { id: "json-parse", priority: "P0", type: "P0_EXECUTION_BLOCKER", source: "static", evidence: "invalid JSON", files: ["evals/evals.json"] };
  const policy = optimizationPolicyFor([executionIssue, ...contractIssues]);
  assert.equal(policy.priority, "P0");
  assert.equal(policy.allowSemanticOptimization, false);
  assert.deepEqual(policy.selected.map((item) => item.priority), ["P0"]);
});

test("eval families keep trigger, capability, grounding, and integration isolated", () => {
  assert.equal(inferEvalFamily({ category: "trigger_negative" }), "trigger");
  assert.equal(inferEvalFamily({ category: "core_capability" }), "capability");
  assert.equal(inferEvalFamily({ category: "content_policy" }), "grounding");
  assert.equal(inferEvalFamily({ category: "tool_grounding", graders: ["artifact_checker"] }), "integration");
});

test("capability coverage requires a focused non-trigger case with the right grader", () => {
  const image = { id: "host-image-generation", kind: "builtin-tool", scope: "conditional", activationCondition: "when an image is requested", output: "PNG" };
  assert.equal(caseProvidesCapabilityEvidence({ id: "trigger", eval_family: "trigger", capability_ids: [image.id], expected: { behaviors: ["trigger"] }, graders: ["trigger"] }, image), false);
  assert.equal(caseProvidesCapabilityEvidence({ id: "wrong-family", eval_family: "capability", capability_ids: [image.id], expected: { behaviors: ["produce image"] }, graders: ["core_capability"] }, image), false);
  assert.equal(caseProvidesCapabilityEvidence({ id: "focused", eval_family: "integration", capability_ids: [image.id], context: { activation_condition: "image requested" }, expected: { behaviors: ["produce image"], artifacts: ["outputs/*.png"] }, graders: ["integration", "artifact_checker"] }, image), true);
});

test("semantic LLM content does not impersonate a real file producer", () => {
  assert.equal(capabilityOwnsArtifacts({ id: "resume-llm", kind: "llm", output: "改写后的 PDF 简历文件", affects: ["output-contract"] }), false);
  assert.equal(capabilityOwnsArtifacts({ id: "file-export", kind: "builtin-tool", output: "真实 PDF 文件", affects: ["artifact-output"] }), true);
  assert.equal(capabilityOwnsArtifacts({ id: "pdf-reader", kind: "builtin-tool", output: "带页码的结构化内容", routingCondition: "用户上传 PDF 文档时" }), false);
  assert.equal(capabilityOwnsArtifacts({ id: "data-check", kind: "script", output: "校验报告和 Markdown 表格", affects: ["output-contract"] }), false);
  assert.equal(capabilityOwnsArtifacts({ id: "web-search", kind: "builtin-tool", output: "搜索结果", affects: ["output-contract"] }), false);
  assert.equal(capabilityOwnsArtifacts({ id: "csv-template", kind: "asset", output: "CSV 模板", affects: ["artifact-output"] }), false);
});

test("artifact compiler promotes one real file owner without duplicating a disabled declaration", () => {
  const fallback = { id: "host-file-workspace", kind: "builtin-tool", output: "file", enabled: false, status: "use-provided" };
  const capabilities = reconcileArtifactProducerCapabilities({
    capabilities: [{ id: "resume-llm", kind: "llm", output: "PDF resume" }, fallback],
    fallback,
    artifactPatterns: ["outputs/*.pdf"],
    requiresArtifact: true,
  });
  assert.equal(capabilities.filter((item) => item.id === "host-file-workspace").length, 1);
  const owner = capabilities.find((item) => item.id === "host-file-workspace");
  assert.equal(owner?.enabled, true);
  assert.match(owner?.output || "", /outputs\/\*\.pdf/);
  assert.deepEqual(owner?.affects, ["artifact-output", "output-contract"]);
});

test("an unrelated CSV asset cannot satisfy a PDF delivery contract", () => {
  const fallback = { id: "host-file-workspace", kind: "builtin-tool", output: "file", enabled: false, status: "use-provided" };
  const capabilities = reconcileArtifactProducerCapabilities({
    capabilities: [
      { id: "resume-llm", kind: "llm", output: "resume content" },
      { id: "csv-template", kind: "asset", path: "assets/template.csv", output: "CSV template", status: "generate" },
    ],
    fallback,
    artifactPatterns: ["outputs/*.pdf"],
    requiresArtifact: true,
  });
  assert.ok(capabilities.some((item) => item.id === "host-file-workspace" && item.enabled === true));
});

test("cross-artifact regression rejects conditional image output leaking into a text capability", () => {
  const report = auditCrossArtifactConsistency({
    "SKILL.md": "# Skill\n\nUse core reasoning.",
    "evals/capability-manifest.json": JSON.stringify({
      capabilities: [
        { id: "core-reasoning", kind: "llm", path: "SKILL.md", scope: "task-specific", output: "text result" },
        { id: "host-image-generation", kind: "builtin-tool", path: "integrations/tool-contracts.json", scope: "conditional", activationCondition: "only when the user requests an image", output: "PNG", affects: ["artifact-output"], mustNotAffect: ["default-output-contract"] },
      ],
      coverage: [
        { requirement_id: "core-reasoning", evaluation: { case_ids: ["core-1"] } },
        { requirement_id: "host-image-generation", evaluation: { case_ids: ["integration-image"] } },
      ],
    }),
    "evals/evals.json": JSON.stringify({ evals: [
      { id: "core-1", eval_family: "capability", category: "core_capability", capability_ids: ["core-reasoning"], expected: { behaviors: ["write text"], artifacts: ["outputs/*.png"] }, graders: ["core_capability"] },
      { id: "integration-image", eval_family: "integration", category: "tool_grounding", capability_ids: ["host-image-generation"], context: { activation_condition: "image requested" }, expected: { behaviors: ["produce image"], artifacts: ["outputs/*.png"] }, graders: ["integration", "artifact_checker"] },
    ] }),
  });
  assert.equal(report.passed, false);
  assert.ok(report.issues.some((item) => item.type === "OUTPUT_SCOPE_CONFLICT" && item.id.includes("core-1")));
  assert.ok(!report.issues.some((item) => item.type === "OUTPUT_SCOPE_CONFLICT" && item.id.includes("integration-image")));
});

test("planner must stay inside impact and mutation budgets", () => {
  const plan = normalizePatchPlan({
    strategy: "narrow_scope",
    issueIds: ["scope-leak"],
    protectedArtifacts: ["SKILL.md"],
    impact: {
      scope: "conditional",
      affectedCapabilities: ["host-image-generation"],
      affectedArtifacts: ["input.update:input-query"],
      mustNotAffect: ["default-output-contract"],
      regressionFamilies: ["capability", "integration"],
    },
    canonicalMutations: [{ type: "input.update", inputId: "input-query", changes: { required: false } }],
    operations: [],
  });
  assert.ok(plan);
  const files = { "SKILL.md": "stable", "evals/evals.json": "bad" };
  const validation = validatePatchPlan({
    plan,
    issues: [{ id: "scope-leak", priority: "P1", type: "OUTPUT_SCOPE_CONFLICT", source: "regression", evidence: "leak", files: ["evals/evals.json"] }],
    files,
    capabilities: [{ id: "host-image-generation", kind: "builtin-tool", scope: "conditional", mustNotAffect: ["default-output-contract"] }],
  });
  assert.equal(validation.valid, true);
  assert.equal(plan.canonicalMutations[0].type, "input.update");
  assert.deepEqual(applyPatchPlan(files, plan).files, files);

  const invalid = validatePatchPlan({
    plan: { ...plan, impact: { ...plan.impact, scope: "global" } },
    issues: [{ id: "scope-leak", priority: "P1", type: "OUTPUT_SCOPE_CONFLICT", source: "regression", evidence: "leak", files: [] }],
    files,
    capabilities: [{ id: "host-image-generation", kind: "builtin-tool", scope: "conditional" }],
  });
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join("；"), /条件能力/);
});

test("invalid planner output is safely narrowed before asking the user to retry", () => {
  const files = { "SKILL.md": "skill", "references/a.md": "a", "references/b.md": "b", "references/c.md": "c", "evals/capability-manifest.json": "{}" };
  const constrained = constrainPatchPlan({
    files,
    protectedArtifacts: ["evals/capability-manifest.json"],
    plan: {
      strategy: "repair_contract",
      issueIds: ["p1"],
      protectedArtifacts: [],
      impact: { scope: "task-specific", affectedCapabilities: [], affectedArtifacts: ["SKILL.md", "references/a.md", "references/b.md", "references/c.md", "evals/capability-manifest.json"], mustNotAffect: [], regressionFamilies: ["capability"] },
      operations: ["evals/capability-manifest.json", "SKILL.md", "references/a.md", "references/b.md", "references/c.md"].map((path) => ({ action: "edit", path, find: "x", replacement: "y" })),
    },
  });
  assert.equal(constrained.operations.length, 0);
  assert.equal(constrained.operations.some((item) => item.path === "evals/capability-manifest.json"), false);
  assert.deepEqual(constrained.operations.map((item) => item.path), []);
});

test("planner must acknowledge decision-ledger feedback before a repeated canonical mutation can execute", () => {
  const files = { "SKILL.md": "old behavior" };
  const issue = { id: "shared-gap", priority: "P1", type: "WORKFLOW_GAP", source: "semantic", evidence: "missing route", files: ["SKILL.md"] };
  const missing = normalizePatchPlan({
    strategy: "repair_implementation",
    issueIds: [issue.id],
    consumedDecisionIds: [],
    impact: { scope: "global", affectedArtifacts: ["requirement.update:req-1"], regressionFamilies: ["capability"] },
    canonicalMutations: [{ type: "requirement.update", requirementId: "req-1", changes: { statement: "new behavior" } }],
    operations: [],
  });
  assert.ok(missing);
  assert.equal(validatePatchPlan({ plan: missing, issues: [issue], files, capabilities: [], requiredDecisionIds: ["rollback-1"] }).valid, false);

  const acknowledged = { ...missing, consumedDecisionIds: ["rollback-1"] };
  assert.equal(validatePatchPlan({ plan: acknowledged, issues: [issue], files, capabilities: [], requiredDecisionIds: ["rollback-1"] }).valid, true);
});

test("research triggers on low behavior-changing knowledge density, not by default", () => {
  const low = estimateDomainValueDensity({ "SKILL.md": "表达自然，逻辑清晰，保持专业。".repeat(40) });
  const high = estimateDomainValueDensity({ "SKILL.md": "平台限制、判断规则、边界条件、失败模式、字段公式。".repeat(40) });
  assert.equal(low.shouldResearch, true);
  assert.equal(high.shouldResearch, false);
  assert.ok(high.score > low.score);
});

test("delete pass deterministically removes duplicate manifest entries", () => {
  const result = pruneBundleDeterministically({
    "SKILL.md": "# Skill",
    "evals/capability-manifest.json": JSON.stringify({ capabilities: [{ id: "a" }, { id: "a" }], coverage: [{ requirement_id: "a" }, { requirement_id: "a" }] }),
    "evals/evals.json": JSON.stringify({ evals: [{ id: "case-a" }, { id: "case-a" }] }),
    "integrations/tool-contracts.json": JSON.stringify({ tools: [{ id: "tool-a" }, { id: "tool-a" }] }),
  });
  assert.equal(JSON.parse(result.files["evals/capability-manifest.json"]).capabilities.length, 1);
  assert.equal(JSON.parse(result.files["evals/evals.json"]).evals.length, 1);
  assert.equal(JSON.parse(result.files["integrations/tool-contracts.json"]).tools.length, 1);
  assert.ok(result.changedPaths.length >= 3);
});

test("utility penalizes regression and complexity instead of maximizing score alone", () => {
  assert.ok(candidateUtility({ qualityGain: 10, regressionCount: 0, changedFiles: 1, newFiles: 0, tokenDelta: 100 }) > 0);
  assert.ok(candidateUtility({ qualityGain: 10, regressionCount: 1, changedFiles: 3, newFiles: 1, tokenDelta: 2_000 }) < 0);
});
