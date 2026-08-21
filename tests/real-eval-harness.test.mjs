import assert from "node:assert/strict";
import test from "node:test";

import {
  anonymizeComparison,
  buildHarnessReport,
  freezeEvalContract,
  normalizeBlindComparison,
  normalizeHarnessExecutions,
  normalizeHarnessGrades,
  publicExecutionContract,
  runtimeSkillBundle,
} from "../app/real-eval-harness.ts";

const labels = [
  "知道什么时候该帮你",
  "会不会按你的方式推进",
  "结果像不像你要的",
  "有没有用对你的资料",
  "换个场景还能不能做好",
];

function cases() {
  return [
    {
      id: "core-1",
      family: "capability",
      category: "core_capability",
      shouldTrigger: true,
      prompt: "请根据这份岗位要求调整我的简历，并直接交付可使用的版本。",
      context: { jd: "AI 产品经理，需要评测与 Agent workflow 经验" },
      capabilityIds: ["resume-tailoring"],
      expected: {
        behaviors: ["匹配岗位要求并重写相关经历"],
        mustNot: ["忽略岗位要求只润色原文"],
        artifacts: [],
      },
      graders: ["capability"],
      split: "selection",
    },
    {
      id: "negative-1",
      family: "trigger",
      category: "trigger_negative",
      shouldTrigger: false,
      prompt: "请解释一下常见简历版式有哪些，不要修改我的简历。",
      context: {},
      capabilityIds: [],
      expected: {
        behaviors: ["识别为相邻但不应触发的请求"],
        mustNot: ["擅自开始改写简历"],
        artifacts: [],
      },
      graders: ["trigger"],
      split: "selection",
    },
  ];
}

function executionPayload(runIndex, scoreSuffix = "") {
  return {
    executions: [
      { caseId: "core-1", triggered: true, output: `已按 JD 重写相关经历${scoreSuffix}`, artifacts: [], trace: ["读取 JD", "匹配证据"] },
      { caseId: "negative-1", triggered: false, output: "以下只解释版式，不改写简历。", artifacts: [], trace: ["识别相邻请求"] },
    ],
    runIndex,
  };
}

function gradePayload(score) {
  return {
    grades: cases().map((item) => ({
      caseId: item.id,
      score,
      passed: true,
      evidence: `${item.id} 有可观察输出`,
      failureReason: "",
      dimensions: labels.map((label) => ({ label, score, evidence: `${label} 可观察证据` })),
      assertions: [...item.expected.behaviors, ...item.expected.mustNot].map((text) => ({ text, passed: true, evidence: "输出满足该冻结断言" })),
    })),
    textualFeedback: {
      summary: "整体完成，但要保留已验证的触发边界。",
      criticalProblems: [{
        id: "tailoring-depth",
        critique: "能力匹配仍停留在关键词层。",
        direction: "建立需求与证据的逐项映射，再决定改写优先级。",
        caseIds: ["core-1"],
        affectedCapabilities: ["resume-tailoring"],
      }],
      preserve: ["相邻解释任务保持不触发"],
    },
    failedCases: [],
  };
}

test("freezes a stable private contract while withholding answers from the executor", () => {
  const first = freezeEvalContract(cases());
  const second = freezeEvalContract(cases());
  assert.equal(first.digest, second.digest);
  const visible = publicExecutionContract(first);
  assert.equal(visible.digest, first.digest);
  assert.equal("expected" in visible.cases[0], false);
  assert.equal("graders" in visible.cases[0], false);
  assert.equal("shouldTrigger" in visible.cases[0], false);
});

test("executor runtime bundle excludes hidden eval contracts and bounds large resources", () => {
  const bundle = runtimeSkillBundle({
    "SKILL.md": "# Runtime instructions",
    "references/domain.md": "x".repeat(90_000),
    "scripts/check.py": "print('ok')",
    "evals/evals.json": JSON.stringify({ expected: "hidden assertion" }),
    "evals/graders.json": JSON.stringify({ rubric: "hidden rubric" }),
    "agents/openai.yaml": "interface: hidden metadata",
  }, 40_000);
  assert.ok(bundle["SKILL.md"]);
  assert.ok(bundle["references/domain.md"]);
  assert.equal("evals/evals.json" in bundle, false);
  assert.equal("evals/graders.json" in bundle, false);
  assert.equal("agents/openai.yaml" in bundle, false);
  assert.ok(JSON.stringify(bundle).length < 45_000);
});

