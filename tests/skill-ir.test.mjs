import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  auditSkillIRFiles,
  auditUserEvidencePolarity,
  bindSkillIREvals,
  compileSkillIR,
  deriveTaskInputContract,
  ensureSkillIREvalCoverage,
  ensureSkillSemanticClosure,
  normalizeOutcomeModel,
  normalizeKnowledgeAssessment,
  projectCapabilityManifest,
  projectCapabilityRuntimeOperation,
  projectDomainPlaybook,
  projectWorkflowRuntimeOperation,
  projectEvalBank,
  projectSkillIRFiles,
  projectSkillMarkdown,
  projectToolContracts,
  reconcileSkillIRActionPermissions,
  reconcileSkillIRContentPermission,
  reconcileSkillIRInputResolutions,
  reconcileSkillIRSourceEvidence,
} from "../app/skill-ir.ts";
import { auditCapabilityClosure } from "../app/generation-loop-core.ts";
import {
  applySkillIRMutations,
  normalizeCanonicalMutations,
  semanticSkillIRDigest,
  validateCanonicalSkillIR,
} from "../app/canonical-mutations.ts";
import { countDuplicateAuthorRuntimeRules, hasExecutableWorkflowHeading } from "../app/gate-rules.ts";
import { hasUnscopedActionPermissionConflict } from "../app/action-permission.ts";

function fixturePlan() {
  return {
    summary: "把简历内容按目标岗位重组",
    outcomeModel: {
      ultimateGoal: "根据真实经历和 JD 生成岗位匹配的简历内容",
      controllableOutcomes: ["经历与 JD 重点对应"],
      uncontrollableOutcomes: ["保证获得面试"],
      observableIndicators: ["每段经历都能对应岗位要求"],
    },
    stateModel: { needed: false, scope: "none", missingBehavior: "缺少 JD 时先询问" },
    outputContract: { mode: "human", format: "可复制的简历内容", requiredSections: ["经历要点"], artifactPatterns: [], validation: ["覆盖岗位关键词"] },
    riskBranches: [],
    failureModes: ["遗漏目标岗位明确要求的核心能力"],
    items: [
      {
        id: "core-resume",
        kind: "llm",
        name: "简历重组",
        path: "SKILL.md",
        layer: "runtime",
        requirement: "按 JD 重组真实经历",
        purpose: "完成语义匹配和表达",
        reason: "需要上下文判断",
        status: "generate",
        input: "JD 与经历",
        output: "简历内容",
        fallback: "缺少根本输入时询问",
        routingCondition: "用户要求按 JD 修改简历时",
        deterministicAdvantage: "无",
        evaluationCriteria: ["经历与 JD 对应"],
        scope: "task-specific",
        activationCondition: "用户要求按 JD 修改简历时",
        affects: ["runtime-workflow"],
        mustNotAffect: [],
        enabled: true,
      },
      {
        id: "eval",
        kind: "eval",
        name: "回归评测",
        path: "evals/",
        layer: "evaluation",
        requirement: "验证核心任务",
        purpose: "运行真实用例",
        reason: "检测回归",
        status: "generate",
        input: "测试用例",
        output: "评分证据",
        fallback: "阻止发布",
        routingCondition: "构建和修改后",
        deterministicAdvantage: "独立验证",
        evaluationCriteria: ["真实任务通过"],
        scope: "global",
        activationCondition: "构建和修改后",
        affects: ["evaluation"],
        mustNotAffect: ["runtime-workflow"],
        enabled: true,
      },
    ],
  };
}

test("knowledge sufficiency is recomputed from canonical four-category evidence", () => {
  const partialEvidence = [{ category: "decision_rules" }, { category: "failure_modes" }];
  assert.deepEqual(normalizeKnowledgeAssessment({
    status: "sufficient",
    requiredCategories: ["decision_rules", "failure_modes", "edge_cases", "verification_methods"],
    coveredCategories: ["decision_rules", "failure_modes", "edge_cases", "verification_methods"],
    missingCategories: [],
  }, partialEvidence), {
    status: "insufficient",
    requiredCategories: ["decision_rules", "failure_modes", "edge_cases", "verification_methods"],
    coveredCategories: [],
    missingCategories: ["decision_rules", "failure_modes", "edge_cases", "verification_methods"],
    observedCategories: [], requiredGapIds: [], coveredGapIds: [], missingGapIds: [], verifiedRuleCount: 0, advisoryRuleCount: 0,
  });
  assert.deepEqual(normalizeKnowledgeAssessment(undefined, []), {
    status: "not-required",
    requiredCategories: [],
    coveredCategories: [],
    missingCategories: [],
  });
});

function compile() {
  return compileSkillIR({
    skillName: "tailor-resume",
    idea: "根据 JD 修改简历",
    answers: { inputs: "目标 JD；真实经历", "trigger-language": "根据这个 JD 修改简历" },
    plan: fixturePlan(),
    loop: { mode: "hybrid", goal: "交付岗位匹配的简历", maxRounds: 3, stopConditions: ["核心检查通过"], escalationConditions: ["缺少 JD"], scopes: [] },
    requirements: [
      { id: "goal", requirement: "根据 JD 修改简历", provenance: "user_explicit", modality: "MUST", hard: true, source: "initial user goal" },
      { id: "format-rule", requirement: "每条经历必须恰好 20 个字", provenance: "generator_default", modality: "MUST", hard: true, source: "generator default" },
    ],
  });
}

test("Canonical SkillIR demotes unsupported hard rules and keeps one capability graph", () => {
  const ir = compile();
  assert.equal(ir.schemaVersion, "1.0");
  assert.equal(ir.requirements.find((item) => item.id === "goal")?.hard, true);
  const generated = ir.requirements.find((item) => item.id === "format-rule");
  assert.equal(generated?.hard, false);
  assert.equal(generated?.modality, "SHOULD");
  assert.equal(generated?.ruleType, "proxy_metric");
  assert.deepEqual(ir.resourcePlan.resources, []);
  assert.deepEqual(ir.tasks[0].capabilityIds.sort(), ["core-resume"]);
});

