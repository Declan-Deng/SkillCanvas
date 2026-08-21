import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateDimensionScore,
  decideCandidateCommitGate,
  decideOptimizationGate,
  heldOutCapabilityCoverage,
  normalizeOptimizationEvidence,
  parseAndSplitEvalCases,
  sampleOptimizationCases,
} from "../app/optimizer-core.ts";

const labels = [
  "知道什么时候该帮你",
  "会不会按你的方式推进",
  "结果像不像你要的",
  "有没有用对你的资料",
  "换个场景还能不能做好",
];

function evalBank() {
  const categories = ["trigger_explicit", "trigger_implicit", "trigger_context", "trigger_negative", "core_capability", "failure_mode"];
  return JSON.stringify({
    evals: Array.from({ length: 16 }, (_, index) => ({
      id: `case-${index + 1}`,
      category: categories[index % categories.length],
      should_trigger: categories[index % categories.length] !== "trigger_negative",
      prompt: `这是第 ${index + 1} 条完整、真实且可以执行的测试任务，请直接完成。`,
      capability_ids: ["core"],
      expected: { behaviors: ["产生可观察结果"], must_not: ["只解释不交付"], artifacts: [] },
      graders: ["core_capability"],
    })),
  });
}

function report(caseIds, targetScore, otherScore = 86) {
  return {
    cases: caseIds.map((caseId) => ({
      caseId,
      prompt: `prompt ${caseId}`,
      output: `output ${caseId}`,
      triggered: true,
      score: targetScore,
      passed: true,
      evidence: `${caseId} produced a usable result`,
      failureReason: "",
      dimensions: labels.map((label) => ({
        label,
        score: label === "结果像不像你要的" ? targetScore : otherScore,
        evidence: `${label} evidence from ${caseId}`,
      })),
    })),
    failurePatterns: [],
    textualFeedback: {
      summary: "跨用例反馈",
      criticalProblems: [{ id: "shared-gap", critique: "共享行为缺口", direction: "修复共享规则", caseIds, affectedCapabilities: ["core"] }],
      preserve: ["保留已通过的触发边界"],
    },
    failedCases: [],
  };
}

test("eval bank is deterministically split into disjoint train, selection, and untouched test groups", () => {
  const first = parseAndSplitEvalCases(evalBank());
  const second = parseAndSplitEvalCases(evalBank());
  assert.deepEqual(first, second);
  assert.equal(first.length, 16);
  assert.ok(first.some((item) => item.split === "train"));
  assert.ok(first.some((item) => item.split === "selection"));
  assert.ok(first.some((item) => item.split === "test"));

  const train = sampleOptimizationCases(first, "train", 4);
  const selection = sampleOptimizationCases(first, "selection", 4);
  const testIds = new Set(first.filter((item) => item.split === "test").map((item) => item.id));
  assert.ok(train.length >= 2);
  assert.ok(selection.length >= 2);
  assert.equal(train.some((item) => selection.some((candidate) => candidate.id === item.id)), false);
  assert.equal([...train, ...selection].some((item) => testIds.has(item.id)), false);
});

test("held-out split covers every active capability even when capabilities are sparse", () => {
  const capabilities = ["core-text", "core-script-export", "core-host-file-workspace", "core-mcp-calendar"];
  const bank = JSON.stringify({
    evals: Array.from({ length: 16 }, (_, index) => ({
      id: `stratified-${index + 1}`,
      category: index < 4 ? "integration" : index < 8 ? "core_capability" : index < 12 ? "trigger_implicit" : "failure_mode",
      eval_family: index < 4 ? "integration" : index < 8 ? "capability" : index < 12 ? "trigger" : "grounding",
      should_trigger: true,
      prompt: `这是第 ${index + 1} 条用于验证能力分层抽样的完整任务输入。`,
      capability_ids: index < 4 ? [capabilities[index]] : ["core-text"],
      expected: { behaviors: ["产生可观察结果"], must_not: [], artifacts: index === 1 ? ["outputs/*.pdf"] : [] },
      graders: ["core_capability"],
    })),
  });
  const parsed = parseAndSplitEvalCases(bank);
  const coverage = heldOutCapabilityCoverage(parsed, capabilities);
  assert.deepEqual(coverage.missing, []);
  const selection = sampleOptimizationCases(parsed, "selection", 2, { requiredCapabilityIds: capabilities });
  const selectedCapabilities = new Set(selection.flatMap((item) => item.capabilityIds));
  capabilities.forEach((id) => assert.equal(selectedCapabilities.has(id), true, `${id} should be held out`));
});

