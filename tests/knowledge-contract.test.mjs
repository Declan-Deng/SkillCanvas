import assert from "node:assert/strict";
import test from "node:test";

import {
  knowledgeRequirementBypassReason,
  knowledgeRequirementPolicy,
  normalizeKnowledgeAssessmentForDelta,
} from "../app/knowledge-contract.ts";
import {
  createNotRequiredKnowledgePack,
  knowledgeAssessmentFromPack,
  prepareKnowledgeRuntime,
  reconcileKnowledgePackWithCapabilityDelta,
} from "../app/knowledge-runtime.ts";

const contractOnlyDelta = {
  status: "ready",
  summary: "用户确认的停顿契约",
  bareModelCan: [],
  skillMustTeach: [{
    id: "wait-for-confirmation",
    taskDecision: "先交付草稿，再等待真实用户确认后继续修改",
    bareModelBehavior: "裸模型可能把尚未确认的草稿直接当作最终版本",
    requiredSkillBehavior: "没有真实用户回复时必须停止，不得自动确认或继续修改",
    whySkillIsNeeded: "避免把用户尚未确认的内容错误提交为最终结果",
    knowledgeNeed: "contract-only",
    researchQuestions: [],
  }],
  excludedGenericKnowledge: [],
  researchFocus: [],
};

const externalDelta = {
  ...contractOnlyDelta,
  summary: "周报分类需要任务特定判断",
  skillMustTeach: [{
    id: "weekly-status-classification",
    taskDecision: "当零散记录同时像进展与风险时，依据专业判据选择主分类",
    bareModelBehavior: "裸模型可能按关键词误判，混淆已发生结果与潜在影响",
    requiredSkillBehavior: "先区分已发生变化、潜在影响和计划动作，再映射到周报栏目",
    whySkillIsNeeded: "避免同一事实进入错误栏目并造成主管误判项目状态",
    knowledgeNeed: "external",
    researchQuestions: ["专业项目状态报告如何区分进展、风险和计划动作"],
  }],
  researchFocus: ["专业项目状态报告如何区分进展、风险和计划动作"],
};

test("one policy owns contract-only versus external knowledge semantics", () => {
  const contractPolicy = knowledgeRequirementPolicy(contractOnlyDelta);
  assert.equal(contractPolicy.required, false);
  assert.deepEqual(contractPolicy.requiredGapIds, []);
  assert.equal(knowledgeRequirementBypassReason(contractOnlyDelta, { status: "not-required" }), "");
  assert.equal(normalizeKnowledgeAssessmentForDelta(undefined, [], contractOnlyDelta).status, "not-required");

  const externalPolicy = knowledgeRequirementPolicy(externalDelta);
  assert.equal(externalPolicy.required, true);
  assert.deepEqual(externalPolicy.requiredGapIds, ["weekly-status-classification"]);
  assert.match(knowledgeRequirementBypassReason(externalDelta, { status: "not-required" }), /external/);
  assert.equal(normalizeKnowledgeAssessmentForDelta(undefined, [], externalDelta).status, "insufficient");
});

test("runtime cannot create a not-required pack when external gaps exist", () => {
  const contractPack = createNotRequiredKnowledgePack(contractOnlyDelta, "2026-09-27T00:00:00.000Z");
  assert.equal(contractPack.sufficiency, "not-required");
  assert.equal(contractPack.status, "not-needed");
  assert.throws(() => createNotRequiredKnowledgePack(externalDelta), /不能被标记为 not-required/);

  const prepared = prepareKnowledgeRuntime(externalDelta);
  assert.equal(prepared.policy.required, true);
  assert.deepEqual(prepared.researchDelta.skillMustTeach.map((gap) => gap.id), ["weekly-status-classification"]);
  const assessment = knowledgeAssessmentFromPack(externalDelta, {
    sufficiency: "not-required",
    categoryCoverage: { covered: [], missing: [], score: 100 },
  });
  assert.equal(assessment.status, "insufficient");
  assert.deepEqual(assessment.missingGapIds, ["weekly-status-classification"]);
});

test("cached knowledge state is migrated instead of trusting stale labels", () => {
  const stale = createNotRequiredKnowledgePack(contractOnlyDelta, "2026-09-27T00:00:00.000Z");
  const migratedExternal = reconcileKnowledgePackWithCapabilityDelta(stale, externalDelta);
  assert.equal(migratedExternal.plan.required, true);
  assert.equal(migratedExternal.status, "unavailable");
  assert.equal(migratedExternal.sufficiency, "insufficient");
  assert.deepEqual(migratedExternal.plan.capabilityDeltaGapIds, ["weekly-status-classification"]);

  const staleInsufficient = { ...migratedExternal, generatedAt: "2026-09-27T00:00:01.000Z" };
  const migratedContractOnly = reconcileKnowledgePackWithCapabilityDelta(staleInsufficient, contractOnlyDelta);
  assert.equal(migratedContractOnly.status, "not-needed");
  assert.equal(migratedContractOnly.sufficiency, "not-required");
  assert.equal(migratedContractOnly.generatedAt, staleInsufficient.generatedAt);
});
