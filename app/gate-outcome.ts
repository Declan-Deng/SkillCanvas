export type GateKind = "deterministic-verification" | "comparative-validation" | "execution-observation";
export type GateVerdict = "not-run" | "running" | "satisfied" | "unsatisfied" | "observed";
export type EvidenceStrength = "none" | "deterministic" | "single-observation" | "repeated-held-out";

export type GateOutcome = {
  gateId: "build-static" | "optimization-held-out" | "demo-run";
  kind: GateKind;
  verdict: GateVerdict;
  evidenceStrength: EvidenceStrength;
  reproducibility: "not-applicable" | "deterministic" | "stochastic";
  evaluator: "local-compiler" | "model-context-isolated" | "runtime-executor";
  claim: string;
  sampleSize: number;
  evidenceRefs: string[];
  limitations: string[];
  policyId: string;
};

export const DEMO_SCORING_POLICY = {
  id: "demo-observation-rubric-v1",
  /** These thresholds classify the visible quality of this one observed output.
   * They never claim general reliability; evidence scope lives on GateOutcome. */
  observedGoodFloor: 85,
  observedWarningFloor: 60,
} as const;

export function demoScoringPolicyPrompt() {
  return `Demo scoring policy ${DEMO_SCORING_POLICY.id}:
- 0-${DEMO_SCORING_POLICY.observedWarningFloor - 1}: the observed result has a material usability or contract failure.
- ${DEMO_SCORING_POLICY.observedWarningFloor}-${DEMO_SCORING_POLICY.observedGoodFloor - 1}: usable in part, with a concrete visible gap.
- ${DEMO_SCORING_POLICY.observedGoodFloor}-100: strong to exceptional performance in this observed run.
Score only the visible quality of this output. Do not impose a special high-score ceiling because this is a single run. Evidence scope and general reliability are represented separately by the Demo GateOutcome and the repeated held-out Optimization outcome.`;
}

export function buildGateOutcome(input: {
  status: "idle" | "checking" | "repairing" | "passed" | "attention";
  frozen: boolean;
  blockers: string[];
  checks: string[];
}): GateOutcome {
  const running = input.status === "checking" || input.status === "repairing";
  const satisfied = input.frozen && input.blockers.length === 0;
  return {
    gateId: "build-static",
    kind: "deterministic-verification",
    verdict: running ? "running" : satisfied ? "satisfied" : input.status === "idle" ? "not-run" : "unsatisfied",
    evidenceStrength: input.status === "idle" ? "none" : "deterministic",
    reproducibility: "deterministic",
    evaluator: "local-compiler",
    claim: satisfied ? "当前 Bundle 满足确定性结构与契约检查" : "当前 Bundle 尚未满足全部确定性检查",
    sampleSize: input.checks.length,
    evidenceRefs: input.checks.slice(0, 12),
    limitations: ["只证明结构、路径、语法和跨文件契约；不证明任务效果"],
    policyId: "build-static-gate-v1",
  };
}

export function optimizationGateOutcome(input: {
  status: "idle" | "running" | "passed" | "attention";
  benchmarkRuns: number;
  passRate: number;
  lift: number;
  contractDigest: string;
  blindWinner: "baseline" | "candidate" | "tie" | "not-run";
  issues: string[];
}): GateOutcome {
  const satisfied = input.status === "passed";
  return {
    gateId: "optimization-held-out",
    kind: "comparative-validation",
    verdict: input.status === "running" ? "running" : satisfied ? "satisfied" : input.status === "idle" ? "not-run" : "unsatisfied",
    evidenceStrength: input.benchmarkRuns > 1 ? "repeated-held-out" : input.benchmarkRuns === 1 ? "single-observation" : "none",
    reproducibility: input.benchmarkRuns ? "stochastic" : "not-applicable",
    evaluator: "model-context-isolated",
    claim: satisfied ? "当前候选在冻结保留任务与回归条件下优于可接受基线" : "当前证据尚不能接受该候选",
    sampleSize: input.benchmarkRuns,
    evidenceRefs: [
      input.contractDigest ? `contract:${input.contractDigest}` : "",
      input.benchmarkRuns ? `runs:${input.benchmarkRuns}` : "",
      input.benchmarkRuns ? `pass-rate:${input.passRate}` : "",
      input.benchmarkRuns ? `skill-lift:${input.lift >= 0 ? "+" : ""}${input.lift}` : "",
      input.blindWinner !== "not-run" ? `blind-winner:${input.blindWinner}` : "",
    ].filter(Boolean),
    limitations: ["模型执行与评分具有随机性", "上下文隔离不等于独立模型", ...input.issues.slice(0, 3)],
    policyId: "optimization-held-out-gate-v1",
  };
}

export function demoGateOutcome(input: {
  demoPresent: boolean;
  reviewPending: boolean;
  reviewed: boolean;
  runCount: number;
  observedDimensions: number;
}): GateOutcome {
  const observed = input.demoPresent;
  return {
    gateId: "demo-run",
    kind: "execution-observation",
    verdict: observed ? "observed" : input.reviewPending ? "running" : "not-run",
    evidenceStrength: observed ? "single-observation" : "none",
    reproducibility: observed ? "stochastic" : "not-applicable",
    evaluator: "runtime-executor",
    claim: observed ? "已得到一次可查看的真实任务输出" : "尚未产生可观察的 Demo 输出",
    sampleSize: observed ? 1 : 0,
    evidenceRefs: [input.runCount ? `demo-run:${input.runCount}` : "", input.reviewed ? `reviewed-dimensions:${input.observedDimensions}` : ""].filter(Boolean),
    limitations: ["一次 Demo 只证明该输入下发生了什么，不证明稳定性或全面质量"],
    policyId: DEMO_SCORING_POLICY.id,
  };
}
