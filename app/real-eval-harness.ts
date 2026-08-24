/**
 * Provider-neutral evaluation harness for generated Skills.
 *
 * Workflow concepts are adapted from Anthropic's Apache-2.0 skill-creator
 * (anthropics/skills, commit f6656c1256d5a8adfa37db9110046ef20bac644c):
 * freeze evals, execute candidate and baseline independently, grade only after
 * execution, retain repeated runs, and compare distributions instead of a
 * single self-assigned score. This TypeScript implementation is original and
 * targets SkillCanvas' multi-provider browser workflow.
 */

import type {
  DimensionGrade,
  FailedCaseEvidence,
  OptimizationCaseGrade,
  OptimizationEvidenceReport,
  SkillEvalCase,
  TextualGradientFeedback,
} from "./optimizer-core";

export type HarnessConfiguration = "without_skill" | "with_skill" | "old_skill" | "candidate";

export type FrozenEvalContract = {
  schemaVersion: "1.0";
  digest: string;
  cases: SkillEvalCase[];
};

export type HarnessExecution = {
  runId: string;
  caseId: string;
  configuration: HarnessConfiguration;
  runIndex: number;
  prompt: string;
  output: string;
  triggered: boolean;
  artifacts: Array<{ path: string; summary: string; content: string; verified: boolean }>;
  trace: string[];
  durationMs: number;
  outputChars: number;
};

export type AssertionGrade = {
  text: string;
  passed: boolean;
  evidence: string;
};

export type HarnessGrade = {
  runId: string;
  caseId: string;
  score: number;
  passed: boolean;
  evidence: string;
  failureReason: string;
  dimensions: DimensionGrade[];
  assertions: AssertionGrade[];
  claims: Array<{ claim: string; type: "factual" | "process" | "quality"; verified: boolean; evidence: string }>;
  evalFeedback: { suggestions: Array<{ assertion?: string; reason: string }>; overall: string };
  textualFeedback: TextualGradientFeedback;
  failedCase?: Pick<FailedCaseEvidence, "caseId" | "failureSummary" | "observedEvidence">;
};

export type HarnessBenchmark = {
  configuration: HarnessConfiguration;
  contractDigest: string;
  runs: number;
  cases: number;
  score: { mean: number; stddev: number; min: number; max: number };
  passRate: number;
  meanDurationMs: number;
  meanOutputChars: number;
};

export type HarnessReport = {
  contract: FrozenEvalContract;
  configuration: HarnessConfiguration;
  executions: HarnessExecution[];
  grades: HarnessGrade[];
  evidence: OptimizationEvidenceReport;
  benchmark: HarnessBenchmark;
};

export type BlindComparison = {
  winner: "A" | "B" | "tie";
  confidence: number;
  evidence: string;
  qualityScores: { A: number; B: number } | null;
  rubric: {
    criteria: Array<{ id: string; label: string; kind: "content" | "structure" }>;
    A: { criterionScores: Record<string, number>; criterionEvidence: Record<string, string>; overallScore: number; perfectScoreQualified: boolean; strengths: string[]; weaknesses: string[] };
    B: { criterionScores: Record<string, number>; criterionEvidence: Record<string, string>; overallScore: number; perfectScoreQualified: boolean; strengths: string[]; weaknesses: string[] };
  } | null;
  caseResults: Array<{ caseId: string; winner: "A" | "B" | "tie"; evidence: string }>;
};

/** Build the exact runtime view an executing Agent is allowed to see.
 * Evaluation contracts, graders, manifests, and interface metadata are
 * deliberately excluded: exposing them leaks hidden assertions into the
 * Executor and needlessly multiplies context size. Runtime files are bounded
 * because a real Agent would load large resources progressively. */
