import assert from "node:assert/strict";
import test from "node:test";

import { generationResultCopy } from "../app/generation-result-copy.ts";

const cases = [
  ["accepted", "Skill 已生成并通过测试", "已保存"],
  ["accepted-with-issues", "还有测试记录需要查看", "需要确认"],
  ["stable", "当前版本已保留", "无需更换"],
  ["evaluated-no-improvement", "测试已完成", "修改版没有更好"],
  ["no-safe-change", "自动修改未应用", "没有安全修改"],
  ["evaluation-incomplete", "测试没有完成", "测试中途停止"],
  ["build-blocked", "需要先修复结构", "需要先修复生成文件"],
  ["failed", "没有生成完成", "生成没有完成"],
  ["running", "正在测试", "正在运行真实任务测试"],
  ["not-run", "尚未开始测试", "真实任务测试尚未开始"],
];

for (const [outcome, titlePart, panelPart] of cases) {
  test(`${outcome} has an explicit beginner-facing result`, () => {
    const copy = generationResultCopy({ outcome, issueCount: 3, lift: 7 });
    assert.match(copy.title, new RegExp(titlePart));
    assert.match(copy.panelTitle, new RegExp(panelPart));
    assert.ok(copy.body.length > 8);
    assert.ok(copy.panelBody.length > 8);
    assert.doesNotMatch(`${copy.title} ${copy.body} ${copy.panelTitle} ${copy.panelBody}`, /P0|P1|候选|门控|回归|held-out|Loop|Bundle|Lift/);
  });
}

test("a rejected proposal is not described as an evaluated candidate", () => {
  const copy = generationResultCopy({ outcome: "no-safe-change", issueCount: 8 });
  assert.match(copy.body, /没有生成安全、有效的修改/);
  assert.match(copy.panelBody, /没有进入修改版测试/);
  assert.doesNotMatch(copy.body, /测试了修改版|自动回滚/);
  assert.match(copy.issueLabel, /8 条测试记录/);
});

test("a tested but weaker revision says exactly what happened", () => {
  const copy = generationResultCopy({ outcome: "evaluated-no-improvement", issueCount: 2 });
  assert.match(copy.body, /测试了修改版/);
  assert.match(copy.body, /没有应用/);
  assert.match(copy.body, /当前版本仍然保留/);
});
