import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInformationDependencies,
  buildRequirementProvenance,
  contentGroundingRubric,
  contentPolicyEvalExpectations,
  downgradeUngroundedHardConstraints,
  deriveDomainEvidence,
  finalMinimalityPass,
  hasContentPermissionConflict,
  hardNegativePrompts,
  reconcileContentPermissionText,
  realisticFailureFixtures,
  reconcileValidationVisibility,
  resolveContentPermission,
  semanticGateAudit,
} from "../app/evidence-gates.ts";

test("generic no-fabrication prose is removed without deleting the user's actual goal", () => {
  const permission = resolveContentPermission({ "evidence-policy": "可以随意润色扩写增加经历，帮我更厉害就行" });
  const original = "Transform the resume for AI PM roles, but no fabricated facts or data.\n- Do not fabricate specific numbers or experience.\n- Preserve the user's preferred concise style.";
  const reconciled = reconcileContentPermissionText(original, permission);
  assert.match(reconciled, /Transform the resume for AI PM roles/);
  assert.match(reconciled, /preferred concise style/);
  assert.doesNotMatch(reconciled, /fabricat/i);
});

test("permission reconciliation removes broad Chinese and English restriction variants", () => {
  const permission = resolveContentPermission({ "evidence-policy": "可以随意润色扩写增加经历，帮我更厉害就行" });
  const original = [
    "- 保持结构清楚，但不允许在没有依据时新增具体经历。",
    "- Must not invent numbers when details are missing.",
    "- 保持用户喜欢的简洁表达。",
  ].join("\n");
  assert.equal(hasContentPermissionConflict(original, permission), true);
  const reconciled = reconcileContentPermissionText(original, permission);
  assert.doesNotMatch(reconciled, /不允许.*新增|must\s+not\s+invent/i);
  assert.match(reconciled, /保持结构清楚/);
  assert.match(reconciled, /保持用户喜欢的简洁表达/);
  assert.equal(hasContentPermissionConflict(reconciled, permission), false);
});

test("permission conflict detection covers failure modes, grounding rubrics, and domain rules", () => {
  const permission = resolveContentPermission({ "evidence-policy": "可以随意润色扩写增加经历，也可以补充量化数据" });
  for (const conflict of [
    "编造量化数据",
    "不能把未知写成已知，也不能增加无来源断言",
    "若无法估算或对比，则省略量化并避免编造",
  ]) {
    assert.equal(hasContentPermissionConflict(conflict, permission), true, conflict);
  }
  assert.equal(hasContentPermissionConflict("新增的量化内容不得因此扣分，也不得套用通用真实性禁令", permission), false);
});

test("creative content permission never authorizes fake citations or tool receipts", () => {
  const permission = resolveContentPermission({ "evidence-policy": "基于行业惯例和公开数据合理补全，并注明假设" });
  assert.equal(permission.allowFactualCreation, true);
  assert.equal(hasContentPermissionConflict("不得伪造引用、来源链接或工具调用回执", permission), false);
  const dependencies = buildInformationDependencies({
    fields: ["战略建议", "来源链接"],
    availableInputs: "竞品列表",
    sourceEvidence: "",
    allowCreativeExpansion: permission.allowCreativeExpansion,
    allowFactualCreation: permission.allowFactualCreation,
    explicitRestriction: permission.explicitRestriction,
    missingBehavior: "按已确认策略处理",
  });
  assert.equal(dependencies.find((item) => item.field === "战略建议")?.inventable, true);
  assert.equal(dependencies.find((item) => item.field === "来源链接")?.inventable, false);
  assert.match(dependencies.find((item) => item.field === "来源链接")?.missing_behavior || "", /实际返回|虚假引用/);
});

test("a positive authorization rubric is not misread as a no-creation rule", () => {
  const permission = resolveContentPermission({
    "evidence-policy": "基于行业惯例和公开数据合理补全，并注明假设",
  });
  const rubric = "只检查输出是否保留用户明确要求固定不变的输入，并落实用户已经授权的补写、新增、估算或创作范围。对授权新生成的量化、经历或内容，按任务相关性与结果可用性评分，不按来源有无扣分。";
  assert.equal(permission.allowFactualCreation, true);
  assert.equal(hasContentPermissionConflict(rubric, permission), false);
});

test("natural permission wording can authorize generated facts and quantities", () => {
  const permission = resolveContentPermission({
    "evidence-policy": "允许扩写、生成事实、补写经历和量化数据",
  });
  assert.equal(permission.allowCreativeExpansion, true);
  assert.equal(permission.allowFactualCreation, true);
  assert.equal(permission.explicitRestriction, false);
  const grounding = contentGroundingRubric(permission);
  assert.match(grounding, /授权新生成/);
  assert.doesNotMatch(grounding, /未知信息处理|来源与事实限制/);
  assert.doesNotMatch(reconcileContentPermissionText("未知不能变成已知；无法估算就省略量化。", permission), /未知不能变成已知|无法估算就省略/);
});

