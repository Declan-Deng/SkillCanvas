import assert from "node:assert/strict";
import test from "node:test";
import { previewFixtureMatchesAnswers } from "../app/representative-fixture.ts";

test("English-interest correction invalidates the initial technical-reading fixture", () => {
  const questions = [{ id: "scene", recommendedOption: "看懂英文技术文档" }, { id: "goal", recommendedOption: "每天生成可执行计划" }];
  assert.equal(previewFixtureMatchesAnswers(questions, { scene: "看剧、旅游、口语交流", goal: "每天生成可执行计划" }), false);
  assert.equal(previewFixtureMatchesAnswers(questions, { scene: "看懂英文技术文档", goal: "每天生成可执行计划" }), true);
  assert.equal(previewFixtureMatchesAnswers(questions, { scene: "看懂英文技术文档；旅游", goal: "每天生成可执行计划" }), false);
  assert.equal(previewFixtureMatchesAnswers(questions, {}), false);
  assert.equal(previewFixtureMatchesAnswers([], {}), false);
});
