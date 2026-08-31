import assert from "node:assert/strict";
import test from "node:test";

import {
  auditCapabilityClosure,
  artifactDeliveryRequested,
  decideGenerationGoalGate,
  generationEvaluationAtCeiling,
  generationGoalSatisfied,
  inferArtifactPatterns,
  reconcileArtifactOutputContract,
  removeResolvedFileObservations,
  reusableOutputAssetRequested,
  screenCandidateBehavior,
  summarizeGenerationEvidence,
} from "../app/generation-loop-core.ts";

test("restored passed Loops hide observations for compiler-removed files", () => {
  const issues = [
    "P2 · references/weak-playbook.md 使用了低质量来源",
    "P2 · 输出仍可进一步简化",
    "P2 · scripts/export.py 需要继续观察",
  ];
  assert.deepEqual(removeResolvedFileObservations(issues, { "scripts/export.py": "print('ok')" }), [
    "P2 · 输出仍可进一步简化",
    "P2 · scripts/export.py 需要继续观察",
  ]);
});

function report(scores, passed = true) {
  return {
    cases: scores.map((score, index) => ({
      caseId: `case-${index + 1}`,
      prompt: `prompt ${index + 1}`,
      output: `output ${index + 1}`,
      triggered: true,
      score,
      passed,
      evidence: "observable result",
      failureReason: "",
      dimensions: [{ label: "goal", score, evidence: "goal evidence" }],
    })),
    failurePatterns: [],
  };
}

test("artifact contracts receive inspectable patterns instead of an empty gate", () => {
  assert.deepEqual(inferArtifactPatterns("最终交付 PDF 报告和 Excel 表格"), ["outputs/*.pdf", "outputs/*.xlsx"]);
  assert.deepEqual(inferArtifactPatterns("最终交付代码或其他可运行文件"), ["outputs/**"]);
  assert.deepEqual(reconcileArtifactOutputContract({
    mode: "mixed",
    artifactPatterns: [],
    description: "交付 PDF 文件",
    requiresArtifact: true,
  }), { mode: "mixed", artifactPatterns: ["outputs/*.pdf"] });
});

test("artifact delivery and reusable assets require direct user evidence", () => {
  assert.equal(artifactDeliveryRequested("读取 CSV 文件并给出文本建议"), false);
  assert.equal(artifactDeliveryRequested("交付一份 Markdown 报告和 CSV 表格"), true);
  assert.deepEqual(inferArtifactPatterns("读取两份 PDF 说明书，生成 Markdown 对比表。"), ["outputs/*.md"]);
  assert.deepEqual(inferArtifactPatterns("导入 CSV 数据后输出 Excel 文件"), ["outputs/*.xlsx"]);
  assert.deepEqual(inferArtifactPatterns("read a PDF and generate a Markdown file"), ["outputs/*.md"]);
  assert.equal(artifactDeliveryRequested("创建一个技能，读取 PDF 并分析其中的文本"), false);
  assert.equal(reusableOutputAssetRequested("将排序规则写入技能包，后续直接使用"), false);
  assert.equal(reusableOutputAssetRequested("保存这次确认的 CSV 表头和输出格式，以后复用"), true);
});

test("capability closure requires implementation, runtime routing, and executable eval coverage", () => {
  const capabilities = [
    { id: "core", kind: "llm", path: "SKILL.md", layer: "runtime", status: "generate", enabled: true },
    { id: "rules", kind: "reference", path: "references/rules.md", layer: "runtime", status: "generate", enabled: true },
  ];
  const closed = auditCapabilityClosure({
    "SKILL.md": "Use references/rules.md when the task needs the domain rule.",
    "references/rules.md": "# Domain rules\nSpecific decision rule.",
    "evals/capability-manifest.json": JSON.stringify({ capabilities }),
    "evals/evals.json": JSON.stringify({ evals: [
      { id: "core-1", eval_family: "capability", capability_ids: ["core"], expected: { behaviors: ["complete task"] }, graders: ["core_capability"] },
      { id: "rules-1", eval_family: "grounding", capability_ids: ["rules"], expected: { behaviors: ["apply rule"] }, graders: ["grounding"] },
    ] }),
  }, capabilities);
  assert.equal(closed.score, 100);
  assert.equal(closed.issues.filter((item) => item.severity === "critical").length, 0);

  const broken = auditCapabilityClosure({
    "SKILL.md": "Complete the task.",
    "evals/capability-manifest.json": JSON.stringify({ capabilities }),
    "evals/evals.json": JSON.stringify({ evals: [{ id: "core-1", eval_family: "capability", capability_ids: ["core"], expected: { behaviors: ["complete task"] }, graders: ["core_capability"] }] }),
  }, capabilities);
  assert.ok(broken.score < 100);
  assert.ok(broken.issues.some((item) => item.type === "missing-implementation"));
  assert.ok(broken.issues.some((item) => item.type === "missing-eval"));
});

