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
