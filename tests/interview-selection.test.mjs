import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { enableMultipleSelection, toggleInterviewAnswer } from "../app/interview-selection.ts";
import { classifyUserEvidence, describeUserEvidence } from "../app/user-evidence.ts";
import { stageResults } from "./fixtures/blueprint.mjs";

const unsure = "我不确定，请 AI 帮我判断";
const question = { id: "workflow", dimension: "工作流程", label: "希望如何处理", selectionMode: "single", options: ["先生成草稿", "最终交付前确认", unsure] };

test("single-to-multiple preserves the chosen answer and uses native multiple-answer format", () => {
  const answer = toggleInterviewAnswer(question, "", question.options[0], unsure);
  const multiple = enableMultipleSelection(question);
  assert.equal(question.selectionMode, "single", "do not mutate the original/default question");
  assert.equal(multiple.selectionMode, "multiple");
  assert.equal(toggleInterviewAnswer(multiple, answer, question.options[1], unsure), "先生成草稿；最终交付前确认");
  assert.equal(toggleInterviewAnswer(multiple, "先生成草稿；最终交付前确认", question.options[0], unsure), "最终交付前确认");
});

test("unsure remains exclusive and single questions stay single until requested", () => {
  const multiple = enableMultipleSelection(question);
  assert.equal(toggleInterviewAnswer(multiple, "先生成草稿；最终交付前确认", unsure, unsure), unsure);
  assert.equal(toggleInterviewAnswer(multiple, unsure, "先生成草稿", unsure), "先生成草稿");
  assert.equal(toggleInterviewAnswer(question, "先生成草稿", "最终交付前确认", unsure), "最终交付前确认");
  assert.equal(toggleInterviewAnswer(multiple, "先生成草稿", "unknown", unsure), "先生成草稿");
});

test("draft round persistence retains the requested mode and every selected option", () => {
  const saved = JSON.stringify({ interviewRounds: [{ questions: [enableMultipleSelection(question)] }], answers: { workflow: "先生成草稿；最终交付前确认" } });
  const restored = JSON.parse(saved);
  assert.equal(restored.interviewRounds[0].questions[0].selectionMode, "multiple");
  assert.equal(toggleInterviewAnswer(restored.interviewRounds[0].questions[0], restored.answers.workflow, "先生成草稿", unsure), "最终交付前确认");
});

async function pageEvidenceFunctions() {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const source = page.slice(page.indexOf("function createInterviewEvidence("), page.indexOf("function reportClientRepairEvent("));
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  return new Function("classifyUserEvidence", "describeUserEvidence", `${outputText}; return { createInterviewEvidence, createDemoAnswers };`)(classifyUserEvidence, describeUserEvidence);
}

test("both choices survive actual page serialization, compiler mapping and backend model request", async (t) => {
  const { createInterviewEvidence, createDemoAnswers } = await pageEvidenceFunctions();
  const multiple = enableMultipleSelection(question);
  const answer = toggleInterviewAnswer(multiple, "先生成草稿", "最终交付前确认", unsure);
  const negative = { ...multiple, id: "bad-example", dimension: "失败模式", label: "哪些行为不可接受？", options: ["忽略资料", "擅自发布"] };
  const rounds = [{ questions: [multiple, negative] }];
  const answers = { workflow: answer, "bad-example": "忽略资料；擅自发布" };
  const evidence = createInterviewEvidence(rounds, answers);
  assert.equal(evidence[0].answer, answer);
  assert.equal(evidence[1].evidenceKind, "negative_example");
  assert.equal(evidence[1].answer, answers["bad-example"]);
  assert.equal(createDemoAnswers(rounds, answers).workflow, answer);
  let sent;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(String(url), "https://selection.test/v1/chat/completions");
    sent = JSON.parse(options.body);
    return Response.json({ choices: [{ message: { content: JSON.stringify(stageResults["blueprint-foundation"]) }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 100 } });
  });
  const { default: worker } = await import("../dist/server/index.js");
  const response = await worker.fetch(new Request("http://localhost/api/ai", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "blueprint-foundation", provider: "compatible", baseUrl: "https://selection.test/v1", apiKey: "test-only-not-real", model: "test-model", idea: "通用材料处理", answers: evidence }),
  }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200, await response.text());
  assert.ok(sent);
  const content = sent.messages.map((message) => message.content).join("\n");
  assert.ok(content.includes(answer), "the backend must not pick only the first selected option");
  assert.ok(content.includes("忽略资料；擅自发布"), "negative evidence must retain both prohibitions");
});

test("single questions expose a small mode button wired to persisted rounds", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /question.selectionMode === "single" && <button[^>]*className="question-multiple-toggle"[^>]*onClick=\{\(\) => allowMultipleAnswers\(question.id\)\}[^>]*>我想多选<\/button>/);
  const handler = page.slice(page.indexOf("function allowMultipleAnswers("), page.indexOf("function showCustomQuestionInput("));
  assert.match(handler, /setInterviewRounds/);
  assert.match(handler, /index === interviewRoundIndex/);
  assert.match(handler, /question.id === questionId \? enableMultipleSelection\(question\)/);
  assert.doesNotMatch(handler, /setAnswers|setCustomQuestionIds|callAI/);
  assert.match(page, /toggleInterviewAnswer\(question, next\[question.id\]/);
});
