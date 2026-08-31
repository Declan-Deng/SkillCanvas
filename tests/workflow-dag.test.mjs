import assert from "node:assert/strict";
import test from "node:test";

import { bindWorkflowCapabilities, closeWorkflowDagTerminals, compileWorkflowDag, WORKFLOW_TERMINALS } from "../app/workflow-dag.ts";

const step = (id, requires, produces) => ({ id, capabilityIds: [id], when: "always", input: "input", action: id, output: "output", fallback: "stop", requires, produces, mutates: [] });

test("a real missing-input reply may supply a declared external input, never manufacture one", () => {
  const wait = { ...step("wait", [], ["$input_required"]), role: "await-input", resumeProduces: ["input:material"] };
  const draft = { ...step("compose", ["input:material"], ["$report"]), role: "transform" };
  const deliver = { ...step("deliver", ["$report"], ["$output"]), role: "deliver", delivers: ["$report"] };
  const options = { terminalOutputs: Object.values(WORKFLOW_TERMINALS), requiredTerminalOutputs: ["$output"] };
  assert.equal(compileWorkflowDag([wait, draft, deliver], ["input:material"], options).valid, true);
  assert.equal(compileWorkflowDag([draft, deliver], ["input:material"], options).valid, true, "input-present path does not depend on waiting");
  for (const invalid of [
    { ...wait, produces: ["$input_required", "input:material"], resumeProduces: [] },
    { ...wait, role: "transform" },
    { ...wait, role: "await-approval" },
    { ...wait, resumeProduces: ["$source"] },
  ]) {
    const result = compileWorkflowDag([invalid, draft, deliver], ["input:material", "$source"], options);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => ["duplicate-producer", "invalid-confirmation"].includes(issue.type)));
  }
});

test("workflow compiler topologically sorts extraction before transformation", () => {
  const compiled = compileWorkflowDag([
    step("rewrite", ["resume-record"], ["rewritten-resume"]),
    step("extract", ["$request"], ["resume-record"]),
  ], ["$request"]);

  assert.equal(compiled.valid, true);
  assert.deepEqual(compiled.ordered.map((item) => item.id), ["extract", "rewrite"]);
});

test("workflow compiler blocks unresolved artifacts and cycles", () => {
  const missing = compileWorkflowDag([step("rewrite", ["resume-record"], ["rewritten-resume"])], ["$request"]);
  assert.equal(missing.valid, false);
  assert.equal(missing.issues[0].type, "unmet-dependency");

  const cycle = compileWorkflowDag([
    step("extract", ["rewritten-resume"], ["resume-record"]),
    step("rewrite", ["resume-record"], ["rewritten-resume"]),
  ], ["$request"]);
  assert.equal(cycle.valid, false);
  assert.ok(cycle.issues.some((item) => item.type === "cycle"));

  const selfDependency = compileWorkflowDag([
    step("extract", ["resume-record"], ["resume-record"]),
  ], ["$request"]);
  assert.equal(selfDependency.valid, false);
  assert.ok(selfDependency.issues.some((item) => item.type === "cycle"));
});

test("workflow compiler rejects disconnected capability branches when a terminal output is declared", () => {
  const disconnected = compileWorkflowDag([
    step("extract", ["$request"], ["record"]),
    step("render", ["record"], ["$output"]),
    step("unused-search", ["$request"], ["search-result"]),
  ], ["$request"], { terminalOutputs: ["$output"] });
  assert.equal(disconnected.valid, false);
  assert.ok(disconnected.issues.some((item) => item.type === "unconsumed-production" && item.stepId === "unused-search"));
  assert.ok(disconnected.issues.some((item) => item.type === "disconnected-step" && item.stepId === "unused-search"));

  const closed = compileWorkflowDag([
    step("extract", ["$request"], ["record"]),
    step("search", ["$request"], ["search-result"]),
    step("render", ["record", "search-result"], ["$output"]),
  ], ["$request"], { terminalOutputs: ["$output"] });
  assert.equal(closed.valid, true);
});