export function runtimeSkillBundle(files: Record<string, string>, maxChars = 72_000) {
  const runtimeEntries = Object.entries(files)
    .filter(([path, content]) => Boolean(content.trim()) && (
      path === "SKILL.md"
      || /^(?:references|scripts|assets|integrations)\//.test(path)
    ))
    .sort(([left], [right]) => {
      const priority = (path: string) => path === "SKILL.md" ? 0 : path.startsWith("references/") ? 1 : path.startsWith("scripts/") ? 2 : path.startsWith("integrations/") ? 3 : 4;
      return priority(left) - priority(right) || left.localeCompare(right);
    });
  let remaining = Math.max(8_000, maxChars);
  return Object.fromEntries(runtimeEntries.flatMap(([path, content]) => {
    if (remaining <= 0) return [];
    const perFileLimit = path === "SKILL.md" ? 28_000 : path.startsWith("references/") ? 24_000 : 12_000;
    const selected = content.slice(0, Math.min(content.length, perFileLimit, remaining));
    remaining -= selected.length;
    return [[path, selected.length < content.length ? `${selected}\n\n[Runtime context truncated; load the source file for the remaining content.]` : selected] as const];
  }));
}

const DIMENSION_LABELS = [
  "知道什么时候该帮你",
  "会不会按你的方式推进",
  "结果像不像你要的",
  "有没有用对你的资料",
  "换个场景还能不能做好",
] as const;

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)]));
}

