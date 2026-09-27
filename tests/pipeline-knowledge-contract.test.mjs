import assert from "node:assert/strict";
import test from "node:test";

import { validateBundleContentCoherence } from "../app/bundle-validator.ts";
import { compileSkillIR, projectSkillIRFiles } from "../app/skill-ir.ts";
import {
  createNotRequiredKnowledgePack,
  knowledgeAssessmentFromPack,
} from "../app/knowledge-runtime.ts";
import { capabilities } from "./fixtures/blueprint.mjs";

const contractOnlyDelta = {
  status: "ready",
  summary: "周报助手必须等待用户确认",
  bareModelCan: ["整理用户提供的零散记录"],
  skillMustTeach: [{
    id: "weekly-report-confirmation",
    taskDecision: "先归类并展示草稿，只有用户确认后才生成正式周报",
    bareModelBehavior: "裸模型可能把未确认的分类直接当作最终周报",
    requiredSkillBehavior: "未收到真实用户确认时必须停止，不得自动确认或继续交付",
    whySkillIsNeeded: "避免错误分类或未经确认的内容被当成正式汇报提交",
    knowledgeNeed: "contract-only",
    researchQuestions: [],
  }],
  excludedGenericKnowledge: [],
  researchFocus: [],
};

const externalDelta = {
  ...contractOnlyDelta,
  summary: "周报分类还需要任务领域判据",
  skillMustTeach: [{
    id: "weekly-report-classification",
    taskDecision: "当同一条记录同时像进展与风险时，依据项目状态判据选择主分类",
    bareModelBehavior: "裸模型可能按关键词误判，混淆已发生结果和潜在影响",
    requiredSkillBehavior: "先区分已发生变化、潜在影响和后续动作，再映射到周报栏目",
    whySkillIsNeeded: "避免同一事实进入错误栏目并造成主管误判项目状态",
    knowledgeNeed: "external",
    researchQuestions: ["项目状态报告如何区分进展、风险与计划动作"],
  }],
  researchFocus: ["项目状态报告如何区分进展、风险与计划动作"],
};

function compileWeeklyReport(delta, assessment) {
  return compileSkillIR({
    skillName: "weekly-report-assistant",
    idea: "我要做一个每周汇报助手",
    answers: {
      inputs: "用户粘贴一周的零散工作记录",
      "trigger-language": "帮我整理本周周报",
      "evidence-policy": "只能改写用户提供的事实，不得新增结论",
    },
    plan: structuredClone(capabilities.capabilityPlan),
    loop: {
      mode: "hybrid",
      goal: "交付基于真实记录的每周汇报",
      maxRounds: 2,
      stopConditions: ["用户确认分类且事实检查通过"],
      escalationConditions: ["缺少完成周报所需的事实"],
      scopes: [],
    },
    requirements: [{
      id: "weekly-report-goal",
      requirement: "把用户提供的零散记录整理成每周汇报",
      provenance: "user_explicit",
      modality: "MUST",
      hard: true,
      source: "initial user goal",
    }],
    capabilityDelta: delta,
    knowledgeAssessment: assessment,
  });
}

test("weekly-report replay keeps contract-only knowledge consistent through compiler, projection and gate", () => {
  const pack = createNotRequiredKnowledgePack(contractOnlyDelta, "2026-09-27T00:00:00.000Z");
  const ir = compileWeeklyReport(contractOnlyDelta, knowledgeAssessmentFromPack(contractOnlyDelta, pack));
  const files = projectSkillIRFiles(ir);
  const persisted = JSON.parse(files["evals/skill-ir.json"]);

  assert.equal(persisted.knowledgeAssessment.status, "not-required");
  assert.equal(
    validateBundleContentCoherence(files).some((issue) => issue.code === "KNOWLEDGE_REQUIREMENT_BYPASSED"),
    false,
  );
});

test("weekly-report replay cannot turn an external gap into not-required between stages", () => {
  const assessment = knowledgeAssessmentFromPack(externalDelta, {
    sufficiency: "not-required",
    categoryCoverage: { covered: [], missing: [], score: 100 },
  });
  const ir = compileWeeklyReport(externalDelta, assessment);
  const files = projectSkillIRFiles(ir);
  const persisted = JSON.parse(files["evals/skill-ir.json"]);

  assert.equal(persisted.knowledgeAssessment.status, "insufficient");
  assert.deepEqual(persisted.knowledgeAssessment.missingGapIds, ["weekly-report-classification"]);
  assert.equal(
    validateBundleContentCoherence(files).some((issue) => issue.code === "KNOWLEDGE_REQUIREMENT_BYPASSED"),
    false,
  );
});
