import assert from "node:assert/strict";
import test from "node:test";

import {
  DEMO_SCORING_POLICY,
  buildGateOutcome,
  demoGateOutcome,
  demoScoringPolicyPrompt,
  optimizationGateOutcome,
} from "../app/gate-outcome.ts";

test("each stage exposes a different evidence contract instead of one generic pass flag", () => {
  const build = buildGateOutcome({ status: "passed", frozen: true, blockers: [], checks: ["json", "paths"] });
  const optimization = optimizationGateOutcome({
    status: "passed",
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
  assert.equal(optimization.reproducibility, "stochastic");
  assert.equal(demo.kind, "execution-observation");
  assert.equal(demo.verdict, "observed");
  assert.notEqual(demo.verdict, build.verdict);
});

test("Demo quality is not capped to compensate for weak evidence", () => {
  assert.match(demoScoringPolicyPrompt(), /demo-observation-rubric-v1/);
  assert.match(demoScoringPolicyPrompt(), /do not impose a special high-score ceiling/i);
  assert.doesNotMatch(demoScoringPolicyPrompt(), /\b92\b/);
  assert.equal("strongSingleRunCeiling" in DEMO_SCORING_POLICY, false);
});