test("conditional leaves close as completed, input-required, or approval-required outcomes", () => {
  const closed = closeWorkflowDagTerminals([
    // Legacy confirmation becomes an event output, never an initial input.
    { ...step("confirm-key-parts", ["$request"], ["$confirmed"]), when: "关键信息缺失时", action: "请求用户确认关键内容" },
    { ...step("deliver-directly", ["$confirmed"], ["draft-result"]), when: "信息已确认时", action: "完成用户请求" },
    { ...step("ask-approval", ["$request"], ["approval-request"]), when: "需要外部提交时", action: "等待用户授权后提交" },
  ]);
  assert.deepEqual(closed.find((item) => item.id === "confirm-key-parts")?.produces, [WORKFLOW_TERMINALS.inputRequired]);
  assert.deepEqual(closed.find((item) => item.id === "confirm-key-parts")?.resumeProduces, ["$confirmed"]);
  assert.deepEqual(closed.find((item) => item.id === "deliver-directly")?.produces, ["draft-result", WORKFLOW_TERMINALS.completed]);
  assert.deepEqual(closed.find((item) => item.id === "ask-approval")?.produces, ["approval-request", WORKFLOW_TERMINALS.approvalRequired]);

  const compiled = compileWorkflowDag(closed, ["$request", "$confirmed"], {
    terminalOutputs: Object.values(WORKFLOW_TERMINALS),
    requiredTerminalOutputs: [WORKFLOW_TERMINALS.completed],
  });
  assert.equal(compiled.valid, true, compiled.issues.map((item) => item.message).join("；"));
});

const terminals = { terminalOutputs: Object.values(WORKFLOW_TERMINALS), requiredTerminalOutputs: ["$output"] };

test("disconnected parsing and reference leaves preserve artifacts and never become deliveries", () => {
  const closed = closeWorkflowDagTerminals([
    { ...step("parse", ["$request"], ["parsed-data"]), role: "read" },
    { ...step("reference", ["$request"], ["guidance"]), role: "read" },
    { ...step("deliver", ["$request"], ["result"]), role: "deliver" },
  ]);
  assert.deepEqual(closed[0].produces, ["parsed-data"]);
  assert.deepEqual(closed[1].produces, ["guidance"]);
  const result = compileWorkflowDag(closed, ["$request"], terminals);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.type === "disconnected-step" && issue.stepId === "parse"));
});

test("file saving binds to generated content regardless of capability order", () => {
  for (const domain of ["budget-report", "travel-plan", "release-notes"]) {
    const capabilities = [
      { id: "save", kind: "builtin-tool", input: "final-content", output: "保存文件", affects: ["artifact-output"], fallback: "stop" },
      { id: "compose", kind: "llm", input: "$request", output: "final-content", fallback: "stop" },
    ];
    const workflow = bindWorkflowCapabilities([{ ...step("compose", ["$request"], ["content"]), capabilityIds: ["compose"], output: "final-content", role: "deliver" }], capabilities);
    const closed = closeWorkflowDagTerminals(workflow);
    const compiled = compileWorkflowDag(closed, ["$request"], terminals);
    assert.equal(compiled.valid, true, `${domain}: ${JSON.stringify(compiled.issues)}`);
    assert.deepEqual(compiled.ordered.map((item) => item.id), ["compose", "step-capability-save"]);
    assert.deepEqual(closed.find((item) => item.id === "step-capability-save").requires, ["content"]);
    assert.ok(!closed.find((item) => item.id === "compose").produces.includes("$output"));
    assert.ok(closed.find((item) => item.id === "step-capability-save").produces.includes("$output"));
  }
});

test("ambiguous save input is a repairable error rather than arbitrary last-step binding", () => {
  const existing = ["a", "b"].map((id) => ({ ...step(id, ["$request"], [id]), role: "deliver" }));
  const workflow = bindWorkflowCapabilities(existing, [
    ...existing.map((item) => ({ id: item.id, kind: "llm", input: "input", output: "output", fallback: "stop" })),
    { id: "save", kind: "builtin-tool", input: "未确定的最终内容", output: "文件", affects: ["artifact-output"], fallback: "stop" },
  ]);
  assert.ok(workflow.find((item) => item.id === "step-capability-save").requires[0].startsWith("unbound:"));
  assert.equal(compileWorkflowDag(closeWorkflowDagTerminals(workflow), ["$request"], terminals).valid, false);
});