test("the canonical runtime projection always satisfies the workflow heading gate", () => {
  const projected = projectSkillMarkdown(compile());
  assert.match(projected, /^## Workflow$/m);
  assert.equal(hasExecutableWorkflowHeading(projected), true);
});

test("Canonical SkillIR compilation blocks a workflow with unmet artifact dependencies", () => {
  const plan = fixturePlan();
  plan.workflowSteps = [{
    id: "rewrite-before-extraction",
    capabilityIds: ["core-resume"],
    when: "a resume request arrives",
    input: "structured resume record",
    action: "rewrite the resume",
    output: "rewritten resume",
    fallback: "stop and report the missing extraction result",
    requires: ["resume-record"],
    produces: ["rewritten-resume"],
    mutates: [],
  }];

  assert.throws(() => compileSkillIR({
    skillName: "invalid-resume-workflow",
    idea: "根据 JD 修改简历",
    answers: { inputs: "目标 JD；真实经历" },
    plan,
    loop: { mode: "hybrid", goal: "交付岗位匹配的简历", maxRounds: 3, stopConditions: [], escalationConditions: [], scopes: [] },
    requirements: [{ id: "goal", requirement: "根据 JD 修改简历", provenance: "user_explicit", modality: "MUST", hard: true, source: "initial user goal" }],
  }), /WORKFLOW_DAG_INVALID.*resume-record/);
});

test("Canonical SkillIR compilation rebinds a retained operation whose prior owner was filtered out", () => {
  const plan = fixturePlan();
  plan.workflowSteps = [{
    id: "orphan-step",
    capabilityIds: ["missing-capability"],
    when: "always",
    input: "request",
    action: "perform an unowned operation",
    output: "result",
    fallback: "stop",
    requires: ["$request"],
    produces: ["orphan-output"],
    mutates: [],
  }, {
    id: "deliver-result",
    capabilityIds: ["core-resume"],
    role: "deliver",
    when: "after validation",
    input: "checked result",
    action: "deliver the checked result",
    output: "final result",
    fallback: "stop",
    requires: ["orphan-output"],
    produces: ["$output"],
    delivers: ["orphan-output"],
    mutates: [],
  }];
  const ir = compileSkillIR({
    skillName: "orphan-workflow",
    idea: "根据 JD 修改简历",
    answers: { inputs: "目标 JD；真实经历" },
    plan,
    loop: { mode: "hybrid", goal: "交付岗位匹配的简历", maxRounds: 3, stopConditions: [], escalationConditions: [], scopes: [] },
    requirements: [{ id: "goal", requirement: "根据 JD 修改简历", provenance: "user_explicit", modality: "MUST", hard: true, source: "initial user goal" }],
  });
  assert.deepEqual(ir.runtimeContract.workflow.find((step) => step.id === "orphan-step")?.capabilityIds, ["core-resume"]);
});

test("Canonical SkillIR preserves an input-required branch beside the productive path", () => {
  const plan = fixturePlan();
  plan.workflowSteps = [
    {
      id: "confirm-key-parts",
      capabilityIds: ["core-resume"],
      when: "关键信息缺失时",
      input: "当前请求",
      action: "请求用户确认会改变结果的关键信息",
      output: "待确认问题",
      fallback: "等待用户补充信息",
      requires: ["$request"],
      // Reproduce an older cached plan that illegally produced a built-in
      // input token. The compiler must migrate it instead of pausing Build.
      produces: ["$confirmed"],
      mutates: [],
    },
    {
      id: "produce-result",
      capabilityIds: ["core-resume"],
      when: "必要信息已经确认时",
      input: "当前请求与已确认信息",
      action: "完成核心任务",
      output: "可交付结果",
      fallback: "说明无法继续的原因",
      requires: ["$confirmed"],
      produces: ["result"],
      mutates: [],
    },
  ];
  const ir = compileSkillIR({
    skillName: "generic-confirmation-workflow",
    idea: "完成需要关键参数的任务",
    answers: { inputs: "当前请求" },
    plan,
    loop: { mode: "hybrid", goal: "交付任务结果", maxRounds: 3, stopConditions: [], escalationConditions: [], scopes: [] },
    requirements: [{ id: "goal", requirement: "完成需要关键参数的任务", provenance: "user_explicit", modality: "MUST", hard: true, source: "initial user goal" }],
  });
  assert.deepEqual(ir.runtimeContract.workflow.find((item) => item.id === "confirm-key-parts")?.produces, ["$input_required"]);
  assert.deepEqual(ir.runtimeContract.workflow.find((item) => item.id === "produce-result")?.produces, ["result", "$output"]);
  assert.deepEqual(ir.runtimeContract.workflow.find((item) => item.id === "confirm-key-parts")?.resumeProduces, ["$confirmed"]);
});

test("canonical runtime projection links every compiler-owned knowledge resource", () => {
  const ir = compile();
  ir.domainEvidence = [{ rule: "Use evidence-backed terminology", evidence_type: "official_rule", confidence: 0.95 }];
  ir.resourcePlan.resources.push({
    capabilityId: "core-resume",
    kind: "reference",
    path: "references/source-evidence.md",
    decision: "include",
    reason: "user supplied evidence",
    consumerTaskIds: ["task-core"],
  });
  const projected = projectSkillMarkdown(ir);
  assert.match(projected, /\[Evidence-grounded domain playbook\]\(references\/domain-playbook\.md\)/);
  assert.match(projected, /\[User-provided source evidence\]\(references\/source-evidence\.md\)/);
});

test("source evidence is projected only when its file is materialized", () => {
  const ir = compile();
  const sourceCapability = {
    ...ir.capabilities[0],
    id: "source-evidence",
    kind: "reference",
    name: "Uploaded source evidence",
    implementation: { path: "references/source-evidence.md", layer: "runtime", status: "use-provided" },
  };
  ir.capabilities.push(sourceCapability);
  ir.tasks[0].capabilityIds.push(sourceCapability.id);
  ir.runtimeContract.workflow.push({
    id: "step-source-evidence",
    capabilityIds: [sourceCapability.id],
    when: "uploaded source evidence exists",
    input: "uploaded source evidence",
    action: "read the evidence",
    output: "grounded decisions",
    fallback: "continue without source-specific decisions",
  });
  ir.resourcePlan.resources.push({
    capabilityId: sourceCapability.id,
    kind: "reference",
    path: "references/source-evidence.md",
    decision: "include",
    reason: "user supplied evidence",
    consumerTaskIds: ["task-core"],
  });

  const withoutSource = reconcileSkillIRSourceEvidence(ir, false);
  assert.equal(withoutSource.capabilities.some((item) => item.id === sourceCapability.id), false);
  assert.equal(withoutSource.resourcePlan.resources.some((item) => item.path === "references/source-evidence.md"), false);
  assert.equal(withoutSource.runtimeContract.workflow.some((item) => item.capabilityIds.includes(sourceCapability.id)), false);
  assert.doesNotMatch(projectSkillMarkdown(withoutSource), /references\/source-evidence\.md/);

  const withSource = reconcileSkillIRSourceEvidence(compile(), true);
  assert.match(projectSkillMarkdown(withSource), /\[User-provided source evidence\]\(references\/source-evidence\.md\)/);
});

test("owner content permission is canonical and removes conflicting generator defaults", () => {
  const answers = { "__idea": "可以随意扩写并增加经历和量化数据，让结果更符合目标" };
  const ir = compile();
  ir.stateRequirement = {
    needed: false,
    scope: "none",
    missingBehavior: "缺少信息时不把未知当作事实，并禁止编造经历",
  };
  ir.evaluationPlan.failureModes.push("禁止编造量化数据");

  const reconciled = reconcileSkillIRContentPermission(ir, answers);
  const projected = projectSkillMarkdown(reconciled);
  assert.equal(reconciled.controlModel.contentPermission.allowFactualCreation, true);
  assert.match(projected, /可以随意扩写并增加经历和量化数据/);
  assert.doesNotMatch(JSON.stringify(reconciled), /禁止编造经历|不把未知当作事实|禁止编造量化数据/);
});

test("compiler deterministically scopes contradictory ask-first and autonomous runtime branches", () => {
  const ir = compile();
  const contradictory = "缺少信息时必须先询问用户确认，同时无需确认直接自主继续完成";
  ir.capabilities[0].fallback = contradictory;
  ir.inputs[0].missingBehavior = contradictory;
  ir.runtimeContract.workflow[0].fallback = contradictory;
  ir.riskBranches = [{ id: "risk-permission", condition: "输入不足", action: contradictory, stopOrRedirect: contradictory }];

  const reconciled = reconcileSkillIRActionPermissions(ir);
  const projected = projectSkillMarkdown(reconciled);
  assert.doesNotMatch(JSON.stringify(reconciled), /同时无需确认直接自主继续完成/);
  assert.match(projected, /根据依赖条件分别处理/);
  assert.match(projected, /其余不依赖该信息的可逆工作可以自主继续/);
});

test("compiler makes repeated confirmation and analysis-only completion impossible", () => {
  const ir = compile();
  ir.runtimeContract.instructionPriority = [];
  ir.runtimeContract.completionChecks = [];
  ir.outputs[0].requiredSections = [];
  ir.outputs[0].validation = [];

  const reconciled = reconcileSkillIRActionPermissions(ir);
  const projected = projectSkillMarkdown(reconciled);
  assert.match(projected, /never ask the user to confirm information or authority they already provided/i);
  assert.match(projected, /analysis, a plan, or questions alone do not complete the workflow/i);
  assert.deepEqual(reconciled.outputs[0].requiredSections, ["可检查的主要结果"]);
  assert.ok(reconciled.outputs[0].validation.some((item) => /实际结果已经生成/.test(item)));
});

test("projection repairs generated action conflicts but preserves conflicting user evidence for clarification", () => {
  const ir = compile();
  ir.capabilities[0].activationCondition = "必须先询问用户确认时";
  ir.capabilities[0].fallback = "无需确认直接自主继续完成";
  ir.requirements.push({
    id: "owner-ambiguous-permission",
    statement: "必须先询问用户确认，同时无需确认直接自主继续完成",
    provenance: "user_explicit",
    source: "interview.workflow",
    confidence: 1,
    modality: "MUST",
    ruleType: "hard_constraint",
    failureCost: "high",
    hard: true,
    mappedCapabilityIds: [ir.capabilities[0].id],
  });

  const projected = projectSkillMarkdown(reconcileSkillIRActionPermissions(ir));
  const conflicts = projected.split("\n").filter(hasUnscopedActionPermissionConflict);
  assert.deepEqual(conflicts, ["- [MUST; user_explicit] 必须先询问用户确认，同时无需确认直接自主继续完成"]);
  assert.ok(auditUserEvidencePolarity(ir).some((issue) => issue.includes("USER_CONFIRMATION_CONFLICT")));
});

test("tool contracts preserve the canonical capability scope contract", () => {
  const ir = compile();
  const capability = ir.capabilities.find((item) => item.id === "core-resume");
  capability.kind = "builtin-tool";
  capability.scope = "conditional";
  capability.activationCondition = "only when fresh external evidence is required";
  capability.affects = ["knowledge-grounding"];
  capability.mustNotAffect = ["default-output-contract"];
  capability.implementation.status = "use-provided";
  const contract = JSON.parse(projectToolContracts(ir)).tools[0];
  assert.equal(contract.scope, capability.scope);
  assert.equal(contract.activation_condition, capability.activationCondition);
  assert.deepEqual(contract.affects, capability.affects);
  assert.deepEqual(contract.must_not_affect, capability.mustNotAffect);
});

test("duplicate-rule gate ignores canonical projections but catches competing author-owned rules", () => {
  const repeated = "When the necessary input is absent, stop the dependent operation and request only that missing input";
  assert.equal(countDuplicateAuthorRuntimeRules({
    "SKILL.md": repeated,
    "references/tooling.md": repeated,
    "references/output-contract.md": repeated,
  }), 0);
  assert.equal(countDuplicateAuthorRuntimeRules({
    "SKILL.md": repeated,
    "references/examples.md": repeated,
  }), 1);
});

test("canonical mutation survives projection and changes the semantic digest", () => {
  const baseline = compile();
  const mutation = {
    type: "requirement.add",
    requirement: {
      id: "confirmed-direct-first",
      statement: "已有足够输入时直接生成，不重复追问",
      provenance: "user_explicit",
      source: "personalization.demo-feedback",
      confidence: 1,
      modality: "MUST",
      ruleType: "preference",
      failureCost: "medium",
      hard: true,
      mappedCapabilityIds: [baseline.capabilities.find((item) => item.kind === "llm").id],
    },
  };
  const candidate = applySkillIRMutations(baseline, [mutation]).ir;
  const validation = validateCanonicalSkillIR(candidate);
  assert.equal(validation.valid, true, validation.issues.join("; "));
  assert.notEqual(semanticSkillIRDigest(candidate), semanticSkillIRDigest(baseline));
  assert.match(projectSkillMarkdown(candidate), /已有足够输入时直接生成，不重复追问/);
  assert.ok(candidate.runtimeContract.workflow.length > 0);
  assert.ok(candidate.constraints.some((item) => item.id === "constraint-confirmed-direct-first"));
});

test("canonical mutation normalization accepts common provider aliases without weakening target validation", () => {
  const normalized = normalizeCanonicalMutations([
    { type: "input_update", targetId: "input-target-jd", patch: { required: true } },
    { action: "update_requirement", target_id: "requirement-goal", updates: { hard: true } },
  ]);
  assert.deepEqual(normalized, [
    { type: "input.update", inputId: "input-target-jd", changes: { required: true } },
    { type: "requirement.update", requirementId: "requirement-goal", changes: { hard: true } },
  ]);
});

test("failure feedback mutates only canonical domain evidence and risk branches", () => {
  const baseline = compile();
  const candidate = applySkillIRMutations(baseline, normalizeCanonicalMutations([
    {
      type: "domain_evidence_add",
      evidence: {
        id: "decision-jd-priority",
        rule: "当 JD 明确列出必备条件时，先映射有直接证据的经历，再处理可迁移能力",
        category: "decision_rules",
        applies_when: "JD 同时包含必备和加分条件",
        exception: "用户明确要求采用不同排序时服从当前指令",
        evidence_type: "evidence_backed_practice",
        confidence: 0.82,
        eval_case_ids: ["core-resume-regression"],
      },
    },
    {
      type: "risk_branch_add",
      branch: {
        id: "missing-jd-exception",
        condition: "目标 JD 缺失",
        action: "只分析现有简历并请求最少必要的 JD 信息",
        stopOrRedirect: "停止岗位定制步骤，不虚构职位要求",
      },
    },
  ])).ir;
  const validation = validateCanonicalSkillIR(candidate);
  assert.equal(validation.valid, true, validation.issues.join("; "));
  assert.ok(candidate.domainEvidence.some((item) => item.id === "decision-jd-priority"));
  assert.ok(candidate.riskBranches.some((item) => item.id === "missing-jd-exception"));
  assert.match(projectSkillMarkdown(candidate), /目标 JD 缺失/);
});

test("runtime projector emits kind-specific executable protocols", () => {
  const base = {
    id: "cap",
    name: "Capability",
    scope: "conditional",
    activationCondition: "when requested",
    requirement: "complete the declared operation",
    purpose: "produce a verified result",
    input: "records",
    output: "results",
    fallback: "stop the dependent step",
    routingCondition: "when requested",
    affects: ["runtime-workflow"],
    mustNotAffect: [],
    implementation: { path: "SKILL.md", layer: "runtime", status: "generate" },
    necessity: { successLift: "high", bareModelReliable: false, deterministicNeed: false, realResourceAvailable: true, externalDependency: false, decision: "include", reason: "required" },
    dependencies: [],
    evidenceRequirements: [],
    evalCaseIds: [],
  };
  const operation = (kind, changes = {}) => projectCapabilityRuntimeOperation({ ...base, kind, ...changes });
  assert.match(operation("llm"), /`REASON`/);
  assert.match(operation("reference", { implementation: { ...base.implementation, path: "references/playbook.md" } }), /`READ\(`references\/playbook\.md`\)`/);
  assert.match(operation("script", { implementation: { ...base.implementation, path: "scripts/compute.py" } }), /`RUN\(`scripts\/compute\.py`, contract\)`[\s\S]*exit status/);
  assert.match(operation("builtin-tool"), /`VERIFY_HOST → CALL`/);
  assert.match(operation("mcp", { connection: { server: "calendar", tools: ["create_event"], verified: true } }), /`VERIFY_SERVER → CALL_MCP`[\s\S]*calendar[\s\S]*create_event/);
  assert.match(operation("asset", { implementation: { ...base.implementation, path: "assets/template.docx" } }), /`COPY\/FILL\/TRANSFORM\(`assets\/template\.docx`\)`/);
  const artifact = projectCapabilityRuntimeOperation(
    { ...base, kind: "script", implementation: { ...base.implementation, path: "scripts/export.py" } },
    [{ id: "out", name: "Report", mode: "artifact", requiredSections: [], artifactPatterns: ["outputs/*.pdf"], producerCapabilityIds: ["cap"], validation: ["PDF opens"] }],
  );
  assert.match(artifact, /`SERIALIZE → VALIDATE`[\s\S]*`outputs\/\*\.pdf`[\s\S]*PDF opens/);
});

test("workflow operations consume node contracts, never the owner capability's whole task", () => {
  for (const domain of ["compare equipment documents", "reconcile inventory batches"]) {
    const capability = { ...compile().capabilities[0], kind: "llm", requirement: `Complete all of ${domain}`, purpose: domain, input: "all source material", output: "all final artifacts" };
    const step = { id: "check", capabilityIds: [capability.id], role: "validate", requires: ["draft"], produces: ["check_result"], mutates: [], input: "existing draft", output: "validation receipt", action: "Check the existing artifact against the approved contract", fallback: "report the failed check" };
    const operation = projectWorkflowRuntimeOperation(step, [capability], compile().outputs);
    assert.match(operation, /VALIDATE_EXISTING/);
    assert.match(operation, /inspect `draft`/);
    assert.doesNotMatch(operation, /Complete all of|all final artifacts|SERIALIZE/);
    const wait = projectWorkflowRuntimeOperation({ ...step, role: "await-approval", action: "Ask for approval", produces: ["$approval_required"], resumeProduces: ["$approved"] }, [capability]);
    assert.match(wait, /ASK → PAUSE/);
    assert.match(wait, /Only a real user reply/);
    assert.doesNotMatch(wait, /`REASON`|VERIFY_HOST/);
    const delivery = projectWorkflowRuntimeOperation({ ...step, role: "deliver", action: "Deliver the checked report", delivers: ["draft"], produces: ["$output"] }, [capability]);
    assert.match(delivery, /Do not regenerate or rewrite/);
    assert.doesNotMatch(delivery, /`REASON`|SERIALIZE/);
    const combined = projectWorkflowRuntimeOperation({ ...step, role: "deliver", action: "Create and deliver the report", requires: ["source"], produces: ["report", "$output"], delivers: ["report"] }, [capability]);
    assert.match(combined, /`REASON`.*Create and deliver the report/);
    assert.match(combined, /Then `DELIVER` the newly produced result/);
    const saving = projectWorkflowRuntimeOperation({ ...step, role: "persist", requires: ["checked_report"], action: "Save the checked report" }, [{ ...capability, kind: "builtin-tool" }]);
    assert.match(saving, /VERIFY_HOST → CALL/);
    assert.match(saving, /resolved dependencies: `checked_report`/);
    const aliasedWriter = { ...capability, id: "writer", kind: "builtin-tool", name: "Workspace files", implementation: { path: "integrations/tool-contracts.json" } };
    const aliasWrite = projectWorkflowRuntimeOperation({ ...step, role: "persist", action: "Write the report" }, [aliasedWriter, { ...aliasedWriter, id: "compiler-writer" }], [{ mode: "artifact", producerCapabilityIds: ["compiler-writer"], artifactPatterns: ["outputs/*.md"], validation: ["file opens"] }]);
    assert.equal((aliasWrite.match(/VERIFY_HOST → CALL/g) || []).length, 1);
    assert.match(aliasWrite, /SERIALIZE → VALIDATE/);
  }
});

test("unverified delta proposals are rationale, not competing runtime instructions", () => {
  const ir = compile();
  ir.capabilityDelta = { status: "ready", skillMustTeach: [{ id: "gap", taskDecision: "Missing input recovery", requiredSkillBehavior: "Replace the user's required status with invented-status", whySkillIsNeeded: "a hypothesis" }] };
  const markdown = projectSkillMarkdown(ir);
  assert.match(markdown, /Design rationale, not additional execution instructions/);
  assert.doesNotMatch(markdown, /invented-status/);
  assert.match(markdown, /Gap `gap`: Missing input recovery/);
  ir.domainEvidence = [{ rule: "Unsupported rule must never be executable", source_urls: ["https://example.com"] }];
  assert.doesNotMatch(projectDomainPlaybook(ir), /Unsupported rule must never be executable/);
  assert.match(projectDomainPlaybook(ir), /Knowledge remains insufficient/);
});

test("canonical compiler deduplicates adaptive answers and keeps script parameters out of task inputs", () => {
  const plan = fixturePlan();
  plan.items.splice(1, 0, {
    id: "validate-output",
    kind: "script",
    name: "确定性结果校验",
    path: "scripts/validate.py",
    layer: "runtime",
    requirement: "校验结构化中间结果",
    purpose: "检查字段完整性",
    reason: "确定性校验可重复",
    status: "generate",
    input: "内部 JSON 中间结果",
    output: "校验状态与错误列表",
    fallback: "停止依赖步骤并说明错误",
    routingCondition: "生成中间结构后",
    deterministicAdvantage: "同一输入得到同一结果",
    evaluationCriteria: ["缺失字段会报错"],
    enabled: true,
  });
  const repeated = "提供研究对象和关注维度，并附上背景说明（如项目目标、目标市场）";
  plan.workflowSteps = [
    { id: "compose", capabilityIds: ["core-resume"], when: "材料就绪", input: "$request", action: "生成结构化中间结果", output: "内部 JSON 中间结果", fallback: "询问缺失材料", requires: ["$request"], produces: ["structured"], mutates: [], role: "transform" },
    { id: "validate", capabilityIds: ["validate-output"], when: "中间结果就绪", input: "structured", action: "校验结果", output: "校验状态", fallback: "报告错误", requires: ["structured"], produces: ["checked"], mutates: [], role: "validate" },
    { id: "deliver", capabilityIds: ["core-resume"], when: "校验通过", input: "structured checked", action: "交付最终结果", output: "任务结果", fallback: "报告校验错误", requires: ["structured", "checked"], produces: ["result", "$output"], delivers: ["result"], mutates: [], role: "deliver" },
  ];
  const ir = compileSkillIR({
    skillName: "research-products",
    idea: "研究多个产品并给出策略建议",
    answers: { inputs: repeated },
    plan,
    loop: { mode: "hybrid", goal: "交付研究结果", maxRounds: 3, stopConditions: ["通过"], escalationConditions: [], scopes: [] },
    requirements: [
      { id: "answer-ai-round-2-question-1", requirement: repeated, provenance: "user_explicit", modality: "MUST", hard: true, source: "interview.ai-round-2-question-1" },
      { id: "answer-inputs", requirement: repeated, provenance: "user_explicit", modality: "MUST", hard: true, source: "interview.inputs" },
    ],
  });
  assert.equal(ir.requirements.filter((item) => item.statement === repeated).length, 1);
  assert.equal(ir.inputs.some((item) => /JSON|中间结果/.test(item.name)), false);
  assert.equal(ir.inputs.some((item) => item.name === "目标市场"), false);
  assert.equal(ir.requirements[0].mappedCapabilityIds.includes("validate-output"), false);
});

test("alternative input representations compile as one any-of source contract", () => {
  const inputs = deriveTaskInputContract({
    idea: "整理客户访谈记录",
    answers: { inputs: "纯文本粘贴；结构化表格（如Excel/CSV）" },
  });
  const required = inputs.filter((item) => item.required);
  assert.equal(required.length, 1);
  assert.equal(required[0].concept, "source-material");
  assert.deepEqual(required[0].representations, ["text", "structured-file"]);
  assert.match(projectSkillMarkdown({ ...compile(), inputs, tasks: [{ ...compile().tasks[0], requiredInputIds: [required[0].id], optionalInputIds: [] }] }), /支持：text、structured-file/);
});

test("missing-input recovery answers remain policies rather than required materials", () => {
  const inputs = deriveTaskInputContract({
    idea: "读取用户提供的两份 PDF 产品说明书，按比较维度生成 Markdown 对比表。",
    answers: { inputs: "先标记'未提供'，同时列出缺失项清单，供我后续补充" },
    capabilityInputs: ["比较维度"],
  });
  assert.equal(inputs.some((item) => /标记|列出|后续补充/.test(item.name)), false);
  assert.ok(inputs.some((item) => item.concept === "source-material" && item.representations.includes("pdf")));
  assert.ok(inputs.some((item) => item.name === "比较维度"));
  const mixed = deriveTaskInputContract({ idea: "整理材料", answers: { inputs: "原始材料PDF；缺少时先标记未提供" } });
  assert.equal(mixed.length, 1);
  assert.deepEqual(mixed[0].representations, ["pdf"]);
});

test("compound input declarations become atomic logical dependencies with separate representations", () => {
  const inputs = deriveTaskInputContract({
    idea: "根据目标规范转换现有材料",
    answers: { inputs: "直接粘贴目标规范文本，并上传现有材料PDF" },
  });
  assert.equal(inputs.length, 2);
  assert.equal(inputs.every((item) => item.required), true);
  assert.deepEqual(inputs.map((item) => item.representations), [["text"], ["pdf"]]);
  assert.ok(inputs.some((item) => /目标规范/.test(item.name)));
  assert.ok(inputs.some((item) => item.concept === "source-material"));
});

test("capability inputs with representation suffixes still become concrete task inputs", () => {
  const inputs = deriveTaskInputContract({
    idea: "根据故障日志和服务指标制定修复方案",
    answers: { inputs: "我不确定，请 AI 帮我判断" },
    capabilityInputs: ["故障日志文件", "服务指标, 变更记录", "analysis_result"],
  });
  assert.ok(inputs.some((item) => item.name === "故障日志"));
  assert.ok(inputs.some((item) => item.name === "服务指标"));
  assert.equal(inputs.some((item) => /请 AI 帮我判断/.test(item.name)), false);
});

test("uncontrollable outcomes never become runtime success or completion checks", () => {
  const normalized = normalizeOutcomeModel({
    ultimateGoal: "提高现实世界中的成功机会",
    controllableOutcomes: ["交付可检查的结果", "外部平台最终采纳（不可控）"],
    uncontrollableOutcomes: ["无法保证第三方采纳"],
    observableIndicators: ["输出覆盖验收要求", "第三方最终采纳（外部结果）"],
  });
  assert.deepEqual(normalized.controllableOutcomes, ["交付可检查的结果"]);
  assert.deepEqual(normalized.observableIndicators, ["输出覆盖验收要求"]);
  assert.ok(normalized.uncontrollableOutcomes.some((item) => /第三方最终采纳/.test(item)));

  const plan = fixturePlan();
  plan.outcomeModel = normalized;
  plan.outputContract.validation.push("第三方最终采纳（外部结果）");
  const ir = compileSkillIR({
    skillName: "generic-task",
    idea: "完成一个可检查任务",
    answers: {},
    plan,
    loop: { mode: "hybrid", goal: "提高成功机会", maxRounds: 3, stopConditions: ["完成"], escalationConditions: [], scopes: [] },
    requirements: [{ id: "goal", requirement: "完成一个可检查任务", provenance: "user_explicit", modality: "MUST", hard: true, source: "initial user goal" }],
  });
  assert.equal(ir.runtimeContract.completionChecks.some((item) => /第三方最终采纳/.test(item)), false);
});

test("capability necessity gate removes decorative resources without an executable branch", () => {
  const plan = fixturePlan();
  plan.items.splice(1, 0, {
    id: "decorative-tool",
    kind: "builtin-tool",
    name: "Decorative tool",
    path: "integrations/tool-contracts.json",
    layer: "runtime",
    requirement: "可能使用一个工具",
    purpose: "让能力看起来更全面",
    reason: "工具可能有帮助",
    status: "use-provided",
    input: "当前任务",
    output: "工具结果",
    fallback: "无",
    routingCondition: "需要时",
    activationCondition: "需要时",
    deterministicAdvantage: "无",
    evaluationCriteria: [],
    enabled: true,
  });
  const ir = compileSkillIR({
    skillName: "generic-task",
    idea: "完成当前任务",
    answers: {},
    plan,
    loop: { mode: "hybrid", goal: "完成任务", maxRounds: 3, stopConditions: ["完成"], escalationConditions: [], scopes: [] },
    requirements: [{ id: "goal", requirement: "完成当前任务", provenance: "user_explicit", modality: "MUST", hard: true, source: "initial user goal" }],
  });
  assert.equal(ir.capabilities.some((item) => item.id === "decorative-tool"), false);
  assert.equal(ir.tasks[0].capabilityIds.includes("decorative-tool"), false);
});

test("runtime projection removes build telemetry while preserving evidence-aware behavior", () => {
  const plan = fixturePlan();
  plan.summary = "已从 12 个网页来源编译出专业知识";
  plan.items[0].requirement = "使用 2 条权威规则、3 条有条件实践，并把 7 条较弱证据作为参考洞察";
  const ir = compileSkillIR({
    skillName: "generic-task",
    idea: "完成当前任务",
    answers: {},
    plan,
    loop: { mode: "hybrid", goal: "完成任务", maxRounds: 3, stopConditions: ["完成"], escalationConditions: [], scopes: [] },
    requirements: [{ id: "goal", requirement: "完成当前任务", provenance: "user_explicit", modality: "MUST", hard: true, source: "initial user goal" }],
  });
  const projected = projectSkillMarkdown(ir);
  assert.doesNotMatch(projected, /12 个网页来源|2 条权威规则|3 条有条件实践|7 条较弱证据/);
  assert.match(ir.capabilities[0].requirement, /达到证据门槛的专业知识/);
  assert.match(projected, /完成语义匹配和表达/);
});

test("a required task input never inherits a meaningless not-applicable missing policy", () => {
  const inputs = deriveTaskInputContract({
    idea: "整理客户访谈记录",
    answers: { inputs: "客户访谈表格" },
    missingBehavior: "不适用",
  });
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].required, true);
  assert.doesNotMatch(inputs[0].missingBehavior, /不适用/);
  assert.match(inputs[0].missingBehavior, /请求|提供/);
});