test("a core eval with a missing-input checkpoint cannot prove capability closure", () => {
  const capabilities = [{ id: "core", kind: "llm", path: "SKILL.md", layer: "runtime", status: "generate", enabled: true }];
  const report = auditCapabilityClosure({
    "SKILL.md": "Complete the task.",
    "evals/capability-manifest.json": JSON.stringify({ capabilities }),
    "evals/evals.json": JSON.stringify({ evals: [{
      id: "core-empty",
      eval_family: "capability",
      category: "core_capability",
      capability_ids: ["core"],
      context: { workflow_checkpoint: "required-value-missing" },
      expected: { behaviors: ["produce the final result"] },
      graders: ["core_capability"],
    }] }),
  }, capabilities);
  assert.ok(report.issues.some((item) => item.type === "missing-eval" && item.capabilityId === "core"));
});

test("generation gate accepts only held-out improvement without closure or behavior regression", () => {
  const baseline = report([72, 74]);
  const improved = report([82, 84]);
  const accepted = decideGenerationGoalGate({
    baseline,
    candidate: improved,
    caseIds: ["case-1", "case-2"],
    baselineClosure: 100,
    candidateClosure: 100,
    baselineBlockers: 0,
    candidateBlockers: 0,
    baselineCriticalSemanticIssues: 0,
    candidateCriticalSemanticIssues: 0,
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.scoreDelta, 10);

  const regressed = report([86, 60]);
  regressed.cases[1].passed = false;
  const rejected = decideGenerationGoalGate({
    baseline: improved,
    candidate: regressed,
    caseIds: ["case-1", "case-2"],
    baselineClosure: 100,
    candidateClosure: 90,
    baselineBlockers: 0,
    candidateBlockers: 1,
    baselineCriticalSemanticIssues: 0,
    candidateCriticalSemanticIssues: 1,
  });
  assert.equal(rejected.accepted, false);
  assert.ok(rejected.reasons.some((reason) => reason.includes("能力闭环")));
  assert.ok(rejected.regressions.length > 0);
});

test("generation gate rejects score-only improvement when every held-out case still fails", () => {
  const baseline = report([30, 30], false);
  const candidate = report([35, 38], false);
  const decision = decideGenerationGoalGate({
    baseline,
    candidate,
    caseIds: ["case-1", "case-2"],
    baselineClosure: 100,
    candidateClosure: 100,
    baselineBlockers: 0,
    candidateBlockers: 0,
    baselineCriticalSemanticIssues: 0,
    candidateCriticalSemanticIssues: 0,
  });
  assert.equal(decision.accepted, false);
  assert.ok(decision.reasons.some((reason) => reason.includes("没有通过任何保留任务")));
});

test("final-output screen stops an obvious regression before deep evaluation", () => {
  const baseline = report([40, 40], false);
  const regressed = report([32, 30], false);
  const screen = screenCandidateBehavior({ baseline, candidate: regressed, caseIds: ["case-1", "case-2"] });
  assert.equal(screen.advance, false);
  assert.equal(screen.scoreDelta, -9);
  assert.match(screen.reasons.join("；"), /最终产物明显回退|仍未通过任何任务/);

  const equivalent = report([40, 40], false);
  assert.equal(screenCandidateBehavior({ baseline, candidate: equivalent, caseIds: ["case-1", "case-2"] }).advance, true);
});

test("generation gate accepts deterministic Skill quality improvement when held-out behavior does not regress", () => {
  const baseline = report([84, 86]);
  const candidate = report([84, 86]);
  const decision = decideGenerationGoalGate({
    baseline,
    candidate,
    caseIds: ["case-1", "case-2"],
    baselineClosure: 100,
    candidateClosure: 100,
    baselineBlockers: 0,
    candidateBlockers: 0,
    baselineCriticalSemanticIssues: 0,
    candidateCriticalSemanticIssues: 0,
    baselineQualityScore: 72,
    candidateQualityScore: 86,
  });
  assert.equal(decision.accepted, true);
  assert.equal(decision.scoreDelta, 0);
});

test("generation goal requires closure, pass rate, usable quality, and measurable lift", () => {
  const baseline = summarizeGenerationEvidence(report([70, 72]));
  const candidate = summarizeGenerationEvidence(report([84, 86]));
  assert.equal(generationGoalSatisfied({ evidence: candidate, baseline, closureScore: 100, blockers: 0, criticalSemanticIssues: 0 }), true);
  assert.equal(generationGoalSatisfied({ evidence: candidate, baseline, closureScore: 75, blockers: 0, criticalSemanticIssues: 0 }), false);
  assert.equal(generationGoalSatisfied({ evidence: candidate, baseline, closureScore: 100, blockers: 0, criticalSemanticIssues: 1 }), false);
});

test("a perfect baseline and bundle are a completed no-headroom result, not a quality warning", () => {
  const baseline = summarizeGenerationEvidence(report([100, 100]));
  const candidate = summarizeGenerationEvidence(report([100, 100]));
  assert.equal(generationEvaluationAtCeiling({ evidence: candidate, baseline, closureScore: 100, blockers: 0, criticalSemanticIssues: 0 }), true);
  assert.equal(generationEvaluationAtCeiling({ evidence: candidate, baseline, closureScore: 100, blockers: 1, criticalSemanticIssues: 0 }), false);
  assert.equal(generationEvaluationAtCeiling({ evidence: summarizeGenerationEvidence(report([98, 100])), baseline, closureScore: 100, blockers: 0, criticalSemanticIssues: 0 }), false);
});
