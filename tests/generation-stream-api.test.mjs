import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as immediate } from "node:timers/promises";

const encoder = new TextEncoder();
const event = (content, finish = null, usage) => encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`);
const completion = '{"files":{"SKILL.md":"complete"}}';
const flush = async () => { for (let i = 0; i < 6; i++) await immediate(); };

async function request(mode = "build", signal, extra = {}) {
  const { default: worker } = await import("../dist/server/index.js");
  return worker.fetch(new Request("http://localhost/api/ai", {
    method: "POST", headers: { "content-type": "application/json" }, signal,
    body: JSON.stringify({ mode, provider: "deepseek", model: "deepseek-v4-flash", apiKey: "test-only-not-a-real-credential", idea: "Compare products", ...extra }),
  }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("DeepSeek build can stream for longer than the old 44/52s and 106s caller limits", async (t) => {
  let stream, calls = 0, requestBody;
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls++;
    requestBody = JSON.parse(options.body);
    const body = new ReadableStream({ start(controller) { stream = controller; } });
    options.signal.addEventListener("abort", () => stream.error(new DOMException("aborted", "AbortError")));
    started();
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  });
  // Import the worker before virtualizing deadlines used by the route.
  await import("../dist/server/index.js");
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = request();
  await ready;
  await flush();
  for (const part of ['{"files":', '{"SKILL.md":', '"a', ' complete', ' response"}}']) {
    t.mock.timers.tick(30000);
    stream.enqueue(event(part));
    await flush();
  }
  stream.enqueue(event("", "stop", { prompt_tokens: 120, completion_tokens: 30 }));
  stream.close();
  const response = await pending;
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(calls, 1, "healthy progress must not discard output and restart");
  assert.equal(requestBody.stream, true);
  assert.equal(requestBody.stream_options.include_usage, true);
  assert.deepEqual(payload.usage, { promptTokens: 120, completionTokens: 30, estimated: false });
  assert.equal(JSON.parse(payload.content).files["SKILL.md"], "a complete response");
});

test("empty keepalives cannot postpone the idle deadline; only two attempts are allowed", async (t) => {
  let stream, calls = 0;
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls++;
    const body = new ReadableStream({ start(controller) { stream = controller; } });
    options.signal.addEventListener("abort", () => stream.error(new DOMException("aborted", "AbortError")));
    started();
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = request();
  await ready;
  await flush();
  for (let attempt = 0; attempt < 2; attempt++) {
    t.mock.timers.tick(30000);
    stream.enqueue(encoder.encode(": keepalive\n\n"));
    await flush();
    t.mock.timers.tick(30001);
    await flush();
  }
  const response = await pending;
  assert.equal(response.status, 504);
  assert.equal(calls, 2);
  assert.match((await response.json()).error, /响应停滞|总时长上限/);
});

test("continuous output is still bounded by the absolute deadline", async (t) => {
  let stream, calls = 0;
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls++;
    const body = new ReadableStream({ start(controller) { stream = controller; } });
    options.signal.addEventListener("abort", () => stream.error(new DOMException("aborted", "AbortError")));
    started();
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = request();
  await ready;
  await flush();
  for (const ticks of [18, 12]) {
    for (let i = 1; i < ticks; i++) {
      t.mock.timers.tick(10000);
      stream.enqueue(event("x"));
      await flush();
    }
    t.mock.timers.tick(10001);
    await flush();
  }
  const response = await pending;
  assert.equal(response.status, 504);
  assert.equal(calls, 2);
});

test("caller cancellation aborts the upstream without launching a second paid attempt", async (t) => {
  let calls = 0, started;
  const ready = new Promise((resolve) => { started = resolve; });
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls++;
    return new Response(new ReadableStream({ start(controller) {
      options.signal.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
      started();
    } }), { headers: { "content-type": "text/event-stream" } });
  });
  const abort = new AbortController();
  const pending = request("build", abort.signal);
  await ready;
  abort.abort();
  assert.equal((await pending).status, 504);
  assert.equal(calls, 1);
});

test("unsupported streaming falls back once, retaining the build output scope", async (t) => {
  const bodies = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const body = JSON.parse(options.body);
    bodies.push(body);
    if (body.stream) return Response.json({ error: { message: "stream unsupported" } }, { status: 400 });
    return Response.json({ choices: [{ message: { content: completion }, finish_reason: "stop" }] });
  });
  assert.equal((await request()).status, 200);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].stream, undefined);
  assert.doesNotMatch(bodies[1].messages[1].content, /generate 10-12/);
});

test("an abruptly closed SSE is not accepted even if its partial JSON parses", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(event(completion));
      controller.close();
    } }), { headers: { "content-type": "text/event-stream" } });
  });
  const response = await request();
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "AI_STREAM_INCOMPLETE");
  assert.equal(calls, 2);
});

test("actual build route sends the intact canonical contract once and omits generated projections", async (t) => {
  let sent;
  const skillIR = {
    compiler: "skillcanvas", identity: { intent: "compare products" },
    requirements: [{ statement: "long confirmed requirement ".repeat(2500) }],
    capabilities: [{ id: "final-capability", input: "$final-content" }],
    runtimeContract: { workflow: [{ id: "approve", produces: ["$confirmed"] }] },
    controlModel: { stop: "only after final approval" },
  };
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    sent = JSON.parse(options.body);
    return Response.json({ choices: [{ message: { content: completion }, finish_reason: "stop" }] });
  });
  const response = await request("build", undefined, {
    skillIR, answers: [{ dimension: "协作边界", answer: "最终交付前确认" }],
    sourceText: "complete user material", blueprint: "duplicate-blueprint", capabilityPlan: "duplicate-plan", loopPlan: "duplicate-loop",
  });
  assert.equal(response.status, 200);
  const prompt = JSON.parse(sent.messages[1].content);
  assert.deepEqual(prompt.canonicalSkillIR, skillIR);
  assert.equal(prompt.userProvidedMaterial, "complete user material");
  assert.match(JSON.stringify(prompt.confirmedInterviewEvidence), /最终交付前确认/);
  assert.doesNotMatch(sent.messages[1].content, /duplicate-blueprint|duplicate-plan|duplicate-loop/);
  assert.match(sent.messages[0].content, /CANONICAL BUILD OUTPUT SCOPE/);
  assert.match(sent.messages[0].content, /Do NOT generate these files/);
});
