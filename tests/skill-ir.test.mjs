import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  auditSkillIRFiles,
  bindSkillIREvals,
  compileSkillIR,
  deriveTaskInputContract,
  ensureSkillSemanticClosure,
  projectCapabilityManifest,
  projectCapabilityRuntimeOperation,
  projectEvalBank,
  projectSkillMarkdown,
  projectToolContracts,
} from "../app/skill-ir.ts";
import {
  applySkillIRMutations,
  normalizeCanonicalMutations,
  semanticSkillIRDigest,
  validateCanonicalSkillIR,
} from "../app/canonical-mutations.ts";
import { countDuplicateAuthorRuntimeRules, hasExecutableWorkflowHeading } from "../app/gate-rules.ts";

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
  assert.equal(validateCanonicalSkillIR(candidate).valid, true);
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
  assert.match(required[0].name, /任选一种/);
  assert.match(required[0].name, /纯文本粘贴/);
  assert.match(required[0].name, /Excel\/CSV/);
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
    { id: "core-1", eval_family: "capability", capability_ids: ["core-resume"] },
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
