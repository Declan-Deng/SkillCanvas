import assert from "node:assert/strict";
import test from "node:test";

import {
  DEMO_SCORING_POLICY,
  buildGateOutcome,
  demoGateOutcome,
  demoScoringPolicyPrompt,
  qualityScoringPolicyPrompt,
  optimizationGateOutcome,
} from "../app/gate-outcome.ts";

test("each stage exposes a different evidence contract instead of one generic pass flag", () => {
  const build = buildGateOutcome({ status: "passed", frozen: true, blockers: [], checks: ["json", "paths"] });
  const optimization = optimizationGateOutcome({
    status: "passed",
    caseCount: 3,
    repeatsPerCase: 2,
    benchmarkRuns: 6,
    passRate: 88,
    lift: 9,
    contractDigest: "abc123",
    blindWinner: "candidate",
    issues: [],
  });
  const demo = demoGateOutcome({ demoPresent: true, reviewPending: false, reviewed: true, runCount: 1, observedDimensions: 4 });

  assert.equal(build.kind, "deterministic-verification");
  assert.equal(build.evidenceStrength, "deterministic");
  assert.equal(build.reproducibility, "deterministic");
  assert.equal(optimization.kind, "comparative-validation");
  assert.equal(optimization.evidenceStrength, "repeated-held-out");
  assert.equal(optimization.sampleSize, 3);
  assert.equal(optimization.reproducibility, "stochastic");
  assert.equal(demo.kind, "execution-observation");
  assert.equal(demo.verdict, "observed");
  assert.notEqual(demo.verdict, build.verdict);
});

test("multiple cases are not mislabeled as repeated evidence", () => {
  const optimization = optimizationGateOutcome({
    status: "attention",
    caseCount: 6,
    repeatsPerCase: 1,
    benchmarkRuns: 6,
    passRate: 100,
    lift: 0,
    contractDigest: "single-run-contract",
    blindWinner: "tie",
    issues: [],
  });
  assert.equal(optimization.evidenceStrength, "single-observation");
  assert.equal(optimization.sampleSize, 6);
  assert.ok(optimization.evidenceRefs.includes("repeats-per-case:1"));
});

test("Demo quality is not capped to compensate for weak evidence", () => {
  assert.match(demoScoringPolicyPrompt(), /shared-five-dimension-rubric-v2/);
  assert.match(demoScoringPolicyPrompt(), /do not impose a special high-score ceiling/i);
  assert.doesNotMatch(demoScoringPolicyPrompt(), /\b92\b/);
  assert.equal("strongSingleRunCeiling" in DEMO_SCORING_POLICY, false);
});

test("Demo and held-out grading share the same explicit score anchors", () => {
  const policy = qualityScoringPolicyPrompt();
  for (const anchor of [50, 70, 85, 95, 100]) assert.match(policy, new RegExp(`\\b${anchor}\\b`));
  assert.match(demoScoringPolicyPrompt(), /single-scenario score is not directly interchangeable/i);
});
