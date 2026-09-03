import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCapabilityDelta } from "../app/capability-delta.ts";

test("capability delta rejects generic quality filler and preserves behavior-changing gaps", () => {
  const delta = normalizeCapabilityDelta({
    bareModelCan: ["总结和改写普通文本"],
    skillMustTeach: [
      { taskDecision: "写得更专业", requiredSkillBehavior: "专业", whySkillIsNeeded: "更好" },
      {
        id: "extract-before-rewrite",
        taskDecision: "简历改写前的事实抽取",
        bareModelBehavior: "可能边读边改写，丢失来源边界",
        requiredSkillBehavior: "先产生结构化事实记录，再允许改写步骤读取该记录",
        whySkillIsNeeded: "避免未抽取的字段被后续步骤推断为事实",
        researchQuestions: ["事实抽取完成后应如何验证字段来源"],
      },
    ],
  });

  assert.equal(delta.status, "ready");
  assert.equal(delta.skillMustTeach.length, 1);
  assert.equal(delta.skillMustTeach[0].id, "extract-before-rewrite");
  assert.deepEqual(delta.researchFocus, ["事实抽取完成后应如何验证字段来源"]);
});

test("capability delta rejects a workflow restatement that adds no decision rule", () => {
  const delta = normalizeCapabilityDelta({
    skillMustTeach: [
      {
        id: "extract-keywords",
        taskDecision: "从输入中提取关键词并输出列表",
        bareModelBehavior: "裸模型可能提取关键词，但可能遗漏细节",
        requiredSkillBehavior: "必须系统提取关键词并输出结构化列表",
        whySkillIsNeeded: "确保提取全面，为后续处理提供依据",
        researchQuestions: ["有哪些关键词"],
      },
      {
        id: "source-boundary",
        taskDecision: "补写候选事实前判断它是否有可追溯来源",
        bareModelBehavior: "裸模型可能把合理推断直接写成用户事实",
        requiredSkillBehavior: "有来源时才写成事实；否则标记为候选或待确认，不得混入最终事实层",
        whySkillIsNeeded: "避免无来源内容被误写成真实经历且无法追溯",
        researchQuestions: ["如何验证候选事实的来源"],
      },
    ],
  });

  assert.equal(delta.status, "ready");
  assert.deepEqual(delta.skillMustTeach.map((item) => item.id), ["source-boundary"]);
});

test("rejected gaps cannot retain a misleading ready summary or research scope", () => {
  const delta = normalizeCapabilityDelta({
    status: "ready",
    summary: "已经找到关键差值",
    researchFocus: ["搜索更多通用最佳实践"],
    skillMustTeach: [{
      id: "ordinary-workflow",
      taskDecision: "读取输入并输出结果",
      bareModelBehavior: "裸模型可以读取输入",
      requiredSkillBehavior: "读取输入并输出结果",
      whySkillIsNeeded: "确保结果完整",
    }],
  });

  assert.equal(delta.status, "insufficient");
  assert.deepEqual(delta.skillMustTeach, []);
  assert.deepEqual(delta.researchFocus, []);
  assert.match(delta.summary, /尚未识别出可证明的能力差值/);
});