test("colloquial creation permission in the initial goal is compiled as explicit authority", () => {
  const permission = resolveContentPermission({
    __idea: "我要一个能够根据JD和我的简历base帮我大编新经历，从而完全符合对应岗位要求的skill",
  });
  assert.equal(permission.allowCreativeExpansion, true);
  assert.equal(permission.allowFactualCreation, true);
  assert.equal(permission.explicitRestriction, false);
  assert.deepEqual(permission.sourceKeys, ["__idea"]);
});

test("negative permission wording still overrides flexible creation wording", () => {
  const permission = resolveContentPermission({
    "evidence-policy": "可以扩写，但不允许生成事实和量化数据",
  });
  assert.equal(permission.allowCreativeExpansion, false);
  assert.equal(permission.allowFactualCreation, false);
  assert.equal(permission.explicitRestriction, true);
});

test("domain evidence is projected from structured knowledge atoms rather than markdown headings", () => {
  const evidence = deriveDomainEvidence(JSON.stringify({ knowledge_checks: [{
    id: "rule-1",
    title: "分层判断",
    type: "decision_rule",
    knowledge: "先按证据强度分层",
    applies_when: "存在多个相互冲突的来源时",
    observable_behavior: "将结论分成已证实、推断和未知三层",
    exception: "没有来源时保留未知",
    source_urls: ["https://example.com/guide"],
    confidence: 0.82,
  }] }), "", "");
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].rule, "将结论分成已证实、推断和未知三层");
  assert.equal(evidence[0].evidence_type, "evidence_backed_practice");
  assert.equal(evidence.some((item) => /^来源账本|^使用方式/.test(item.rule)), false);
});

test("an owner-authored conservative grounding boundary remains authoritative", () => {
  const permission = resolveContentPermission({ "evidence-policy": "无法核实的数据要避免编造，未知不能写成已知" });
  assert.equal(permission.explicitRestriction, true);
  assert.equal(hasContentPermissionConflict("若无法估算则省略量化并避免编造", permission), false);
});

test("grounding grader and content-policy eval are projections of the same permission", () => {
  const permissive = resolveContentPermission({ "evidence-policy": "可以自由补充量化数据和经历" });
  assert.match(contentGroundingRubric(permissive), /授权新生成的量化、经历或内容/);
  assert.doesNotMatch(contentGroundingRubric(permissive), /把未知写成已知|增加无来源断言|避免编造/);
  assert.ok(contentPolicyEvalExpectations(permissive).behaviors.some((item) => item.includes("补写、新增或估算")));

  const restrictive = resolveContentPermission({ "evidence-policy": "只润色表达，未知信息不要补写" });
  assert.match(contentGroundingRubric(restrictive), /用户明确提出的来源与事实限制/);
  assert.ok(contentPolicyEvalExpectations(restrictive).must_not.some((item) => item.includes("扩大内容生成范围")));
});

test("generator defaults cannot silently become hard constraints", () => {
  const skill = "## Workflow\n\n- 所有标题必须包含数字、悬念和情感词。\n- 用户明确要求：正文只能使用第一人称。";
  const result = downgradeUngroundedHardConstraints(skill, "用户明确要求：正文只能使用第一人称");
  assert.match(result, /所有标题应优先包含数字/);
  assert.match(result, /正文只能使用第一人称/);
});

test("requirements carry provenance and generator proposals stay soft", () => {
  const records = buildRequirementProvenance({
    idea: "帮我写小红书",
    answers: { "good-example": "先给标题再给正文" },
    sourceEvidence: "",
    capabilityRequirements: [{ id: "domain", requirement: "所有标题都必须包含数字", kind: "reference" }],
  });
  assert.equal(records.find((item) => item.id === "goal")?.provenance, "user_explicit");
  assert.equal(records.find((item) => item.id === "answer-good-example")?.provenance, "user_example");
  assert.deepEqual(records.find((item) => item.id === "capability-domain"), {
    id: "capability-domain",
    requirement: "所有标题都必须包含数字",
    provenance: "generator_default",
    modality: "MAY",
    hard: false,
    source: "generator capability proposal",
  });
});

test("information dependencies only prohibit factual creation when the user explicitly asked for that restriction", () => {
  const dependencies = buildInformationDependencies({ fields: ["店名", "正文"], availableInputs: "毛肚不错，人很多", sourceEvidence: "", allowCreativeExpansion: true, explicitRestriction: true, missingBehavior: "合理扩写" });
  const store = dependencies.find((item) => item.field === "店名");
  assert.equal(store?.inventable, false);
  assert.equal(store?.source_available, false);
  assert.match(store?.missing_behavior || "", /不生成具体值|待确认/);
});

test("unspecified content policy does not become a generator-authored no-fabrication constraint", () => {
  const dependencies = buildInformationDependencies({ fields: ["店名", "正文"], availableInputs: "毛肚不错", sourceEvidence: "", allowCreativeExpansion: false, explicitRestriction: false, missingBehavior: "按任务处理" });
  assert.equal(dependencies.find((item) => item.field === "店名")?.inventable, true);
  assert.doesNotMatch(dependencies.find((item) => item.field === "店名")?.missing_behavior || "", /不生成具体值/);
});