test("separates execution and grading, enforces frozen assertions, and aggregates repeated runs", () => {
  const contract = freezeEvalContract(cases());
  const runOne = normalizeHarnessExecutions({ value: executionPayload(1), contract, configuration: "candidate", runIndex: 1, durationMs: 1200 });
  const runTwo = normalizeHarnessExecutions({ value: executionPayload(2, "（第二次）"), contract, configuration: "candidate", runIndex: 2, durationMs: 1400 });
  assert.ok(runOne && runTwo);
  const gradesOne = normalizeHarnessGrades({ value: gradePayload(80), contract, executions: runOne });
  const gradesTwo = normalizeHarnessGrades({ value: gradePayload(90), contract, executions: runTwo });
  assert.ok(gradesOne && gradesTwo);
  const report = buildHarnessReport({ contract, configuration: "candidate", executions: [...runOne, ...runTwo], grades: [...gradesOne, ...gradesTwo] });
  assert.equal(report.benchmark.runs, 4);
  assert.equal(report.benchmark.score.mean, 85);
  assert.ok(report.benchmark.score.stddev > 0);
  assert.equal(report.evidence.cases.every((item) => item.passed), true);
  assert.equal(report.evidence.textualFeedback.criticalProblems[0].id, "tailoring-depth");
  assert.deepEqual(report.evidence.textualFeedback.preserve, ["相邻解释任务保持不触发"]);

  const incomplete = gradePayload(90);
  incomplete.grades[0].assertions.pop();
  const guarded = normalizeHarnessGrades({ value: incomplete, contract, executions: runOne });
  assert.ok(guarded);
  assert.equal(guarded[0].passed, false);
  assert.equal(guarded[0].score, 79);
  assert.match(guarded[0].failureReason, /冻结断言/);
});

test("failed-case context reaches the optimizer without leaking held-out prompts", () => {
  const contract = freezeEvalContract(cases());
  const executions = normalizeHarnessExecutions({ value: executionPayload(1), contract, configuration: "candidate", runIndex: 1, durationMs: 900 });
  assert.ok(executions);
  const payload = gradePayload(42);
  payload.grades[0].passed = false;
  payload.grades[0].assertions[0].passed = false;
  payload.failedCases = [{ caseId: "core-1", failureSummary: "没有完成岗位要求与经历证据的映射", observedEvidence: "输出只做了表层润色" }];
  const grades = normalizeHarnessGrades({ value: payload, contract, executions });
  assert.ok(grades);
  const report = buildHarnessReport({ contract, configuration: "candidate", executions, grades });
  assert.equal(report.evidence.failedCases[0].caseId, "core-1");
  assert.equal("inputPrompt" in report.evidence.failedCases[0], false);
  assert.match(report.evidence.failedCases[0].failureSummary, /岗位要求/);
});

test("resolved repeated-run failures remain variance evidence instead of current patch blockers", () => {
  const contract = freezeEvalContract(cases());
  const executions = [1, 2, 3].flatMap((runIndex) => {
    const normalized = normalizeHarnessExecutions({
      value: executionPayload(runIndex, `（第 ${runIndex} 次）`),
      contract,
      configuration: "candidate",
      runIndex,
      durationMs: 1000 + runIndex,
    });
    assert.ok(normalized);
    return normalized;
  });
  const grades = [1, 2, 3].flatMap((runIndex) => {
    const runExecutions = executions.filter((item) => item.runIndex === runIndex);
    const payload = gradePayload(85);
    if (runIndex === 1) payload.grades[0].assertions[0].passed = false;
    const normalized = normalizeHarnessGrades({ value: payload, contract, executions: runExecutions });
    assert.ok(normalized);
    return normalized;
  });
  const report = buildHarnessReport({ contract, configuration: "candidate", executions, grades });
  assert.equal(report.evidence.cases.every((item) => item.passed), true);
  assert.deepEqual(report.evidence.failurePatterns, []);
  assert.ok(report.benchmark.passRate < 100, "the intermittent failure must remain visible in aggregate stability metrics");
});

test("anonymizes candidate identity before pairwise comparison", () => {
  const contract = freezeEvalContract(cases());
  const baselineExecutions = normalizeHarnessExecutions({ value: executionPayload(1), contract, configuration: "without_skill", runIndex: 1, durationMs: 1000 });
  const candidateExecutions = normalizeHarnessExecutions({ value: executionPayload(1, "候选"), contract, configuration: "candidate", runIndex: 1, durationMs: 1000 });
  assert.ok(baselineExecutions && candidateExecutions);
  const baselineGrades = normalizeHarnessGrades({ value: gradePayload(70), contract, executions: baselineExecutions });
  const candidateGrades = normalizeHarnessGrades({ value: gradePayload(90), contract, executions: candidateExecutions });
  assert.ok(baselineGrades && candidateGrades);
  const baseline = buildHarnessReport({ contract, configuration: "without_skill", executions: baselineExecutions, grades: baselineGrades });
  const candidate = buildHarnessReport({ contract, configuration: "candidate", executions: candidateExecutions, grades: candidateGrades });
  const blinded = anonymizeComparison(baseline, candidate);
  assert.equal(JSON.stringify(blinded.payload).includes("without_skill"), false);
  assert.equal(JSON.stringify(blinded.payload).includes('"candidate"'), false);
  const comparison = normalizeBlindComparison({
    winner: "B",
    confidence: 0.9,
    evidence: "B 更完整",
    caseResults: cases().map((item) => ({ caseId: item.id, winner: "B", evidence: "B 满足更多冻结要求" })),
  }, cases().map((item) => item.id));
  assert.ok(comparison);
  assert.equal(comparison.caseResults.length, 2);
});
