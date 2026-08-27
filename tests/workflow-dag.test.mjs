import assert from "node:assert/strict";
import test from "node:test";

import { compileWorkflowDag } from "../app/workflow-dag.ts";

const step = (id, requires, produces) => ({ id, capabilityIds: [id], when: "always", input: "input", action: id, output: "output", fallback: "stop", requires, produces, mutates: [] });

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