test("confirmation cannot be injected as an initial token or fabricated by a normal step", () => {
  assert.equal(compileWorkflowDag([step("finish", ["$confirmed"], ["$output"])], ["$request", "$confirmed"], terminals).valid, false);
  const fake = compileWorkflowDag([step("fake", ["$request"], ["$confirmed"]), step("finish", ["$confirmed"], ["$output"])], ["$request"], terminals);
  assert.ok(fake.issues.some((issue) => issue.type === "invalid-confirmation"));
  const waiting = closeWorkflowDagTerminals([{ ...step("ask", ["$request"], ["$output"]), role: "await-approval", resumeProduces: ["permission"] }]);
  assert.ok(!waiting[0].produces.includes("$output"));
});

test("state mutations require explicit read and write ordering", () => {
  const writer = { ...step("write", ["state"], ["write-done"]), mutates: ["state"] };
  const reader = step("read", ["state"], ["result"]);
  assert.ok(compileWorkflowDag([writer, reader], ["state"]).issues.some((item) => item.type === "unordered-mutation"));
  assert.equal(compileWorkflowDag([writer, { ...reader, requires: ["state", "write-done"] }], ["state"]).valid, true);
  assert.ok(compileWorkflowDag([writer, { ...step("write2", ["state"], ["write2-done"]), mutates: ["state"] }], ["state"]).issues.some((item) => item.type === "unordered-mutation"));
  assert.equal(compileWorkflowDag([{ ...writer, requires: [] }], ["state"]).valid, false);
});

test("reference resources bind inside their consuming operation, not as fake completions", () => {
  const consumer = { ...step("compose", ["$request"], ["report"]), role: "deliver" };
  const workflow = bindWorkflowCapabilities([consumer], [
    { id: "compose", kind: "llm", input: "$request", output: "report", fallback: "stop" },
    { id: "domain-guide", kind: "reference", input: "current conditions", output: "advice", affects: ["runtime-workflow"], fallback: "state unavailable" },
  ]);
  assert.equal(workflow.length, 1);
  assert.deepEqual(workflow[0].capabilityIds, ["compose", "domain-guide"]);
});

test("several mutually exclusive branches may produce the same terminal output", () => {
  const compiled = compileWorkflowDag([
    step("path-a", ["$request"], ["$output"]),
    step("path-b", ["$request"], ["$output"]),
  ], ["$request"], { terminalOutputs: ["$output"] });
  assert.equal(compiled.valid, true, compiled.issues.map((item) => item.message).join("；"));
});

test("dollar-prefixed generated artifacts are valid persistence inputs, raw request is not", () => {
  const content = { ...step("compose", ["$request"], ["$final_content"]), role: "transform" };
  const save = { ...step("save", ["$final_content"], ["$saved_file", "$output"]), role: "persist", delivers: ["$saved_file"] };
  const result = compileWorkflowDag([save, content], ["$request"], terminals);
  assert.equal(result.valid, true, JSON.stringify(result.issues));
  assert.deepEqual(result.ordered.map((item) => item.id), ["compose", "save"]);
  assert.equal(compileWorkflowDag([{ ...save, requires: ["$request"] }], ["$request"], terminals).valid, false);
});

test("future user feedback is event-owned just like confirmation", () => {
  const revision = { ...step("revise", ["$feedback"], ["revised", "$output"]), role: "deliver", delivers: ["revised"] };
  assert.equal(compileWorkflowDag([revision], ["$feedback"], terminals).valid, false);
  assert.equal(compileWorkflowDag([step("infer-feedback", ["$request"], ["$feedback"]), revision], ["$request"], terminals).valid, false);
  const waiting = closeWorkflowDagTerminals([{ ...step("ask-feedback", ["$request"], ["$feedback"]), role: "await-input" }, revision]);
  assert.deepEqual(waiting[0].resumeProduces, ["$feedback"]);
  assert.deepEqual(waiting[0].produces, ["$input_required"]);
  assert.equal(compileWorkflowDag(waiting, ["$request"], terminals).valid, true);
});