test("canonical migration fills legacy input resolution before optimizer mutations", () => {
  const plan = fixturePlan();
  const ir = compileSkillIR({
    skillName: "legacy-input-skill",
    idea: "根据任务说明处理原始材料",
    answers: { inputs: "任务说明；原始材料" },
    plan,
    loop: { mode: "single-pass", goal: "交付结果", maxRounds: 1, stopConditions: ["完成"], escalationConditions: [], scopes: [] },
    requirements: [{ id: "goal", requirement: "处理原始材料", provenance: "user_explicit", modality: "MUST", hard: true, source: "initial user goal" }],
  });
  const legacy = structuredClone(ir);
  delete legacy.inputs[0].resolution;
  legacy.inputs[0].missingBehavior = "";
  assert.equal(validateCanonicalSkillIR(legacy).valid, false);
  const migrated = reconcileSkillIRInputResolutions(legacy, { inputs: "任务说明；原始材料" });
  assert.equal(validateCanonicalSkillIR(migrated).valid, true);
  assert.ok(migrated.inputs[0].resolution.stopCondition);
});

test("semantically distinct inputs remain independently required", () => {
  const inputs = deriveTaskInputContract({
    idea: "根据目标岗位说明改写现有材料",
    answers: { inputs: "目标岗位说明；现有经历材料" },
  });
  assert.equal(inputs.filter((item) => item.required).length, 2);
});

