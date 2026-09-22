import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import fs from "node:fs";
import vm from "node:vm";

function loadModule(path, dependencies = {}) {
  const source = fs.readFileSync(path, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports, require: (id) => dependencies[id], structuredClone });
  new vm.Script(compiled, { filename: path }).runInContext(context);
  return module.exports;
}

const workflowDag = loadModule("app/workflow-dag.ts", { "./host-evidence-adapters.ts": { hostEvidenceAdapter: () => null } });
const editor = loadModule("app/workflow-editor.ts", { "./workflow-dag": workflowDag });

const steps = [
  { id: "read", capabilityIds: ["core"], role: "read", when: "开始", input: "$request", action: "读取需求", output: "需求", fallback: "说明缺口", requires: ["$request"], produces: ["request-model"], mutates: [], delivers: [], resumeProduces: [] },
  { id: "deliver", capabilityIds: ["core"], role: "deliver", when: "需求可用", input: "request-model", action: "生成结果", output: "结果", fallback: "说明缺口", requires: ["request-model"], produces: ["result", "$output"], mutates: [], delivers: ["result"], resumeProduces: [] },
];

test("inserting a workflow step creates an explicit bridge dependency", () => {
  const inserted = editor.insertWorkflowStep(steps, 1);
  assert.equal(inserted.steps.length, 3);
  const custom = inserted.steps[1];
  assert.equal(custom.requires.join("|"), "request-model");
  assert.equal(inserted.steps[2].requires.join("|"), `workflow:${custom.id}:result`);
});

test("removing a workflow step reconnects its consumer", () => {
  const inserted = editor.insertWorkflowStep(steps, 1);
  const removed = editor.removeWorkflowStep(inserted.steps, inserted.stepId);
  assert.equal(removed.length, 2);
  assert.equal(removed[1].requires.join("|"), "request-model");
});

test("appending then removing a delivery step preserves a terminal producer", () => {
  const appended = editor.insertWorkflowStep(steps, 2);
  assert.equal(appended.steps.at(-1).role, "deliver");
  assert.ok(appended.steps.at(-1).produces.includes("$output"));
  assert.ok(!appended.steps[1].produces.includes("$output"));
  const restored = editor.removeWorkflowStep(appended.steps, appended.stepId);
  assert.equal(restored.at(-1).role, "deliver");
  assert.ok(restored.at(-1).produces.includes("$output"));
});

test("the only workflow step cannot be removed", () => {
  assert.throws(() => editor.removeWorkflowStep([steps[0]], "read"), /至少需要保留一个步骤/);
});