test("explicit permission to create factual resume content is not silently compiled as inventable false", () => {
  const dependencies = buildInformationDependencies({
    fields: ["新增经历", "业绩数字"],
    availableInputs: "现有简历",
    sourceEvidence: "",
    allowCreativeExpansion: true,
    allowFactualCreation: true,
    explicitRestriction: false,
    missingBehavior: "按用户要求继续",
  });
  assert.ok(dependencies.every((item) => item.inventable === true));
  assert.ok(dependencies.every((item) => /用户明确/.test(item.missing_behavior)));
});

test("content permission uses one resolver even when explicit creation permission comes from another interview answer", () => {
  const permission = resolveContentPermission({
    "evidence-policy": "可以合理扩写和重组；信息不足时先问我或标注",
    "real-task": "针对不同 JD 可以增加经历和业绩内容，让简历更有竞争力",
  });
  assert.equal(permission.allowCreativeExpansion, true);
  assert.equal(permission.allowFactualCreation, true);
  assert.ok(permission.sourceKeys.includes("real-task"));
  const dependencies = buildInformationDependencies({
    fields: ["新增经历", "业绩数字"],
    availableInputs: "现有简历与 JD",
    sourceEvidence: "",
    allowCreativeExpansion: permission.allowCreativeExpansion,
    allowFactualCreation: permission.allowFactualCreation,
    explicitRestriction: permission.explicitRestriction,
    missingBehavior: "按确认范围处理",
  });
  assert.ok(dependencies.every((item) => item.inventable));
});

test("the dedicated conservative policy remains authoritative over incidental expansion wording", () => {
  const permission = resolveContentPermission({
    "evidence-policy": "只调整表达，不新增内容",
    outcome: "让内容更完整",
  });
  assert.equal(permission.explicitRestriction, true);
  assert.equal(permission.allowCreativeExpansion, false);
  assert.equal(permission.allowFactualCreation, false);
});

test("generic eval synthesis stays permission-neutral unless the user explicitly restricts factual creation", () => {
  for (const idea of ["帮我写小红书", "为新产品制定发布方案", "分析一份实验数据"]) {
    const fixtures = realisticFailureFixtures(idea);
    assert.match(fixtures[0].prompt, new RegExp(idea));
    assert.ok(fixtures[0].observable_success.some((item) => item.includes("任务目标")));
    assert.ok(fixtures[0].must_not.some((item) => item.includes("禁止补写")));
    const negatives = hardNegativePrompts(idea);
    assert.equal(negatives.length, 4);
    assert.ok(negatives.some((item) => /只做方法分析|指出问题但不要重做|只提取/.test(item)));
    assert.equal(negatives.some((item) => /相邻任务|Complete the task/i.test(item)), false);
  }
  const restricted = realisticFailureFixtures("写成品", { explicitRestriction: true });
  assert.ok(restricted[0].must_not.some((item) => item.includes("虚构")));
});

test("validation remains internal unless it changes the usable result", () => {
  const skill = "## Workflow\n\n1. 生成正文。\n2. 将草稿和自检标注交付给用户。\n自检：给成品打分。";
  const result = reconcileValidationVisibility(skill, "用户需要正文");
  assert.doesNotMatch(result, /^自检：/m);
  assert.match(result, /只有检查失败会影响使用时才说明问题/);
});

test("semantic compiler blocks manifest, artifact, grader, and provenance contradictions", () => {
  const files = {
    "SKILL.md": "## Goal\n\n写内容",
    "evals/capability-manifest.json": JSON.stringify({
      summary: "包含 script capability 和 asset capability",
      output_contract: { mode: "mixed", artifactPatterns: ["outputs/*.pdf"] },
      capabilities: [{ id: "core", kind: "llm", status: "generate" }],
      requirement_provenance: [{ id: "hard-default", hard: true, provenance: "generator_default" }],
      information_dependencies: [],
      scope_provenance: [],
    }),
    "evals/evals.json": JSON.stringify({ evals: [{ id: "artifact-case", expected: { artifacts: ["outputs/*.pdf"] }, graders: ["core_capability"] }] }),
  };
  const issues = semanticGateAudit(files);
  assert.ok(issues.some((item) => /脚本/.test(item)));
  assert.ok(issues.some((item) => /资产/.test(item)));
  assert.ok(issues.some((item) => /不存在真实文件产出能力/.test(item)));
  assert.ok(issues.some((item) => /没有绑定 artifact_checker/.test(item)));
  assert.ok(issues.some((item) => /来源不足/.test(item)));
});

test("final minimality pass removes orphan resources and empty integrations", () => {
  const files = {
    "SKILL.md": "skill",
    "scripts/fake.py": "print('decorative')",
    "assets/fake.txt": "decorative",
    "integrations/tool-contracts.json": "{\"tools\":[]}",
    "evals/capability-manifest.json": JSON.stringify({ capabilities: [{ id: "core", kind: "llm", status: "generate", necessity: { decision: "include" } }] }),
  };
  const result = finalMinimalityPass(files);
  assert.deepEqual(result.deletedPaths.sort(), ["assets/fake.txt", "integrations/tool-contracts.json", "scripts/fake.py"]);
});
