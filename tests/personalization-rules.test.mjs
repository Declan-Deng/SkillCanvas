import assert from "node:assert/strict";
import test from "node:test";

import {
  applyConfirmedPersonalizationFeedback,
  confirmedPersonalizationConflicts,
  extractConfirmedPersonalizationFeedback,
  feedbackAppearsInRuntimeFiles,
  feedbackKeywords,
  reconcileCapabilityPlanWithFeedback,
} from "../app/personalization-rules.ts";

test("short concrete feedback is converted into a verifiable runtime requirement", () => {
  assert.deepEqual(feedbackKeywords("想看地区"), ["地区"]);
  assert.equal(feedbackAppearsInRuntimeFiles({ "SKILL.md": "## Workflow\n\n按热度排序。" }, "想看地区"), false);

  const updated = applyConfirmedPersonalizationFeedback({
    "SKILL.md": "---\nname: find-creators\ndescription: Find relevant creators.\n---\n\n## Workflow\n\n1. 筛选候选人。",
  }, ["想看地区"]);

  assert.equal(feedbackAppearsInRuntimeFiles(updated, "想看地区"), true);
  assert.match(updated["SKILL.md"], /Confirmed Skill-specific iteration feedback/);
  assert.match(updated["SKILL.md"], /- 想看地区/);
});

test("confirmed feedback survives later rounds without duplication", () => {
  const first = applyConfirmedPersonalizationFeedback({ "SKILL.md": "## Goal\n\n筛选红人" }, ["想看地区"]);
  const second = applyConfirmedPersonalizationFeedback(first, ["想看地区", "需要显示粉丝数"]);

  assert.equal((second["SKILL.md"].match(/- 想看地区/g) || []).length, 1);
  assert.equal((second["SKILL.md"].match(/- 需要显示粉丝数/g) || []).length, 1);
});

test("direct-first feedback updates compiler-owned missing-input branches", () => {
  const plan = {
    riskBranches: [{ condition: "素材过少或未提供必要输入", action: "请求补充素材", stopOrRedirect: "停止生成并等待用户输入" }],
    items: [{ kind: "llm", fallback: "请求用户提供更多素材" }, { kind: "reference", fallback: "保持现状" }],
  };
  const updated = reconcileCapabilityPlanWithFeedback(plan, ["请先给我一版草稿再修改"]);
  assert.match(updated.riskBranches[0].action, /先使用现有输入生成一版可逆草稿/);
  assert.match(updated.riskBranches[0].stopOrRedirect, /只有缺口会改变任务方向/);
  assert.match(updated.items[0].fallback, /先基于现有输入生成可逆草稿/);
  assert.equal(updated.items[1].fallback, "保持现状");
});

test("release audit catches confirmed feedback contradicted by stale runtime branches", () => {
  const files = {
    "SKILL.md": `## Runtime branches\n\n- **If 素材过少或缺少输入:** 请求用户补充素材. Then 停止生成，等待用户输入.\n\n## Capabilities and bundled resources\n\n- When requested, perform the task. If blocked: 请求用户提供更多素材.\n\n## Confirmed Skill-specific iteration feedback\n\nThese are confirmed requirements.\n\n- 请先给我一版草稿再修改`,
  };
  assert.deepEqual(extractConfirmedPersonalizationFeedback(files["SKILL.md"]), ["请先给我一版草稿再修改"]);
  assert.deepEqual(confirmedPersonalizationConflicts(files), ["用户确认先产出草稿，但缺失信息分支仍要求直接停止并追问"]);

  const aligned = { "SKILL.md": files["SKILL.md"].replace("请求用户补充素材. Then 停止生成，等待用户输入", "先生成可逆草稿并标注假设. Then 只有无法安全起草时才追问").replace("If blocked: 请求用户提供更多素材.", "If blocked: 先生成可逆草稿并标注假设.") };
  assert.deepEqual(confirmedPersonalizationConflicts(aligned), []);
});

test("a later safety stop branch does not create a missing-input false positive", () => {
  const files = {
    "SKILL.md": `## Runtime branches

- **If 用户未提供素材或素材过少:** 先使用现有输入生成一版可逆草稿，并明确标注假设、推测和待确认内容. Then 只有缺口会改变任务方向、造成安全风险或无法形成可用草稿时，才请求最少必要信息.
- **If 素材包含敏感信息:** 避免暴露敏感信息. Then 停止生成或修改输出.

## Capabilities and bundled resources

- When 用户请求写作时, perform the task. If blocked: 先基于现有输入生成可逆草稿并标注假设；只有无法安全起草时才请求最少必要信息.

## Confirmed Skill-specific iteration feedback

- 请先给我一版草稿再修改`,
  };
  assert.deepEqual(confirmedPersonalizationConflicts(files), []);
});
