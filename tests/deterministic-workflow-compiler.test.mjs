import assert from "node:assert/strict";
import test from "node:test";
import { compileDeterministicWorkflowPlan } from "../app/workflow-plan-repair.ts";

const capabilities = [{ id: "semantic", kind: "llm", input: "请求", output: "报告", fallback: "说明缺口" }];
const step = (id, role, requires, produces, extra = {}) => ({ id, role, capabilityIds: ["semantic"], requires, produces, mutates: [], input: requires.join(" "), output: produces.join(" "), action: id, when: "按实际条件", fallback: "保留当前结果", ...extra });

test("lossless compiler preserves normal delivery independent of optional revision feedback", () => {
  const original = [
    step("draft", "transform", ["$request"], ["$draft"]),
    step("deliver-original", "deliver", ["$draft"], ["$output"], { delivers: ["$draft"] }),
    step("review", "await-input", ["$draft"], ["$input_required"], { resumeProduces: ["$feedback"] }),
    step("revise", "transform", ["$draft", "$feedback"], ["$revised"]),
    step("deliver-revised", "deliver", ["$revised"], ["$output"], { delivers: ["$revised"] }),
  ];
  const compiled = compileDeterministicWorkflowPlan({ workflowSteps: original, capabilities, inputs: [] });
  assert.deepEqual(compiled.find((entry) => entry.id === "deliver-original").requires, ["$draft"]);
  assert.deepEqual(compiled.find((entry) => entry.id === "revise").requires, ["$draft", "$feedback"]);
  assert.deepEqual(compiled.find((entry) => entry.id === "review").resumeProduces, ["$feedback"]);
  assert.equal(compiled.filter((entry) => entry.role === "deliver").length, 2);
  assert.deepEqual(compileDeterministicWorkflowPlan({ workflowSteps: compiled, capabilities, inputs: [] }), compiled);
});

test("ambiguous duplicate business products are not made green by serializing branches", () => {
  const original = [
    step("draft", "transform", ["$request"], ["$report"]),
    step("different-draft", "transform", ["$request"], ["$report"]),
    step("finish", "deliver", ["$report"], ["$output"], { delivers: ["$report"] }),
  ];
  const snapshot = structuredClone(original);
  assert.throws(() => compileDeterministicWorkflowPlan({ workflowSteps: original, capabilities, inputs: [] }), /WORKFLOW_DAG_INVALID/);
  assert.deepEqual(original, snapshot);
});
