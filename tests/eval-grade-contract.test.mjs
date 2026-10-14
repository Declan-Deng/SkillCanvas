import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { normalizeGradingEnvelope, singleCaseGradingRequest, SINGLE_CASE_GRADE_SCHEMA } from "../app/eval-grade-contract.ts";

test("single-case grading keeps all evidence while removing one unstable array wrapper", () => {
  const flat = { caseId: "review", passed: false, assertions: [{ text: "不得虚构", passed: false, evidence: "不可追溯的数字" }], claims: [{ verified: false }], dimensions: [], textualFeedback: { criticalProblems: [{ critique: "事实越界" }], preserve: ["保留来源"] }, failedCases: [{ caseId: "review" }] };
  const projected = normalizeGradingEnvelope(flat, "review");
  assert.deepEqual(projected.grades[0].assertions, flat.assertions);
  assert.deepEqual(projected.grades[0].claims, flat.claims);
  assert.equal(projected.grades[0].passed, false);
  assert.deepEqual(projected.textualFeedback, flat.textualFeedback);
  assert.deepEqual(projected.failedCases, flat.failedCases);
  assert.equal(flat.grades, undefined, "normalization does not mutate model evidence");
});

test("all effect evaluators preserve honest unknowns and do not manufacture feedback to fill a quota", () => {
  const source = readFileSync(new URL("../app/api/ai/route.ts", import.meta.url), "utf8");
  assert.equal((source.match(/\$\{CONTRACT_OUTCOME_RULES\}/g) || []).length, 3);
  assert.match(source, /Return 0-6 feedbackOptions/);
  assert.match(source, /Return \[\] when none is supported/);
  assert.doesNotMatch(source, /For every score below 90, issue must identify/);
});

test("batch envelopes, wrong case ids and incomplete values are never guessed", () => {
  const batch = { grades: [{ caseId: "a" }, { caseId: "b" }] };
  assert.equal(normalizeGradingEnvelope(batch, "a"), batch);
  const wrong = { caseId: "other", passed: true };
  assert.equal(normalizeGradingEnvelope(wrong, "a"), wrong);
  for (const value of [null, [], "text", {}]) assert.equal(normalizeGradingEnvelope(value, "a"), value);
  assert.equal(singleCaseGradingRequest({ executions: [{ caseId: "a" }] }), true);
  assert.equal(singleCaseGradingRequest({ executions: batch.grades }), false);
  assert.match(SINGLE_CASE_GRADE_SCHEMA, /every frozen required\/forbidden assertion/);
});
