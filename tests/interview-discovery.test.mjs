import assert from "node:assert/strict";
import test from "node:test";
import { goalNeedsTaskDiscovery, pickRecommendedInterviewOption } from "../app/interview-discovery.ts";

test("generic assistant goals stay unconfirmed until a concrete task is chosen", () => {
  for (const goal of ["帮我做一个更好的工作助手", "想提高工作效率", "Build me a better assistant"]) {
    assert.equal(goalNeedsTaskDiscovery(goal), true, goal);
  }
});

test("concrete domains, inputs, actions, and deliverables can receive a recommendation", () => {
  for (const goal of ["把零散记录整理成周报", "审查 SaaS 合同", "排下周计划", "Analyze invoices", "翻译英文文章"]) {
    assert.equal(goalNeedsTaskDiscovery(goal), false, goal);
  }
});

test("AI recommendations always prefer a concrete working answer over the uncertainty escape hatch", () => {
  const options = ["先给一版可编辑草稿", "先连续追问", "我不确定，请 AI 帮我判断"];
  assert.equal(pickRecommendedInterviewOption(options, options[0], "", options[2]), options[0]);
  assert.equal(pickRecommendedInterviewOption(options, options[2], "", options[2]), options[0]);
  assert.equal(pickRecommendedInterviewOption(options, undefined, "", options[2]), options[0]);
});

test("a prior rejection skips the conflicting recommendation without falling back to uncertainty", () => {
  const unsure = "我不确定，请 AI 帮我判断";
  const options = ["先连续追问再产出", "先给一版草稿再修改", unsure];
  assert.equal(
    pickRecommendedInterviewOption(options, options[0], "我不要先连续追问再产出", unsure),
    options[1],
  );
});