test("search and passive assets cannot impersonate a file producer", () => {
  const plan = fixturePlan();
  plan.outputContract = { mode: "artifact", format: "Markdown 文件", requiredSections: ["核心结果"], artifactPatterns: ["outputs/*.md"], validation: ["文件存在"] };
  plan.items.splice(1, 0,
    {
      id: "host-web-search",
      kind: "builtin-tool",
      name: "联网搜索",
      path: "integrations/tool-contracts.json",
      layer: "runtime",
      requirement: "获取最新来源",
      purpose: "核验变化信息",
      reason: "需要最新网页",
      status: "use-provided",
      input: "查询",
      output: "带链接的搜索结论",
      fallback: "说明未联网",
      routingCondition: "信息可能变化时",
      deterministicAdvantage: "返回真实网页",
      evaluationCriteria: ["有来源"],
      enabled: true,
    },
    {
      id: "markdown-template",
      kind: "asset",
      name: "Markdown 模板",
      path: "assets/template.md",
      layer: "runtime",
      requirement: "提供版式",
      purpose: "复用标题结构",
      reason: "固定结构",
      status: "generate",
      input: "字段",
      output: "Markdown 模板",
      fallback: "现场组织结构",
      routingCondition: "需要模板时",
      deterministicAdvantage: "固定结构",
      evaluationCriteria: ["结构存在"],
      enabled: true,
    },
  );
  plan.workflowSteps = [
    { id: "search", capabilityIds: ["host-web-search"], when: "需要来源", input: "$request", action: "读取查询结果", output: "检索证据", fallback: "标记未联网", requires: ["$request"], produces: ["sources"], mutates: [], role: "read" },
    { id: "compose", capabilityIds: ["core-resume", "markdown-template"], when: "证据就绪", input: "$request sources", action: "交付最终研究结果", output: "研究文本", fallback: "说明缺口", requires: ["$request", "sources"], produces: ["report", "$output"], delivers: ["report"], mutates: [], role: "deliver" },
  ];
  const ir = compileSkillIR({
    skillName: "research-products",
    idea: "研究多个产品",
    answers: {},
    plan,
    loop: { mode: "hybrid", goal: "交付研究结果", maxRounds: 3, stopConditions: ["通过"], escalationConditions: [], scopes: [] },
    requirements: [{ id: "goal", requirement: "研究多个产品", provenance: "user_explicit", modality: "MUST", hard: true, source: "initial user goal" }],
  });
  assert.deepEqual(ir.outputs[0].producerCapabilityIds, []);
});

