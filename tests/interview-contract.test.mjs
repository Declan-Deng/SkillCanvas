import assert from "node:assert/strict";
import test from "node:test";

import { INTERVIEW_DIMENSIONS, INTERVIEW_UNSURE_OPTION, normalizeInterviewPayload, normalizeInterviewQuestions } from "../app/interview-contract.ts";

function questions(round = 0) {
  return INTERVIEW_DIMENSIONS[round].map((dimension, index) => ({
    dimension,
    label: `${dimension}具体应该怎样选择？`,
    helper: "会改变实际行为",
    placeholder: "请补充",
    options: [`选项 ${index + 1}A`, `选项 ${index + 1}B`, `选项 ${index + 1}C`],
    selectionMode: index % 2 ? "multiple" : "single",
    recommendedOption: `选项 ${index + 1}A`,
  }));
}

test("server and browser interview contract owns dimensions, ids and unsure option", () => {
  const shuffled = questions(0).reverse().map((question) => ({ ...question, id: "model-owned-id" }));
  const result = normalizeInterviewQuestions(shuffled, 0);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.questions.map((question) => question.dimension), [...INTERVIEW_DIMENSIONS[0]]);
  assert.deepEqual(result.questions.map((question) => question.id), [
    "ai-round-1-question-1", "ai-round-1-question-2", "ai-round-1-question-3", "ai-round-1-question-4",
  ]);
  assert.ok(result.questions.every((question) => question.options.at(-1) === INTERVIEW_UNSURE_OPTION));
});

test("incomplete interview response fails at the API contract instead of later in the UI", () => {
  const result = normalizeInterviewPayload("interview", { questions: questions(1).slice(0, 3) }, 1);
  assert.ok(result.issues.some((issue) => issue.path === "/questions/3"));
});

test("preview contract validates its visible result together with its four questions", () => {
  const result = normalizeInterviewPayload("preview", {
    interpretation: "这是一个足够完整、能够供用户检查的目标理解说明。",
    preview: { title: "示例", scenario: "展示", userPrompt: "帮我处理", sampleInput: "输入", output: "输出" },
    questions: questions(0),
  }, 0);
  assert.deepEqual(result.issues, []);
});

test("missing delivery question cannot reuse the information-policy question", () => {
  const source = questions(1).filter((question) => question.dimension !== "交付形式");
  const result = normalizeInterviewQuestions(source, 1);
  assert.ok(result.issues.some((issue) => issue.path === "/questions/2"));
  assert.equal(result.questions.filter((question) => question.label === source[2].label).length, 1);
  assert.equal(result.questions.some((question) => question.dimension === "交付形式"), false);
});

test("unlabelled wire questions can fill an unclaimed slot but never consume a labelled question twice", () => {
  const source = questions(1).reverse();
  delete source[1].dimension;
  const result = normalizeInterviewQuestions(source, 1);
  assert.deepEqual(result.issues, []);
  assert.equal(new Set(result.questions.map((question) => question.label)).size, 4);
  assert.equal(result.questions[2].label, "交付形式具体应该怎样选择？");
});

test("duplicate dimensions and repeated questions are not mistaken for complete coverage", () => {
  const source = questions(1);
  source[2] = { ...source[3] };
  const result = normalizeInterviewQuestions(source, 1);
  assert.ok(result.issues.length > 0);
  assert.equal(result.questions.some((question) => question.dimension === "交付形式"), false);
});
