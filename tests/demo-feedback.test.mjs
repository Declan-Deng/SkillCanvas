import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { hasObservedDemoMismatch, observedDemoFeedback, normalizeDemoFeedbackOptions } from "../app/demo-feedback.ts";

test("zero, one and two grounded feedback options never get padded to a quota", () => {
  const fallback = ["不应自动加上的静态抱怨"];
  for (const options of [[], ["分类不准确"], ["分类不准确", "遗漏一条待办"]]) {
    assert.deepEqual(normalizeDemoFeedbackOptions(options, fallback), options);
  }
});

test("fallback uses only concrete observed issues, not successes or coverage limitations", () => {
  const results = [
    { coverage: "observed", issue: "", detail: "所有步骤正确" },
    { coverage: "not-covered", issue: "没有验证异常场景" },
    { coverage: "observed", issue: "文件检查暂未发现明显问题，仍需通过 Demo 验证" },
    { coverage: "observed", issue: "分类不准确，把待评审写成已完成" },
  ];
  assert.deepEqual(observedDemoFeedback(results), ["分类不准确，把待评审写成已完成"]);
  assert.equal(hasObservedDemoMismatch(results[0]), false);
  assert.equal(hasObservedDemoMismatch(results[3]), true, "不准确 must not be swallowed by a broad 准确 regex");
});

test("unavailable model feedback can reuse an observed issue without inventing missing facts", () => {
  const fallback = observedDemoFeedback([{ coverage: "observed", issue: "漏掉已提供的负责人" }]);
  assert.deepEqual(normalizeDemoFeedbackOptions(undefined, fallback), ["漏掉已提供的负责人"]);
  assert.deepEqual(normalizeDemoFeedbackOptions(["没有验证异常分支", "SKILL.md 写得不够好"], fallback), []);
});

test("product presentation preserves empty issue fields and never converts Demo unknowns into failures", () => {
  const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /demo\.uncertainties[\s\S]{0,250}没有处理好/);
  assert.doesNotMatch(source, /options\.length >= 3 \? options : fallback/);
  assert.match(source, /typeof candidate\.issue === "string" \? candidate\.issue\.trim\(\)\.slice\(0, 800\) : ""/);
  assert.equal((source.match(/normalized\.some\(hasObservedDemoMismatch\)/g) || []).length, 2);
});