test("Eval bindings and manifest are projections of the same SkillIR", () => {
  const evalText = JSON.stringify({ evals: [
    { id: "trigger-1", eval_family: "trigger", capability_ids: [] },
    {
      id: "core-1", eval_family: "capability", category: "core_capability", capability_ids: ["core-resume"],
      prompt: "请根据完整的目标岗位说明与候选人真实经历，生成一份可以直接核对的岗位定制简历内容。",
      context: { fixture_status: "ready" }, expected: { behaviors: ["交付岗位定制简历内容"], artifacts: [] },
      graders: ["core_capability"], runnable: true,
    },
  ] });
  const ir = bindSkillIREvals(compile(), evalText);
  const manifest = projectCapabilityManifest(ir);
  const files = {
    "SKILL.md": projectSkillMarkdown(ir),
    "evals/skill-ir.json": JSON.stringify(ir),
    "evals/capability-manifest.json": JSON.stringify(manifest),
    "evals/evals.json": projectEvalBank(ir),
  };
  assert.deepEqual(auditSkillIRFiles(files), []);
  assert.deepEqual(ir.capabilities.find((item) => item.id === "core-resume")?.evalCaseIds, ["core-1"]);
  assert.equal(manifest.skill_ir.path, "evals/skill-ir.json");
});

test("canonical eval compiler deterministically closes every active capability after restore", () => {
  const ir = compile();
  const domainCapability = {
    ...ir.capabilities[0],
    id: "domain-decision-playbook",
    kind: "reference",
    name: "Domain decision playbook",
    requirement: "Use source-backed domain decisions when their routing condition matches",
    input: "current task conditions",
    output: "source-backed decision",
    evidenceRequirements: ["applies the routed domain decision and keeps its evidence boundary visible"],
    implementation: { path: "references/domain-playbook.md", layer: "runtime", status: "generate" },
  };
  ir.capabilities.push(domainCapability);
  ir.tasks[0].capabilityIds.push(domainCapability.id);
  const seed = JSON.stringify({
    version: "2.7",
    skill_name: ir.identity.skillName,
    evals: [
      { id: "trigger-explicit", eval_family: "trigger", category: "trigger_explicit", should_trigger: true, capability_ids: [] },
      { id: "trigger-implicit", eval_family: "trigger", category: "trigger_implicit", should_trigger: true, capability_ids: [] },
      { id: "trigger-context", eval_family: "trigger", category: "trigger_context", should_trigger: true, capability_ids: [] },
      { id: "trigger-negative", eval_family: "trigger", category: "trigger_negative", should_trigger: false, capability_ids: [] },
      { id: "core-resume", eval_family: "capability", category: "core_capability", should_trigger: true, capability_ids: ["core-resume"], graders: ["core_capability"], prompt: "这是一个包含目标岗位要求和候选人经历的真实简历改写任务，请产出可以直接使用的改写结果。" },
    ],
  });
  const covered = ensureSkillIREvalCoverage(ir, seed);
  const parsed = JSON.parse(covered);
  const domainCase = parsed.evals.find((item) => item.capability_ids?.includes(domainCapability.id));
  assert.equal(parsed.evals.length <= 20, true);
  assert.equal(domainCase?.eval_family, "grounding");
  assert.deepEqual(domainCase?.graders, ["grounding"]);
  assert.equal(domainCase?.prompt, "这是一个包含目标岗位要求和候选人经历的真实简历改写任务，请产出可以直接使用的改写结果。");
  const bound = bindSkillIREvals(ir, covered);
  assert.deepEqual(bound.capabilities.find((item) => item.id === domainCapability.id)?.evalCaseIds, [domainCase.id]);
});