function clean(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function clampScore(value: unknown) {
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
}

function artifactMatches(path: string, pattern: string) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "::ALL::").replace(/\*/g, "[^/]*").replace(/::ALL::/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`).test(path);
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function stats(values: number[]) {
  if (!values.length) return { mean: 0, stddev: 0, min: 0, max: 0 };
  const average = mean(values);
  const variance = values.length > 1 ? values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / (values.length - 1) : 0;
  return {
    mean: Math.round(average),
    stddev: Math.round(Math.sqrt(variance) * 10) / 10,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

export function freezeEvalContract(cases: SkillEvalCase[]): FrozenEvalContract {
  const frozenCases = cases.map((item) => ({
    ...item,
    capabilityIds: [...item.capabilityIds],
    context: { ...item.context },
    expected: {
      behaviors: [...item.expected.behaviors],
      mustNot: [...item.expected.mustNot],
      artifacts: [...item.expected.artifacts],
    },
    graders: [...item.graders],
  }));
  const payload = JSON.stringify(canonical(frozenCases));
  return { schemaVersion: "1.0", digest: `eval-${stableHash(payload)}`, cases: frozenCases };
}

export function publicExecutionContract(contract: FrozenEvalContract) {
  return {
    schemaVersion: contract.schemaVersion,
    digest: contract.digest,
    cases: contract.cases.map((item) => ({ id: item.id, family: item.family, prompt: item.prompt, context: item.context })),
  };
}

export function normalizeHarnessExecutions(input: {
  value: unknown;
  contract: FrozenEvalContract;
  configuration: HarnessConfiguration;
  runIndex: number;
  durationMs: number;
}): HarnessExecution[] | null {
  if (!input.value || typeof input.value !== "object") return null;
  const rows = (input.value as { executions?: unknown }).executions;
  if (!Array.isArray(rows)) return null;
  const expected = new Map(input.contract.cases.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const executions = rows.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const caseId = clean(item.caseId, 120);
    const contractCase = expected.get(caseId);
    const output = clean(item.output, 18_000);
    if (!contractCase || seen.has(caseId)) return [];
    seen.add(caseId);
    const artifacts = Array.isArray(item.artifacts) ? item.artifacts.flatMap((artifact) => {
      if (!artifact || typeof artifact !== "object") return [];
      const detail = artifact as Record<string, unknown>;
      const path = clean(detail.path, 260);
      return path ? [{ path, summary: clean(detail.summary, 400), content: clean(detail.content, 120_000), verified: false }] : [];
    }).slice(0, 12) : [];
    const trace = Array.isArray(item.trace) ? item.trace.map((step) => clean(step, 320)).filter(Boolean).slice(0, 10) : [];
    return [{
      runId: `${input.contract.digest}-${input.configuration}-${input.runIndex}-${caseId}`,
      caseId,
      configuration: input.configuration,
      runIndex: input.runIndex,
      prompt: contractCase.prompt,
      output,
      triggered: item.triggered === true,
      artifacts,
      trace,
      durationMs: Math.max(0, Math.round(input.durationMs)),
      outputChars: output.length,
    }];
  });
  return executions.length === expected.size ? executions : null;
}

export function normalizeHarnessGrades(input: {
  value: unknown;
  contract: FrozenEvalContract;
  executions: HarnessExecution[];
}): HarnessGrade[] | null {
  if (!input.value || typeof input.value !== "object") return null;
  const rows = (input.value as { grades?: unknown }).grades;
  if (!Array.isArray(rows)) return null;
  const executionByCase = new Map(input.executions.map((item) => [item.caseId, item]));
  const contractByCase = new Map(input.contract.cases.map((item) => [item.id, item]));
  const root = input.value as Record<string, unknown>;
  const rawFeedback = root.textualFeedback && typeof root.textualFeedback === "object"
    ? root.textualFeedback as Record<string, unknown>
    : {};
  const criticalProblems = Array.isArray(rawFeedback.criticalProblems) ? rawFeedback.criticalProblems.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const detail = entry as Record<string, unknown>;
    const critique = clean(detail.critique, 800);
    const direction = clean(detail.direction, 800);
    if (!critique || !direction) return [];
    return [{
      id: clean(detail.id, 120) || `gradient-${index + 1}`,
      critique,
      direction,
      caseIds: Array.isArray(detail.caseIds) ? detail.caseIds.map((item) => clean(item, 120)).filter((id) => contractByCase.has(id)).slice(0, 8) : [],
      affectedCapabilities: Array.isArray(detail.affectedCapabilities) ? detail.affectedCapabilities.map((item) => clean(item, 120)).filter(Boolean).slice(0, 8) : [],
    }];
  }).slice(0, 3) : [];
  const textualFeedback: TextualGradientFeedback = {
    summary: clean(rawFeedback.summary, 1_200),
    criticalProblems,
    preserve: Array.isArray(rawFeedback.preserve) ? rawFeedback.preserve.map((item) => clean(item, 500)).filter(Boolean).slice(0, 6) : [],
  };
  const failedCaseById = new Map<string, Pick<FailedCaseEvidence, "caseId" | "failureSummary" | "observedEvidence">>();
  if (Array.isArray(root.failedCases)) root.failedCases.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const detail = entry as Record<string, unknown>;
    const caseId = clean(detail.caseId, 120);
    const failureSummary = clean(detail.failureSummary, 700);
    if (contractByCase.has(caseId) && failureSummary) failedCaseById.set(caseId, {
      caseId,
      failureSummary,
      observedEvidence: clean(detail.observedEvidence, 1_200),
    });
  });
  const seen = new Set<string>();
  const grades = rows.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const caseId = clean(item.caseId, 120);
    const execution = executionByCase.get(caseId);
    const contractCase = contractByCase.get(caseId);
    if (!execution || !contractCase || seen.has(caseId)) return [];
    seen.add(caseId);
    const rawDimensions = Array.isArray(item.dimensions) ? item.dimensions : [];
    const dimensions = DIMENSION_LABELS.map((label) => {
      const found = rawDimensions.find((dimension) => dimension && typeof dimension === "object" && (dimension as Record<string, unknown>).label === label) as Record<string, unknown> | undefined;
      return { label, score: clampScore(found?.score), evidence: clean(found?.evidence, 500) };
    });
    const returnedAssertions = Array.isArray(item.assertions) ? item.assertions.flatMap((assertion) => {
      if (!assertion || typeof assertion !== "object") return [];
      const detail = assertion as Record<string, unknown>;
      const text = clean(detail.text, 400);
      return text ? [{ text, passed: detail.passed === true, evidence: clean(detail.evidence, 600) }] : [];
    }).slice(0, 24) : [];
    const expectedAssertions = [
      ...contractCase.expected.behaviors.map((text) => ({ text, kind: "required" as const })),
      ...contractCase.expected.mustNot.map((text) => ({ text, kind: "forbidden" as const })),
    ];
    const assertions = expectedAssertions.map((expected) => {
      const exact = returnedAssertions.find((assertion) => assertion.text === expected.text);
      return exact || {
        text: expected.text,
        passed: false,
        evidence: `隔离评分上下文没有逐项检查这条${expected.kind === "required" ? "预期行为" : "禁止行为"}`,
      };
    });
    const artifactAssertions = contractCase.expected.artifacts.map((pattern) => {
      const artifact = execution.artifacts.find((item) => item.verified && item.content.length > 0 && artifactMatches(item.path, pattern));
      return { text: `文件产物 ${pattern}`, passed: Boolean(artifact), evidence: artifact ? `本地沙箱已写入并检查 ${artifact.path}` : `本地沙箱没有确认匹配 ${pattern} 的非空文件` };
    });
    const allAssertions = [...assertions, ...artifactAssertions];
    const triggerPassed = execution.triggered === contractCase.shouldTrigger;
    const assertionsPassed = allAssertions.every((assertion) => assertion.passed);
    const passed = item.passed === true && triggerPassed && assertionsPassed;
    const claims = Array.isArray(item.claims) ? item.claims.flatMap((claim) => {
      if (!claim || typeof claim !== "object") return [];
      const detail = claim as Record<string, unknown>;
      const statement = clean(detail.claim, 500);
      const type = ["factual", "process", "quality"].includes(String(detail.type))
        ? detail.type as "factual" | "process" | "quality"
        : "quality";
      return statement ? [{ claim: statement, type, verified: detail.verified === true, evidence: clean(detail.evidence, 700) }] : [];
    }).slice(0, 12) : [];
    const rawEvalFeedback = item.evalFeedback && typeof item.evalFeedback === "object"
      ? item.evalFeedback as Record<string, unknown>
      : root.evalFeedback && typeof root.evalFeedback === "object"
        ? root.evalFeedback as Record<string, unknown>
        : {};
    const evalFeedback = {
      suggestions: Array.isArray(rawEvalFeedback.suggestions) ? rawEvalFeedback.suggestions.flatMap((suggestion) => {
        if (!suggestion || typeof suggestion !== "object") return [];
        const detail = suggestion as Record<string, unknown>;
        const reason = clean(detail.reason, 700);
        return reason ? [{ assertion: clean(detail.assertion, 400) || undefined, reason }] : [];
      }).slice(0, 6) : [],
      overall: clean(rawEvalFeedback.overall, 900),
    };
    // A visually perfect score must never coexist with a failed frozen
    // assertion. Keep the score useful for ranking while making the hard gate
    // visible in every aggregate metric.
    const score = passed ? clampScore(item.score) : Math.min(79, clampScore(item.score));
    const failedAssertions = allAssertions.filter((assertion) => !assertion.passed);
    const failureReason = !triggerPassed
      ? `触发结果应为 ${contractCase.shouldTrigger ? "触发" : "不触发"}，实际相反`
      : failedAssertions.length
        ? `冻结断言未通过：${failedAssertions.slice(0, 3).map((assertion) => assertion.text).join("；")}`.slice(0, 600)
        : clean(item.failureReason, 600);
    return [{
      runId: execution.runId,
      caseId,
      score,
      passed,
      evidence: clean(item.evidence, 800),
      failureReason,
      dimensions,
      assertions: allAssertions,
      claims,
      evalFeedback,
      textualFeedback,
      failedCase: failedCaseById.get(caseId),
    }];
  });
  return grades.length === executionByCase.size ? grades : null;
}

function representativeRun(grades: HarnessGrade[]) {
  const ordered = [...grades].sort((left, right) => left.score - right.score);
  return ordered[Math.floor((ordered.length - 1) / 2)];
}

export function buildHarnessReport(input: {
  contract: FrozenEvalContract;
  configuration: HarnessConfiguration;
  executions: HarnessExecution[];
  grades: HarnessGrade[];
}): HarnessReport {
  const executionsByRun = new Map(input.executions.map((item) => [item.runId, item]));
  const cases: OptimizationCaseGrade[] = input.contract.cases.map((contractCase) => {
    const caseGrades = input.grades.filter((item) => item.caseId === contractCase.id);
    const representative = representativeRun(caseGrades);
    const representativeExecution = representative ? executionsByRun.get(representative.runId) : undefined;
    const passRate = caseGrades.length ? caseGrades.filter((item) => item.passed).length / caseGrades.length : 0;
    const dimensions = DIMENSION_LABELS.map((label) => {
      const matching = caseGrades.flatMap((item) => item.dimensions.filter((dimension) => dimension.label === label));
      const evidence = matching.find((item) => item.evidence)?.evidence || "没有取得可引用的隔离评分证据";
      return { label, score: Math.round(mean(matching.map((item) => item.score))), evidence: `${evidence}（${matching.length} 次隔离评分）` };
    });
    return {
      caseId: contractCase.id,
      prompt: contractCase.prompt,
      output: representativeExecution?.output || "",
      triggered: input.executions.filter((item) => item.caseId === contractCase.id).filter((item) => item.triggered).length >= Math.ceil(Math.max(1, caseGrades.length) / 2),
      score: Math.round(mean(caseGrades.map((item) => item.score))),
      passed: passRate >= (2 / 3),
      evidence: `${representative?.evidence || "没有评分证据"}；重复运行通过 ${caseGrades.filter((item) => item.passed).length}/${caseGrades.length}`,
      failureReason: Array.from(new Set(caseGrades.map((item) => item.failureReason).filter(Boolean))).join("；").slice(0, 700),
      dimensions,
    };
  });
  const scoreStats = stats(input.grades.map((item) => item.score));
  const benchmark: HarnessBenchmark = {
    configuration: input.configuration,
    contractDigest: input.contract.digest,
    runs: input.grades.length,
    cases: input.contract.cases.length,
    score: scoreStats,
    passRate: input.grades.length ? Math.round((input.grades.filter((item) => item.passed).length / input.grades.length) * 100) : 0,
    meanDurationMs: Math.round(mean(input.executions.map((item) => item.durationMs))),
    meanOutputChars: Math.round(mean(input.executions.map((item) => item.outputChars))),
  };
  // A repeated run can fail while the frozen case still satisfies its declared
  // pass threshold. Keep that variance in benchmark.stddev/passRate, but do
  // not promote superseded run failures into current P1 patch targets. Only
  // unresolved case-level failures belong in the Optimization Gate.
  const unresolvedFailurePatterns = cases
    .filter((item) => !item.passed && item.failureReason)
    .map((item) => item.failureReason);
  const evalQualityPatterns = Array.from(new Set(input.grades.flatMap((grade) => grade.evalFeedback.suggestions.map((suggestion) =>
    `评测区分度 · ${suggestion.assertion ? `${suggestion.assertion}：` : ""}${suggestion.reason}`,
  )))).slice(0, 6);
  const gradientProblems = new Map<string, TextualGradientFeedback["criticalProblems"][number]>();
  const preserve = new Set<string>();
  const summaries: string[] = [];
  input.grades.forEach((grade) => {
    if (grade.textualFeedback.summary && !summaries.includes(grade.textualFeedback.summary)) summaries.push(grade.textualFeedback.summary);
    grade.textualFeedback.criticalProblems.forEach((problem) => {
      const key = problem.id || `${problem.critique}\n${problem.direction}`;
      if (!gradientProblems.has(key)) gradientProblems.set(key, problem);
    });
    grade.textualFeedback.preserve.forEach((item) => preserve.add(item));
  });
  const failedCases: FailedCaseEvidence[] = cases.filter((item) => !item.passed).map((item) => {
    const contractCase = input.contract.cases.find((candidate) => candidate.id === item.caseId)!;
    const modelEvidence = input.grades.find((grade) => grade.caseId === item.caseId)?.failedCase;
    return {
      caseId: item.caseId,
      family: contractCase.family,
      capabilityIds: contractCase.capabilityIds,
      failureSummary: modelEvidence?.failureSummary || item.failureReason || "该任务没有通过冻结验收条件",
      observedEvidence: modelEvidence?.observedEvidence || item.evidence,
      // The optimizer may learn from training fixtures. Selection/test inputs
      // stay private so textual feedback cannot become held-out answer leakage.
      ...(contractCase.split === "train" ? { inputPrompt: contractCase.prompt } : {}),
    };
  }).slice(0, 12);
  const criticalProblems = Array.from(gradientProblems.values()).slice(0, 3);
  if (!criticalProblems.length) {
    failedCases.slice(0, 3).forEach((item, index) => criticalProblems.push({
      id: `derived-gradient-${index + 1}`,
      critique: item.failureSummary,
      direction: "修复导致该可观察失败的共享运行规则，并用相邻任务验证；不要针对单条测试写死答案。",
      caseIds: [item.caseId],
      affectedCapabilities: item.capabilityIds,
    }));
  }
  return {
    contract: input.contract,
    configuration: input.configuration,
    executions: input.executions,
    grades: input.grades,
    evidence: {
      cases,
      failurePatterns: Array.from(new Set([...unresolvedFailurePatterns, ...evalQualityPatterns])).slice(0, 8),
      textualFeedback: {
        summary: summaries.join("；").slice(0, 1_200) || (failedCases.length ? `有 ${failedCases.length} 个冻结任务暴露出可复现差距。` : "当前批次没有发现需要反向传播的关键失败。"),
        criticalProblems,
        preserve: Array.from(preserve).slice(0, 6),
      },
      failedCases,
    },
    benchmark,
  };
}

export function anonymizeComparison(left: HarnessReport, right: HarnessReport) {
  if (left.contract.digest !== right.contract.digest) throw new Error("盲评比较必须使用同一个冻结 Eval 合约");
  const flip = parseInt(left.contract.digest.slice(-2), 16) % 2 === 1;
  const a = flip ? right : left;
  const b = flip ? left : right;
  const outputFor = (report: HarnessReport, caseId: string) => report.evidence.cases.find((item) => item.caseId === caseId)?.output || "";
  return {
    payload: {
      contractDigest: left.contract.digest,
      cases: left.contract.cases.map((item) => ({
        caseId: item.id,
        prompt: item.prompt,
        expected: item.expected,
        outputA: outputFor(a, item.id),
        outputB: outputFor(b, item.id),
      })),
    },
    reveal: { A: flip ? "right" as const : "left" as const, B: flip ? "left" as const : "right" as const },
  };
}

export function normalizeBlindComparison(value: unknown, caseIds: string[]): BlindComparison | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const reportedWinner = ["A", "B", "tie"].includes(String(raw.winner)) ? raw.winner as BlindComparison["winner"] : null;
  if (!reportedWinner || !Array.isArray(raw.caseResults)) return null;
  const allowed = new Set(caseIds);
  const caseResults = raw.caseResults.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const caseId = clean(item.caseId, 120);
    const itemWinner = ["A", "B", "tie"].includes(String(item.winner)) ? item.winner as "A" | "B" | "tie" : null;
    return allowed.has(caseId) && itemWinner ? [{ caseId, winner: itemWinner, evidence: clean(item.evidence, 500) }] : [];
  });
  if (caseResults.length !== allowed.size) return null;
  const rubricRaw = raw.rubric && typeof raw.rubric === "object" ? raw.rubric as Record<string, unknown> : null;
  const confidence = Math.max(0, Math.min(1, Number(raw.confidence) || 0));
  const criteria = Array.isArray(rubricRaw?.criteria) ? rubricRaw.criteria.flatMap((criterion) => {
    if (!criterion || typeof criterion !== "object") return [];
    const item = criterion as Record<string, unknown>;
    const label = clean(item.label, 160);
    const kind = item.kind === "structure" ? "structure" as const : "content" as const;
    return label ? [{ id: clean(item.id, 80) || label, label, kind }] : [];
  }).slice(0, 8) : [];
  // A task-specific rubric needs enough independent axes to avoid a single
  // vague "quality" judgment turning into an unearned perfect score.
  if (criteria.length < 4) return null;
  const side = (key: "A" | "B") => {
    const value = rubricRaw?.[key];
    if (!value || typeof value !== "object") return null;
    const item = value as Record<string, unknown>;
    const rawCriterionScores = item.criterionScores && typeof item.criterionScores === "object"
      ? item.criterionScores as Record<string, unknown>
      : null;
    const rawCriterionEvidence = item.criterionEvidence && typeof item.criterionEvidence === "object"
      ? item.criterionEvidence as Record<string, unknown>
      : null;
    if (!rawCriterionScores || !rawCriterionEvidence) return null;
    const criterionScores: Record<string, number> = {};
    const criterionEvidence: Record<string, string> = {};
    for (const criterion of criteria) {
      const score = Number(rawCriterionScores[criterion.id]);
      const evidence = clean(rawCriterionEvidence[criterion.id], 500);
      if (!Number.isFinite(score) || score < 1 || score > 5 || !evidence) return null;
      // A score of 5 must point to at least one observable frozen case. If the
      // explanation is generic, cap that axis at 4 instead of trusting praise.
      const grounded = caseIds.some((caseId) => evidence.includes(caseId));
      criterionScores[criterion.id] = score === 5 && !grounded ? 4 : score;
      criterionEvidence[criterion.id] = evidence;
    }
    const strengths = Array.isArray(item.strengths) ? item.strengths.map((entry) => clean(entry, 300)).filter(Boolean).slice(0, 6) : [];
    const weaknesses = Array.isArray(item.weaknesses) ? item.weaknesses.map((entry) => clean(entry, 300)).filter(Boolean).slice(0, 6) : [];
    const scores = Object.values(criterionScores);
    const unanimousCases = caseResults.every((result) => result.winner === key);
    const allCriteriaDirectlyVerified = Object.values(criterionEvidence).every((evidence) => caseIds.some((caseId) => evidence.includes(caseId)));
    const perfectScoreQualified = scores.every((score) => score === 5)
      && weaknesses.length === 0
      && caseIds.length >= 8
      && unanimousCases
      && allCriteriaDirectlyVerified
      && confidence >= 0.95;
    let overallScore = Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 20);
    // 100 means exhaustive proof, not "the judge liked both outputs". Small
    // held-out samples and acknowledged weaknesses remain visibly non-perfect.
    if (!perfectScoreQualified) overallScore = Math.min(overallScore, weaknesses.length ? 92 : caseIds.length < 6 ? 94 : 95);
    return {
      criterionScores,
      criterionEvidence,
      overallScore,
      perfectScoreQualified,
      strengths,
      weaknesses,
    };
  };
  const sideA = side("A");
  const sideB = side("B");
  const rubric = sideA && sideB ? { criteria, A: sideA, B: sideB } : null;
  const qualityScores = rubric ? { A: rubric.A.overallScore, B: rubric.B.overallScore } : null;
  const scoreDelta = qualityScores ? qualityScores.A - qualityScores.B : 0;
  const aCaseWins = caseResults.filter((item) => item.winner === "A").length;
  const bCaseWins = caseResults.filter((item) => item.winner === "B").length;
  const winner: BlindComparison["winner"] = Math.abs(scoreDelta) >= 2
    ? scoreDelta > 0 ? "A" : "B"
    : aCaseWins !== bCaseWins
      ? aCaseWins > bCaseWins ? "A" : "B"
      : "tie";
  const winnerDisagreed = winner !== reportedWinner;
  return {
    winner,
    confidence: winnerDisagreed ? Math.min(confidence, 0.6) : confidence,
    evidence: `${clean(raw.evidence, 700)}${winnerDisagreed ? "；本地逐项汇总与模型结论不一致，已按可复现分数与用例胜负校正。" : ""}`,
    caseResults,
    qualityScores,
    rubric,
  };
}
