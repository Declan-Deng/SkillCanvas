import assert from "node:assert/strict";
import test from "node:test";

async function callWorker(body) {
  const { default: worker } = await import("../dist/server/index.js");
  return worker.fetch(new Request("http://localhost/api/ai", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "compatible", model: "test-model", baseUrl: "https://runtime-contract.test/v1", apiKey: "synthetic-test-key-not-a-real-secret", ...body }),
  }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("built API retries the missing delivery dimension instead of duplicating policy", async (t) => {
  let calls = 0;
  const complete = ["输入信息", "工作流程", "交付形式", "信息策略"].map((dimension) => ({ dimension, label: `${dimension}如何选择？`, options: ["选项一", "选项二", "选项三"], recommendedOption: "选项一" }));
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    calls += 1;
    const body = JSON.parse(init.body);
    if (calls === 2) assert.match(JSON.stringify(body.messages), /交付形式|questions\/2/);
    const questions = calls === 1 ? complete.filter((entry) => entry.dimension !== "交付形式") : complete;
    return Response.json({ choices: [{ message: { content: JSON.stringify({ questions }) }, finish_reason: "stop" }] });
  });
  const response = await callWorker({ mode: "interview", round: 2, idea: "每天学习英语" });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(calls, 2);
  const result = JSON.parse(payload.content);
  assert.equal(new Set(result.questions.map((entry) => entry.label)).size, 4);
  assert.deepEqual(result.questions.map((entry) => entry.dimension), complete.map((entry) => entry.dimension));
});

test("built API projects one flat grade into the unchanged harness envelope", async (t) => {
  const grade = { caseId: "review", passed: false, evidence: "发现事实越界", failureReason: "不可追溯", dimensions: [], assertions: [{ text: "不得虚构", passed: false, evidence: "虚构数量" }], claims: [], evalFeedback: { suggestions: [], overall: "可判定" }, textualFeedback: { summary: "事实越界", criticalProblems: [], preserve: ["不直接改代码"] }, failedCases: [{ caseId: "review", failureSummary: "事实越界", observedEvidence: "虚构数量" }] };
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.match(body.messages[0].content, /ONE flat JSON object/);
    assert.doesNotMatch(body.messages[0].content, /Return valid JSON only: \{"grades"/);
    return Response.json({ choices: [{ message: { content: JSON.stringify(grade) }, finish_reason: "stop" }] });
  });
  const response = await callWorker({ mode: "eval-grade", executions: [{ caseId: "review", output: "数量 50" }] });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  const result = JSON.parse(payload.content);
  assert.equal(result.grades[0].passed, false);
  assert.deepEqual(result.grades[0].assertions, grade.assertions);
  assert.deepEqual(result.textualFeedback, grade.textualFeedback);
  assert.deepEqual(result.failedCases, grade.failedCases);
});

test("built API retries malformed single-turn episode JSON once without changing its visible task", async (t) => {
  let calls = 0;
  const seenTasks = [];
  const contract = { digest: "travel-turn", cases: [{ id: "trip", prompt: "安排成都四天行程", context: {} }] };
  const conversation = [{ role: "user", content: "先给框架" }, { role: "assistant", content: "请确认每日框架" }];
  const execution = { executions: [{ caseId: "trip", prompt: contract.cases[0].prompt, triggered: true, output: "每日框架已整理，请确认后补交通。", artifacts: [], trace: ["整理框架", "等待真实确认"] }] };
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    calls += 1;
    const request = JSON.parse(init.body);
    seenTasks.push(request.messages[1].content);
    assert.match(request.messages[1].content, /安排成都四天行程/);
    assert.match(request.messages[1].content, /请确认每日框架/);
    assert.match(request.messages[0].content, /BASELINE/);
    return Response.json({ choices: [{ message: { content: calls === 1 ? '{"executions":[{"caseId":"trip","output":' : JSON.stringify(execution) }, finish_reason: "stop" }] });
  });
  const response = await callWorker({ mode: "eval-execute", baselineMode: true, evalContract: contract, conversation });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(calls, 2);
  assert.equal(seenTasks[0], seenTasks[1]);
  assert.deepEqual(JSON.parse(payload.content), execution);
});

test("built API gives malformed multi-case execution back to client splitting instead of retrying the whole batch", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return Response.json({ choices: [{ message: { content: '{"executions":[' }, finish_reason: "stop" }] });
  });
  const response = await callWorker({ mode: "eval-execute", evalContract: { cases: [{ id: "a", prompt: "A" }, { id: "b", prompt: "B" }] } });
  assert.equal(response.status, 502);
  assert.equal(calls, 1);
});

test("built API never turns two malformed single-case executions into a fabricated pass", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return Response.json({ choices: [{ message: { content: '{"executions":[' }, finish_reason: "stop" }] });
  });
  const response = await callWorker({ mode: "eval-execute", evalContract: { cases: [{ id: "a", prompt: "A" }] } });
  const payload = await response.json();
  assert.equal(response.status, 502);
  assert.equal(calls, 2);
  assert.equal(payload.content, undefined);
  assert.match(payload.error, /连续两次/);
});