test("canonical eval compiler does not accept an unfocused optional tool case as coverage", () => {
  const ir = compile();
  const shellCapability = {
    ...structuredClone(ir.capabilities[0]),
    id: "host-shell-code",
    kind: "builtin-tool",
    name: "Terminal execution",
    scope: "optional",
    activationCondition: "Only when deterministic local execution is required and the host exposes a terminal",
    routingCondition: "Use only for deterministic local execution",
    input: "validated command and working directory",
    output: "command receipt and observable output",
    implementation: { path: "integrations/host-shell-code.md", layer: "runtime", status: "requires-setup" },
    connection: undefined,
  };
  ir.capabilities.push(shellCapability);
  ir.tasks[0].capabilityIds.push(shellCapability.id);
  const seed = JSON.stringify({ evals: [
    { id: "trigger-explicit", eval_family: "trigger", category: "trigger_explicit", should_trigger: true, capability_ids: [], prompt: "请使用这个 Skill，根据完整的目标岗位说明和候选人经历，生成一份可以直接核对的岗位定制简历。" },
    { id: "trigger-implicit", eval_family: "trigger", category: "trigger_implicit", should_trigger: true, capability_ids: [], prompt: "我已经给出目标岗位和完整经历，请按照我们确认的规则继续处理并交付可检查结果。" },
    { id: "trigger-context", eval_family: "trigger", category: "trigger_context", should_trigger: true, capability_ids: [], prompt: "继续处理下一份新材料，沿用任务目标但重新核对其中的事实与岗位要求。" },
    { id: "trigger-negative", eval_family: "trigger", category: "trigger_negative", should_trigger: false, capability_ids: [], prompt: "只解释岗位定制简历通常包含哪些部分，不要替我生成或修改任何内容。" },
    {
      id: "core-resume", eval_family: "capability", category: "core_capability", should_trigger: true,
      capability_ids: ["core-resume"], graders: ["core_capability"], runnable: true,
      prompt: "目标岗位要求 Python、SQL 和检索增强生成经验；候选人经历包含相关项目和可核验的业务结果。请据此生成岗位定制简历。",
      context: { fixture_status: "ready" }, expected: { behaviors: ["交付岗位定制简历"], artifacts: [] },
    },
    {
      id: "unfocused-shell", eval_family: "integration", category: "core_capability", should_trigger: true,
      capability_ids: ["host-shell-code"], graders: ["integration"], runnable: true,
      prompt: "使用现有材料完成岗位定制简历，并确保最终内容可以核对。",
      context: { fixture_status: "ready" }, expected: { behaviors: ["交付结果"], artifacts: [] },
    },
  ] });

  const covered = ensureSkillIREvalCoverage(ir, seed);
  const parsed = JSON.parse(covered);
  const focused = parsed.evals.filter((item) => item.capability_ids?.includes(shellCapability.id)
    && item.context && Object.keys(item.context).some((key) => /activ|tool|integration|routing|scope/i.test(key)));
  assert.equal(focused.length, 1);
  const bound = bindSkillIREvals(ir, covered);
  assert.deepEqual(bound.capabilities.find((item) => item.id === shellCapability.id)?.evalCaseIds, [focused[0].id]);
  const files = projectSkillIRFiles(bound);
  assert.ok(!auditCapabilityClosure(files).issues.some((issue) => issue.type === "missing-eval" && issue.capabilityId === shellCapability.id));
});

test("canonical eval compiler preserves a runnable failure-mode episode", () => {
  const ir = compile();
  const seed = JSON.stringify({ evals: [
    { id: "trigger-explicit", eval_family: "trigger", category: "trigger_explicit", should_trigger: true, capability_ids: [], prompt: "请使用这个 Skill，根据完整的目标岗位说明和候选人经历，生成一份可以直接核对的岗位定制简历。" },
    { id: "trigger-implicit", eval_family: "trigger", category: "trigger_implicit", should_trigger: true, capability_ids: [], prompt: "我已经给出目标岗位和完整经历，请按照我们确认的规则继续处理并交付可检查结果。" },
    { id: "trigger-context", eval_family: "trigger", category: "trigger_context", should_trigger: true, capability_ids: [], prompt: "继续处理下一份新材料，沿用任务目标但重新核对其中的事实与岗位要求。" },
    { id: "trigger-negative", eval_family: "trigger", category: "trigger_negative", should_trigger: false, capability_ids: [], prompt: "只解释岗位定制简历通常包含哪些部分，不要替我生成或修改任何内容。" },
    {
      id: "core-resume", eval_family: "capability", category: "core_capability", should_trigger: true,
      capability_ids: ["core-resume"], graders: ["core_capability"], runnable: true,
      prompt: "目标岗位要求 Python、SQL 和检索增强生成经验；候选人经历包含相关项目和可核验的业务结果。请据此生成岗位定制简历。",
      context: { fixture_status: "ready" }, expected: { behaviors: ["交付岗位定制简历"], artifacts: [] },
    },
  ] });
  const parsed = JSON.parse(ensureSkillIREvalCoverage(ir, seed));
  const failure = parsed.evals.find((item) => item.category === "failure_mode" && item.runnable !== false);
  assert.ok(failure);
  assert.ok(failure.graders.includes("failure_mode"));
  assert.ok(failure.expected.must_not.length > 0);
  assert.match(failure.prompt, /Python|SQL|检索增强生成/);
});

test("canonical eval compiler never turns a trigger sentence into a fake execution fixture", () => {
  const ir = compile();
  const seed = JSON.stringify({ evals: [
    { id: "trigger-explicit", eval_family: "trigger", category: "trigger_explicit", should_trigger: true, capability_ids: [], prompt: "请使用这个 Skill 帮我完成当前任务，我之后会提供真正需要处理的材料和所有必要输入。" },
  ] });
  const parsed = JSON.parse(ensureSkillIREvalCoverage(ir, seed));
  const generatedCore = parsed.evals.find((item) => item.capability_ids?.includes("core-resume"));
  assert.equal(generatedCore.runnable, false);
  assert.equal(generatedCore.context.fixture_status, "missing");
});

test("canonical eval compiler preserves all execution families when trimming to twenty cases", () => {
  const ir = compile();
  const seedCases = [
    { id: "trigger-explicit", eval_family: "trigger", category: "trigger_explicit", should_trigger: true, capability_ids: [] },
    { id: "trigger-implicit", eval_family: "trigger", category: "trigger_implicit", should_trigger: true, capability_ids: [] },
    { id: "trigger-context", eval_family: "trigger", category: "trigger_context", should_trigger: true, capability_ids: [] },
    { id: "trigger-negative", eval_family: "trigger", category: "trigger_negative", should_trigger: false, capability_ids: [] },
    { id: "core-resume", eval_family: "capability", category: "core_capability", should_trigger: true, capability_ids: ["core-resume"], graders: ["core_capability"], prompt: "这是一个包含完整目标岗位要求和候选人经历的真实任务，请产出可以直接使用的岗位定制结果。" },
    { id: "grounding-control", eval_family: "grounding", category: "failure_mode", should_trigger: true, capability_ids: [], graders: ["grounding"], prompt: "请严格区分用户提供的事实与系统推断，并在缺少依据时明确标记未知内容，不要虚构事实。" },
    ...Array.from({ length: 18 }, (_, index) => ({
      id: `extra-${index + 1}`,
      eval_family: "capability",
      category: "failure_mode",
      should_trigger: true,
      capability_ids: [],
      graders: ["failure_mode"],
      prompt: `这是用于制造裁剪压力的真实失败回归用例 ${index + 1}，要求产生可观察结果并避免指定失败。`,
    })),
    { id: "integration-negative-control", eval_family: "integration", category: "integration_control", should_trigger: true, capability_ids: [], graders: ["integration"], runnable: true, prompt: "请只使用当前已经提供的输入完成任务，不得虚构联网、外部服务、工具调用或文件产物。" },
  ];
  const covered = ensureSkillIREvalCoverage(ir, JSON.stringify({ version: "2.7", evals: seedCases }));
  const parsed = JSON.parse(covered);
  assert.equal(parsed.evals.length, 20);
  assert.deepEqual([...new Set(parsed.evals.map((item) => item.eval_family))].sort(), ["capability", "grounding", "integration", "trigger"]);
  assert.ok(parsed.evals.some((item) => item.id === "integration-negative-control"));
});

test("canonical eval compiler restores a family already missing from a frozen legacy SkillIR", () => {
  const ir = compile();
  const seed = JSON.stringify({ version: "2.7", evals: [
    { id: "trigger-explicit", eval_family: "trigger", category: "trigger_explicit", should_trigger: true, capability_ids: [] },
    { id: "trigger-implicit", eval_family: "trigger", category: "trigger_implicit", should_trigger: true, capability_ids: [] },
    { id: "trigger-context", eval_family: "trigger", category: "trigger_context", should_trigger: true, capability_ids: [] },
    { id: "trigger-negative", eval_family: "trigger", category: "trigger_negative", should_trigger: false, capability_ids: [] },
    { id: "core-resume", eval_family: "capability", category: "core_capability", should_trigger: true, capability_ids: ["core-resume"], graders: ["core_capability"], prompt: "这是一个包含完整目标岗位要求和候选人经历的真实任务，请产出可以直接使用的岗位定制结果。" },
  ] });
  const covered = ensureSkillIREvalCoverage(ir, seed);
  const parsed = JSON.parse(covered);
  assert.deepEqual([...new Set(parsed.evals.map((item) => item.eval_family))].sort(), ["capability", "grounding", "integration", "trigger"]);
  assert.ok(parsed.evals.some((item) => item.id === "integration-negative-control" && item.runnable === true));
  assert.ok(parsed.evals.some((item) => item.id === "grounding-source-boundary-control" && item.runnable === true));
});

