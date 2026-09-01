import assert from "node:assert/strict";
import test from "node:test";
import { canonicalBuildContext, generationAttemptBudget, generationClientBudget } from "../app/generation-request.ts";

test("canonical build removes only repeated projections, preserving complete contract and final decisions", () => {
  const ir = {
    compiler: "skillcanvas", identity: { intent: "Compare products" },
    requirements: Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, statement: `rule ${i}: ${"完整要求。".repeat(800)}` })),
    capabilities: [{ id: "report" }, { id: "last-tool", input: "$final-content", output: "$saved-file" }],
    runtimeContract: { workflow: [{ id: "confirm", produces: ["$confirmed"] }] },
    controlModel: { stop: "final approval required" },
    domainEvidence: [{ action: "source-backed rule" }],
    evaluationPlan: { cases: [{ prompt: "请避免“示例中的错误行为”。" }] },
  };
  const answers = Array.from({ length: 16 }, (_, i) => ({ dimension: `${i}`, answer: `confirmed ${i}`, evidenceType: i === 15 ? "negative-example" : "positive-requirement" }));
  const body = { skillIR: ir, idea: "产品分析", sourceText: "material".repeat(12000), blueprint: { marker: "duplicate-blueprint" }, capabilityPlan: { marker: "duplicate-plan" }, loopPlan: { marker: "duplicate-loop" } };
  const snapshot = structuredClone(body);
  const result = JSON.parse(canonicalBuildContext(body, answers));
  assert.deepEqual(result.canonicalSkillIR, ir);
  assert.deepEqual(result.confirmedInterviewEvidence, answers);
  assert.equal(result.userProvidedMaterial, body.sourceText);
  assert.deepEqual(body, snapshot, "transport must not modify the saved instance");
  assert.doesNotMatch(JSON.stringify(result), /duplicate-blueprint|duplicate-plan|duplicate-loop/);
});

test("missing or legacy canonical contracts keep the legacy prompt inputs", () => {
  for (const skillIR of [null, {}, "{}", { compiler: "skillcanvas", identity: {} }]) {
    assert.equal(canonicalBuildContext({ skillIR }, []), null);
  }
});

test("build/repair have progress-aware bounded attempts and a longer shared client envelope", () => {
  for (const mode of ["build", "repair"]) {
    const first = generationAttemptBudget(mode, 1), second = generationAttemptBudget(mode, 2);
    assert.equal(first.idleMs, 60000);
    assert.equal(first.totalMs, 180000);
    assert.equal(second.totalMs, 120000);
    assert.ok(generationClientBudget(mode) > first.totalMs + second.totalMs);
  }
  assert.equal(generationClientBudget("ping"), null);
});
