import assert from "node:assert/strict";
import test from "node:test";

import { demoReplyNeedsUserTurn, normalizePlannedDemoTurns } from "../app/demo-episode.ts";

test("a clarification-only first Demo continues, while a finished deliverable does not", () => {
  assert.equal(demoReplyNeedsUserTurn("JD 信息不足，在开始定制之前请补充：\n1. 具体职责是什么？\n2. 是否要求 Python 和 SQL？"), true);
  assert.equal(demoReplyNeedsUserTurn("这是已经完成的岗位定制简历。教育背景、工作经历与技能已经重写。\n\n如需调整措辞可以告诉我。"), false);
});

test("mock episode plans keep at most two concrete user turns", () => {
  const turns = normalizePlannedDemoTurns([
    { message: "职责包括产品规划和跨部门协作，硬技能要求 Python、SQL。", purpose: "补齐职责和技能" },
    { message: "行业是教育科技，不要求证书；请先给草稿。", purpose: "补齐行业和确认方式" },
    { message: "第三条不应被执行", purpose: "超出轮数" },
    { message: "", purpose: "空消息" },
  ]);
  assert.equal(turns.length, 2);
  assert.match(turns[0].message, /Python、SQL/);
});