test("frozen SkillIR rejects semantic edits to every canonical projection", () => {
  const seed = JSON.stringify({
    version: "2.7",
    dataset_summary: "isolated regression cases",
    evals: [{ id: "core-1", eval_family: "capability", capability_ids: ["core-resume"] }],
  });
  const ir = bindSkillIREvals(compile(), seed);
  const files = {
    "SKILL.md": projectSkillMarkdown(ir),
    "evals/skill-ir.json": JSON.stringify(ir),
    "evals/capability-manifest.json": JSON.stringify(projectCapabilityManifest(ir)),
    "evals/evals.json": projectEvalBank(ir),
  };
  files["SKILL.md"] += "\n- post-IR semantic rewrite\n";
  assert.ok(auditSkillIRFiles(files).some((item) => item.includes("SKILL_PROJECTION_DRIFT")));
  files["SKILL.md"] = projectSkillMarkdown(ir);
  const manifest = JSON.parse(files["evals/capability-manifest.json"]);
  manifest.summary = "silently changed after freeze";
  files["evals/capability-manifest.json"] = JSON.stringify(manifest);
  assert.ok(auditSkillIRFiles(files).some((item) => item.includes("MANIFEST_PROJECTION_DRIFT")));
  files["evals/capability-manifest.json"] = JSON.stringify(projectCapabilityManifest(ir));
  const evalBank = JSON.parse(files["evals/evals.json"]);
  evalBank.evals[0].expected = { behaviors: ["new untracked contract"] };
  files["evals/evals.json"] = JSON.stringify(evalBank);
  assert.ok(auditSkillIRFiles(files).some((item) => item.includes("EVAL_PROJECTION_DRIFT")));
});

test("permission consistency audit and information dependencies use the same user-explicit meaning", () => {
  const evalText = JSON.stringify({ evals: [{ id: "core-1", eval_family: "capability", capability_ids: ["core-resume"] }] });
  const ir = bindSkillIREvals(compile(), evalText);
  ir.requirements.push({
    id: "answer-real-task",
    statement: "可以增加经历和业绩内容，让简历更有竞争力",
    provenance: "user_explicit",
    source: "interview.real-task",
    confidence: 1,
    modality: "MUST",
    ruleType: "hard_constraint",
    failureCost: "high",
    hard: true,
    mappedCapabilityIds: ["core-resume"],
  });
  ir.informationDependencies = [{ field: "新增经历与业绩数字", source_required: "用户授权", source_available: false, inventable: false, missing_behavior: "不生成" }];
  let manifest = projectCapabilityManifest(ir);
  const files = {
    "SKILL.md": "## Goal\n\n根据 JD 改写简历。",
    "evals/skill-ir.json": JSON.stringify(ir),
    "evals/capability-manifest.json": JSON.stringify(manifest),
    "evals/evals.json": evalText,
  };
  assert.ok(auditSkillIRFiles(files).some((item) => item.includes("USER_PERMISSION_IR_CONFLICT")));

  ir.informationDependencies[0].inventable = true;
  ir.informationDependencies[0].missing_behavior = "按用户明确授权补写";
  manifest = projectCapabilityManifest(ir);
  files["evals/skill-ir.json"] = JSON.stringify(ir);
  files["evals/capability-manifest.json"] = JSON.stringify(manifest);
  assert.equal(auditSkillIRFiles(files).some((item) => item.includes("USER_PERMISSION_IR_CONFLICT")), false);

  files["SKILL.md"] = "## Goal\n\n根据 JD 改写简历。\n\n## Rules\n\n- Do not fabricate facts or experience.";
  assert.ok(auditSkillIRFiles(files).some((item) => item.includes("USER_PERMISSION_RUNTIME_CONFLICT")));

  files["SKILL.md"] = "## Goal\n\n根据 JD 改写简历。";
  files["scripts/helper.py"] = '# Internal implementation note: do not fabricate facts';
  assert.equal(auditSkillIRFiles(files).some((item) => item.includes("USER_PERMISSION_RUNTIME_CONFLICT")), false);

  files["references/content-policy.json"] = JSON.stringify({ policy: "不允许在信息缺失时新增具体经历" });
  assert.ok(auditSkillIRFiles(files).some((item) => item.includes("USER_PERMISSION_RUNTIME_CONFLICT")));

  delete files["references/content-policy.json"];
  files["evals/graders.json"] = JSON.stringify({ graders: [{ id: "grounding", rubric: "不能把未知写成已知，不能增加无来源断言" }] });
  assert.ok(auditSkillIRFiles(files).some((item) => item.includes("USER_PERMISSION_EVAL_CONFLICT")));

  files["evals/graders.json"] = JSON.stringify({ graders: [{ id: "grounding", rubric: "新增的量化内容不得因此扣分，也不得套用通用真实性禁令" }] });
  assert.equal(auditSkillIRFiles(files).some((item) => item.includes("USER_PERMISSION_EVAL_CONFLICT")), false);
});

