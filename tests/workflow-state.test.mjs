import assert from "node:assert/strict";
import test from "node:test";

import {
  REQUIREMENT_DIMENSIONS,
  canNavigateToWorkflowStep,
  normalizeWorkflowStep,
  reconcileBlueprintProvenance,
  summarizeRequirementCoverage,
} from "../app/workflow-state.ts";

test("workflow navigation is centralized and cannot skip unfinished stages", () => {
  assert.equal(normalizeWorkflowStep("evaluate"), "evaluate");
  assert.equal(normalizeWorkflowStep("unknown"), null);
  const completed = new Set(["brief", "interview"]);
  assert.equal(canNavigateToWorkflowStep("blueprint", "interview", completed), true);
  assert.equal(canNavigateToWorkflowStep("build", "interview", completed), false);
});

test("task variability replaces cancelled frequency without inflating the 16-dimension interview counter", () => {
  const result = summarizeRequirementCoverage([
    { dimension: "使用场景", answer: "每周使用" },
    { dimension: "任务变化", answer: "目标相同，但输入经常变化" },
    { dimension: "使用频率", answer: "每天使用" },
    { dimension: "理解预演", answer: "示例输出" },
    { dimension: "预演反馈", answer: "不够具体" },
    { dimension: "风险项", answer: "不确定" },
  ]);
  assert.equal(result.coveredCount, 2);
  assert.equal(result.uncertainCount, 0);
  assert.equal(REQUIREMENT_DIMENSIONS.length, 16);
  assert.equal(REQUIREMENT_DIMENSIONS.includes("任务变化"), true);
  assert.equal(REQUIREMENT_DIMENSIONS.includes("使用频率"), false);
});

test("blueprint cannot call an explicitly requested risk item unconfirmed", () => {
  const sections = reconcileBlueprintProvenance([
    { content: "输出需要截止时间和风险项。待确认：用户未明确是否需要风险项。", status: "attention" },
  ], "我需要项目计划，输出截止时间、负责人和风险项");
  assert.match(sections[0].content, /风险项已由用户明确提出/);
  assert.doesNotMatch(sections[0].content, /未明确是否需要风险项/);
});

test("mentioning required fields never fabricates their values or erases missing-data rules", () => {
  const content = "不确定的负责人和时间标待确认，不自己猜。负责人未明确时，必须标待确认。记录中未提供负责人，不得补写。待确认：会议时间。";
  const sections = [{ content, status: "ready" }];
  assert.deepEqual(reconcileBlueprintProvenance(sections, "待办清单包含负责人和时间。缺失信息标待确认。"), sections);
});

test("source uncertainty, conditional evaluation criteria and negation survive provenance reconciliation", () => {
  const sections = [{ content: "【失败测试】负责人不确定时，必须标待确认。用户未明确负责人。风险项仍待确认；已选择标记风险项，不代表已核实风险。" }];
  assert.deepEqual(reconcileBlueprintProvenance(sections, "输出负责人和风险项。负责人不确定时先问我。"), sections);
  assert.deepEqual(reconcileBlueprintProvenance(sections, "输出负责人和风险项。"), sections);
});