test("evidence requires one complete result for every held-out case", () => {
  const caseIds = ["case-a", "case-b"];
  const normalized = normalizeOptimizationEvidence(report(caseIds, 78), caseIds);
  assert.ok(normalized);
  assert.equal(normalized.textualFeedback.criticalProblems[0].direction, "修复共享规则");
  assert.deepEqual(normalized.textualFeedback.preserve, ["保留已通过的触发边界"]);
  assert.equal(normalizeOptimizationEvidence(report(["case-a"], 78), caseIds), null);
});

test("candidate is accepted only after strict target improvement without protected regressions", () => {
  const caseIds = ["case-a", "case-b", "case-c"];
  const baseline = report(caseIds, 72, 86);
  const improved = report(caseIds, 81, 84);
  assert.equal(aggregateDimensionScore(improved, caseIds, "结果像不像你要的"), 81);
  const accepted = decideOptimizationGate({
    baseline,
    candidate: improved,
    selectionCaseIds: caseIds,
    targetLabel: "结果像不像你要的",
    protectedLabels: labels,
    baselineBlockers: 0,
    candidateBlockers: 0,
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.delta, 9);

  const regressed = report(caseIds, 84, 76);
  const rejected = decideOptimizationGate({
    baseline,
    candidate: regressed,
    selectionCaseIds: caseIds,
    targetLabel: "结果像不像你要的",
    protectedLabels: labels,
    baselineBlockers: 0,
    candidateBlockers: 1,
  });
  assert.equal(rejected.accepted, false);
  assert.ok(rejected.reasons.some((reason) => reason.includes("发布检查")));
  assert.ok(rejected.regressions.length > 0);
});

test("personalization uses the same commit gate and cannot regress an accepted property", () => {
  const caseIds = ["case-a", "case-b", "case-c"];
  const baseline = report(caseIds, 82, 88);
  const preserved = report(caseIds, 82, 87);
  const accepted = decideCandidateCommitGate({
    baseline,
    candidate: preserved,
    selectionCaseIds: caseIds,
    targetLabel: "结果像不像你要的",
    protectedLabels: labels,
    baselineBlockers: 0,
    candidateBlockers: 0,
    mode: "preserve-and-satisfy",
    requirementChecks: [{ id: "feedback-1", satisfied: true, detail: "已写入运行规则" }],
  });
  assert.equal(accepted.accepted, true);

  const regressed = report(caseIds, 90, 76);
  const rejected = decideCandidateCommitGate({
    baseline,
    candidate: regressed,
    selectionCaseIds: caseIds,
    targetLabel: "结果像不像你要的",
    protectedLabels: labels,
    baselineBlockers: 0,
    candidateBlockers: 0,
    mode: "preserve-and-satisfy",
    requirementChecks: [{ id: "feedback-1", satisfied: true, detail: "已写入运行规则" }],
  });
  assert.equal(rejected.accepted, false);
  assert.ok(rejected.regressions.length > 0);

  const targetRegressed = decideCandidateCommitGate({
    baseline,
    candidate: report(caseIds, 70, 88),
    selectionCaseIds: caseIds,
    targetLabel: "结果像不像你要的",
    protectedLabels: labels,
    baselineBlockers: 0,
    candidateBlockers: 0,
    mode: "preserve-and-satisfy",
    requirementChecks: [{ id: "feedback-1", satisfied: true, detail: "已写入运行规则" }],
  });
  assert.equal(targetRegressed.accepted, false);
  assert.ok(targetRegressed.regressions.some((item) => item.includes("结果像不像你要的")));
});