test("generic input compiler models task specifications, source material, and promised examples", () => {
  const description = `---\nname: create-launch-plan\ndescription: "根据任务规范、原始材料和参考范本生成或检查发布方案"\n---\n\n## Workflow\n\nGenerate a plan.`;
  const inputs = deriveTaskInputContract({ idea: "根据任务规范整理发布方案", skillText: description, answers: { inputs: "任务规范；原始材料" }, capabilityInputs: ["任务规范与原始材料"] });
  assert.equal(inputs.find((item) => item.concept === "task-specification")?.required, true);
  assert.equal(inputs.find((item) => item.concept === "source-material")?.required, true);
  assert.equal(inputs.find((item) => item.concept === "reference-example")?.required, false);

  const closed = ensureSkillSemanticClosure({ skill: description, idea: "根据任务规范整理发布方案", answers: { inputs: "任务规范；原始材料" }, capabilityInputs: ["任务规范与原始材料"] });
  assert.match(closed, /## Input resolution contract/);
  assert.match(closed, /Never substitute user-owned source material/);
  assert.match(closed, /infer-and-label/);
  assert.doesNotMatch(closed, /\bJD\b|resume|简历/);
});

test("runtime decision criteria remain an optional modeled input instead of disappearing into workflow prose", () => {
  const inputs = deriveTaskInputContract({
    idea: "把客户访谈整理成需求清单，并按用户确认的规则排序",
    answers: {
      inputs: "Excel 或 CSV 文件；粘贴文本",
      workflow: "优先级规则由用户每次确认；规则缺失时先交付优先级待确认的草稿",
      "output-format": "Markdown 报告和 CSV 表格",
    },
    capabilityInputs: ["访谈笔记"],
  });
  const criteria = inputs.find((item) => item.concept === "decision-criteria");
  assert.equal(criteria?.required, false);
  assert.equal(criteria?.resolution.mode, "continue-without");
  assert.match(criteria?.name || "", /决策规则/);
  assert.match(criteria?.missingBehavior || "", /继续执行不依赖它的可逆步骤/);
  assert.match(criteria?.missingBehavior || "", /只暂停依赖该输入的最终化步骤/);
});

test("explicit grounded-inference permission becomes a generic conditional input branch", () => {
  const permission = "没有明确目标受众时，可以基于可追溯的行业知识建立临时受众假设，清楚标注推断和待确认项";
  const description = `---\nname: create-launch-plan\ndescription: "根据目标受众和现有产品资料制定发布方案"\n---\n\n## Goal\n\n生成可执行的产品发布方案。`;
  const inputs = deriveTaskInputContract({
    idea: "为新产品制定发布方案",
    skillText: description,
    answers: { inputs: "目标受众；现有产品资料", "missing-information": permission },
    capabilityInputs: ["目标受众与现有产品资料"],
    // A generator default must not override a directly confirmed user policy.
    missingBehavior: "缺少目标受众时先询问",
  });
  const target = inputs.find((item) => item.concept === "audience");
  const source = inputs.find((item) => item.concept === "source-material");
  assert.equal(target?.required, false);
  assert.equal(target?.resolution.mode, "infer-and-label");
  assert.equal(target?.resolution.authority, "user_explicit");
  assert.equal(source?.resolution.mode, "ask");
  assert.equal(source?.required, true);
  assert.match(target?.missingBehavior || "", /只能使用已声明来源/);
  assert.match(target?.missingBehavior || "", /只继续可逆步骤/);

  const closed = ensureSkillSemanticClosure({
    skill: description,
    idea: "为新产品制定发布方案",
    answers: { inputs: "目标受众；现有产品资料", "missing-information": permission },
    capabilityInputs: ["目标受众与现有产品资料"],
    missingBehavior: "缺少目标受众时先询问",
  });
  assert.match(closed, /Use an inferred substitute only when its input resolution mode is `infer-and-label`/);
  assert.match(closed, /label every provisional item/);
  assert.doesNotMatch(closed, /缺少 Required 输入时，只询问/);
});

test("the same substitution compiler works across planning, legal review, and data analysis", () => {
  const cases = [
    {
      idea: "规划一次家庭旅行",
      inputs: "旅行偏好；已确认日期",
      capabilityInputs: ["旅行偏好与已确认日期"],
      permission: "没有明确旅行偏好时，可以基于可追溯的专业资料建立临时偏好假设，并标注推断和待确认项",
      inferred: /旅行偏好/,
      protected: /已确认日期/,
    },
    {
      idea: "审查一份合作合同",
      inputs: "审查标准；合同原文",
      capabilityInputs: ["审查标准与合同原文"],
      permission: "没有明确审查标准时，可以基于可追溯的专业规则建立临时审查标准，并标注推断和待确认项",
      inferred: /审查标准/,
      protected: /合同原文/,
    },
    {
      idea: "分析实验数据中的异常",
      inputs: "异常判断标准；原始数据",
      capabilityInputs: ["异常判断标准与原始数据"],
      permission: "没有明确异常判断标准时，可以基于有来源的领域规则建立临时判断标准，并标注推断和待确认项",
      inferred: /异常判断标准/,
      protected: /原始数据/,
    },
  ];
  for (const fixture of cases) {
    const inputs = deriveTaskInputContract({
      idea: fixture.idea,
      answers: { inputs: fixture.inputs, "missing-information": fixture.permission },
      capabilityInputs: fixture.capabilityInputs,
      missingBehavior: "缺少必要输入时先询问",
    });
    const inferred = inputs.find((item) => fixture.inferred.test(item.name));
    const protectedInput = inputs.find((item) => item !== inferred && (fixture.protected.test(item.name) || item.concept === "source-material"));
    assert.equal(inferred?.resolution.mode, "infer-and-label", fixture.idea);
    assert.equal(inferred?.required, false, fixture.idea);
    assert.equal(protectedInput?.resolution.mode, "ask", fixture.idea);
    assert.equal(protectedInput?.required, true, fixture.idea);
  }
});

test("semantic validator accepts any inferred substitute only with an explicit grounded fallback", () => {
  const permission = "没有明确目标受众时，可以基于可追溯的行业知识建立临时受众假设，清楚标注推断和待确认项";
  const plan = fixturePlan();
  plan.outcomeModel.ultimateGoal = "根据现有产品资料生成面向目标受众的发布方案";
  plan.stateModel.missingBehavior = "缺少目标受众时先询问";
  plan.items[0].input = "目标受众与现有产品资料";
  plan.items[0].requirement = "根据受众与产品资料生成发布方案";
  const evalText = JSON.stringify({ evals: [{ id: "core-1", eval_family: "capability", capability_ids: ["core-resume"] }] });
  const ir = bindSkillIREvals(compileSkillIR({
    skillName: "create-launch-plan",
    idea: "为新产品制定发布方案",
    answers: { inputs: "目标受众；现有产品资料", "missing-information": permission, "trigger-language": "帮我制定产品发布方案" },
    plan,
    loop: { mode: "hybrid", goal: "交付产品发布方案", maxRounds: 3, stopConditions: ["核心检查通过"], escalationConditions: ["产品资料也缺失"], scopes: [] },
    requirements: [
      { id: "goal", requirement: "为新产品制定发布方案", provenance: "user_explicit", modality: "MUST", hard: true, source: "initial user goal" },
      { id: "missing-information", requirement: permission, provenance: "user_explicit", modality: "MUST", hard: true, source: "interview.missing-information" },
    ],
  }), evalText);
  const target = ir.inputs.find((item) => item.concept === "audience");
  assert.ok(target);
  assert.equal(ir.tasks[0].optionalInputIds.includes(target.id), true);
  const skill = ensureSkillSemanticClosure({
    skill: `---\nname: create-launch-plan\ndescription: "根据目标受众和现有产品资料制定发布方案"\n---\n\n## Goal\n\n生成可执行的产品发布方案。`,
    idea: ir.identity.intent,
    answers: { "missing-information": permission },
    capabilityInputs: ["目标受众与现有产品资料"],
    missingBehavior: target.missingBehavior,
  });
  const issues = auditSkillIRFiles({
    "SKILL.md": skill,
    "evals/skill-ir.json": JSON.stringify(ir),
    "evals/capability-manifest.json": JSON.stringify(projectCapabilityManifest(ir)),
    "evals/evals.json": evalText,
  });
  assert.equal(issues.some((item) => item.includes("INPUT_SUBSTITUTION_WITHOUT_AUTHORITY")), false);
  assert.equal(issues.some((item) => item.includes("INCOMPLETE_INPUT_RESOLUTION")), false);
});

test("semantic validator reports missing inputs and incomplete resolution without domain-specific rules", () => {
  const evalText = JSON.stringify({ evals: [{ id: "core-1", eval_family: "capability", capability_ids: ["core-resume"] }] });
  const broken = bindSkillIREvals(compile(), evalText);
  const removed = broken.inputs[0];
  broken.inputs = broken.inputs.slice(1);
  broken.tasks = broken.tasks.map((task) => ({ ...task, requiredInputIds: task.requiredInputIds.filter((id) => id !== removed.id) }));
  delete broken.inputs[0].resolution;
  const manifest = projectCapabilityManifest(broken);
  const issues = auditSkillIRFiles({
    "SKILL.md": `---\nname: task-skill\ndescription: "根据目标说明和用户材料完成任务并交付可检查结果"\n---\n\n## Workflow\n\nComplete the task.`,
    "evals/skill-ir.json": JSON.stringify(broken),
    "evals/capability-manifest.json": JSON.stringify(manifest),
    "evals/evals.json": evalText,
  });
  assert.ok(issues.some((item) => item.includes("INPUT_RESOLUTION_NOT_MODELED")));
  assert.equal(issues.some((item) => item.includes("TAILORING_WITHOUT_TARGET_SPEC")), false);
});

test("Semantic compiler catches a manifest projection that drifts from SkillIR", () => {
  const evalText = JSON.stringify({ evals: [{ id: "core-1", eval_family: "capability", capability_ids: ["core-resume"] }] });
  const ir = bindSkillIREvals(compile(), evalText);
  const manifest = projectCapabilityManifest(ir);
  manifest.capabilities = [];
  const issues = auditSkillIRFiles({
    "SKILL.md": "Use the core workflow.",
    "evals/skill-ir.json": JSON.stringify(ir),
    "evals/capability-manifest.json": JSON.stringify(manifest),
    "evals/evals.json": evalText,
  });
  assert.ok(issues.some((item) => /能力集合/.test(item)));
});

test("embedded host lookup keeps its own arguments, condition and result before semantic work", () => {
  const implementation = { path: "integrations/tool-contracts.json", layer: "runtime", status: "use-provided" };
  const core = { id: "core", kind: "llm", name: "Analysis", implementation: { ...implementation, path: "SKILL.md" } };
  const lookup = { id: "host-web-search", kind: "builtin-tool", name: "Source lookup", implementation,
    input: "specific query and date range", output: "source excerpts and URLs", fallback: "Ask for a source link",
    activationCondition: "an unresolved claim requires current external evidence" };
  const step = { id: "compose", role: "transform", action: "Use source evidence to prepare report", input: "provided records", output: "final report",
    requires: ["records"], produces: ["report"], mutates: [] };
  const projected = projectWorkflowRuntimeOperation(step, [core, lookup]);
  assert.ok(projected.indexOf("VERIFY_HOST") < projected.indexOf("REASON"));
  assert.match(projected, /Only when an unresolved claim requires current external evidence/);
  assert.match(projected, /call it with specific query and date range/);
  assert.match(projected, /before using source excerpts and URLs/);
  assert.match(projected, /Otherwise continue without calling this tool/);
  assert.doesNotMatch(projected, /call it with provided records/);
  const writer = { ...lookup, id: "host-file-workspace", name: "Save report", requirement: "Write output file", input: "saved content", output: "file path" };
  const withWriter = projectWorkflowRuntimeOperation(step, [core, writer]);
  assert.ok(withWriter.indexOf("REASON") < withWriter.indexOf("VERIFY_HOST"), "writes must not move before content generation");
  assert.doesNotMatch(withWriter, /Only when an unresolved claim/);
  const withMcp = projectWorkflowRuntimeOperation(step, [core, { ...lookup, kind: "mcp" }]);
  assert.doesNotMatch(withMcp, /Only when an unresolved claim/, "external MCP actions are not absorbed evidence helpers");
});

test("the production compiler contains no task-domain branches", async () => {
  const [skillIRSource, knowledgeSource, evidenceSource] = await Promise.all([
    readFile(new URL("../app/skill-ir.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/knowledge-research.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/evidence-gates.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(skillIRSource, /isResumeTailoringContract|tailoringWorkflowCoverage|JD tailoring workflow|TAILORING_WITHOUT_TARGET_SPEC|target-spec|current-resume/);
  assert.doesNotMatch(knowledgeSource, /resumeDimensions|genericResumeAdvice/);
  assert.doesNotMatch(evidenceSource, /if\s*\(\/.*(?:小红书|简历|旅行).*\/i\.test\(idea\)\)/);
});

test("knowledge permission reconciliation receives canonical answer records, not typed evidence arrays", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /reconcileKnowledgePackContentPermission\([^\n]+, interviewEvidence\)/);
  assert.match(page, /reconcileKnowledgePackContentPermission\(normalizeKnowledgePack\([^\n]+, demoAnswers\)/);
});
