import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeDiscoveryPreview,
  normalizeInterviewReadiness,
  markUnsupportedPreviewMetrics,
  optionConflictsWithPriorEvidence,
  previewFeedbackEvidence,
} from "../app/discovery-preview.ts";

test("a rejected earlier choice cannot be silently recommended again", () => {
  const evidence = "看完预演，哪里还不够懂你：优先级规则不对，我想要的不是简单的高中低；CSV 应该增加来源客户列";
  assert.equal(optionConflictsWithPriorEvidence("优先级规则（如高、中、低）", evidence), true);
  assert.equal(optionConflictsWithPriorEvidence("报告格式（Markdown 和 CSV 的列结构）", evidence), false);
});

test("discovery preview requires concrete output and selectable feedback", () => {
    assert.equal(normalizeDiscoveryPreview({ output: "too short" }), null);
    const preview = normalizeDiscoveryPreview({
      title: "简历优化预演",
      scenario: "根据当前一句话做一次预演",
      userPrompt: "根据这份 JD 调整我的项目经历",
      sampleInput: "JD：负责模型评测；经历：搭建过离线评测集",
      output: "先提取岗位能力，再将已有项目证据按相关度排序，并标出仍需补充的信息。",
      learned: ["需要围绕 JD 定制", "结果需要直接可用"],
      uncertainties: ["还没有目标 JD"],
      feedbackOptions: ["没有体现我的风格", "没有先分析 JD", "改写得不够具体"],
    });
    assert.equal(preview.title, "简历优化预演");
    assert.match(preview.sampleInput, /模型评测/);
    assert.equal(preview.feedbackOptions.length, 3);
});

test("preview marks concrete metrics that were not present in its visible input", () => {
  assert.equal(
    markUnsupportedPreviewMetrics("上线后转化率提升15%，覆盖3万人", "优化这段经历"),
    "上线后转化率提升[待确认：量化结果]，覆盖[待确认：量化结果]",
  );
  assert.equal(markUnsupportedPreviewMetrics("已有3年经验", "我有3年经验"), "已有3年经验");
});

test("readiness cannot finish early with low confidence or multiple critical gaps", () => {
    assert.equal(normalizeInterviewReadiness({ confidence: 90, canFinish: true, criticalGaps: ["目标输入", "输出形式"] }).canFinish, false);
    assert.equal(normalizeInterviewReadiness({ confidence: 78, canFinish: true, criticalGaps: [] }).canFinish, false);
    assert.equal(normalizeInterviewReadiness({ confidence: 88, canFinish: true, criticalGaps: ["协作边界"] }).canFinish, true);
});

test("preview feedback becomes explicit evidence for later compilation", () => {
    const evidence = previewFeedbackEvidence({
      title: "预演",
      scenario: "场景",
      userPrompt: "帮我定制简历",
      sampleInput: "一段代表性经历",
      output: "先分析岗位，再按证据改写。",
      learned: ["岗位定制", "证据优先"],
      uncertainties: [],
      feedbackOptions: ["不够具体", "不像我", "步骤太慢"],
    }, ["不像我"], "要先给结论");
    assert.equal(evidence.length, 2);
    assert.match(evidence[1].answer, /不像我/);
    assert.match(evidence[1].answer, /先给结论/);
});
