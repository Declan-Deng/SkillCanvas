export const OPTIMIZATION_EDIT_BUDGET = 4;
export const OPTIMIZATION_TRAIN_SAMPLE = 4;
export const OPTIMIZATION_SELECTION_SAMPLE = 4;

export type OptimizationSplit = "train" | "selection" | "test";

export type SkillEvalCase = {
  id: string;
  family: "trigger" | "capability" | "grounding" | "integration";
  category: string;
  shouldTrigger: boolean;
  prompt: string;
  context: Record<string, unknown>;
  capabilityIds: string[];
  expected: {
    behaviors: string[];
    mustNot: string[];
    artifacts: string[];
  };
  graders: string[];
  split: OptimizationSplit;
};

export type DimensionGrade = {
  label: string;
  score: number;
  evidence: string;
};

export type OptimizationCaseGrade = {
  caseId: string;
  prompt: string;
  output: string;
  triggered: boolean;
  score: number;
  passed: boolean;
  evidence: string;
  failureReason: string;
  dimensions: DimensionGrade[];
};

export type TextualGradientProblem = {
  id: string;
  critique: string;
  direction: string;
  caseIds: string[];
  affectedCapabilities: string[];
};

export type TextualGradientFeedback = {
  summary: string;
  criticalProblems: TextualGradientProblem[];
  preserve: string[];
};

export type FailedCaseEvidence = {
  caseId: string;
  family: SkillEvalCase["family"];
  capabilityIds: string[];
  failureSummary: string;
  observedEvidence: string;
  /** Only training cases may expose their original input to the optimizer. */
  inputPrompt?: string;
};

export type OptimizationEvidenceReport = {
  cases: OptimizationCaseGrade[];
  failurePatterns: string[];
  textualFeedback: TextualGradientFeedback;
  failedCases: FailedCaseEvidence[];
};

export type OptimizationGateDecision = {
  accepted: boolean;
  beforeScore: number;
  candidateScore: number;
  delta: number;
  reasons: string[];
  regressions: string[];
};

export type CandidateCommitMode = "target-improvement" | "preserve-and-satisfy";

export type CandidateRequirementCheck = {
  id: string;
  satisfied: boolean;
  detail: string;
};

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stringList(value: unknown, limit = 12) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()).slice(0, limit);
}

export function parseAndSplitEvalCases(raw: string): SkillEvalCase[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const rows = Array.isArray(parsed) ? parsed : (parsed as { evals?: unknown[] })?.evals;
  if (!Array.isArray(rows)) return [];

  const normalized = rows.slice(0, 20).flatMap((row, index) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    const prompt = typeof item.prompt === "string" ? item.prompt.trim() : "";
    if (prompt.length < 12) return [];
    const expected = item.expected && typeof item.expected === "object" ? item.expected as Record<string, unknown> : {};
    const explicitFamily = typeof item.eval_family === "string" ? item.eval_family : "";
    const family = ["trigger", "capability", "grounding", "integration"].includes(explicitFamily)
      ? explicitFamily as SkillEvalCase["family"]
      : /^trigger_/.test(String(item.category || "")) ? "trigger"
        : /tool|integration|artifact|mcp|image/.test(String(item.category || "")) ? "integration"
          : /ground|content_policy|state_correctness|fact|source/.test(String(item.category || "")) ? "grounding"
            : "capability";
    return [{
      id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `case-${index + 1}`,
      family,
      category: typeof item.category === "string" && item.category.trim() ? item.category.trim() : "core_capability",
      shouldTrigger: item.should_trigger !== false,
      prompt,
      context: item.context && typeof item.context === "object" && !Array.isArray(item.context) ? { ...(item.context as Record<string, unknown>) } : {},
      capabilityIds: stringList(item.capability_ids),
      expected: {
        behaviors: stringList(expected.behaviors),
        mustNot: stringList(expected.must_not),
        artifacts: stringList(expected.artifacts),
      },
      graders: stringList(item.graders),
    }];
  });

  if (normalized.length < 6) return [];

  const buckets = new Map<string, typeof normalized>();
  normalized.forEach((item) => {
    const bucket = buckets.get(item.category) || [];
    bucket.push(item);
    buckets.set(item.category, bucket);
  });
  buckets.forEach((bucket) => bucket.sort((left, right) => stableHash(left.id) - stableHash(right.id)));

  const interleaved: typeof normalized = [];
  const categories = Array.from(buckets.keys()).sort();
  while (interleaved.length < normalized.length) {
    categories.forEach((category) => {
      const next = buckets.get(category)?.shift();
      if (next) interleaved.push(next);
    });
  }

  return assignCapabilityStratifiedSplits(interleaved);
}

/**
 * Freeze the held-out split by capability before optimization starts.
 *
 * Category/family round-robin sampling can silently omit a sparse capability
 * (for example a file-workspace or export script). This assignment first picks
 * a deterministic set-cover for every capability represented by the Eval bank,
 * then fills train/test without leaking those held-out cases.
 */
export function assignCapabilityStratifiedSplits(cases: Array<Omit<SkillEvalCase, "split">>): SkillEvalCase[] {
  const ordered = [...cases].sort((left, right) => stableHash(left.id) - stableHash(right.id));
  const splitById = new Map<string, OptimizationSplit>();
  const capabilities = Array.from(new Set(ordered.flatMap((item) => item.capabilityIds))).sort();
  const uncovered = new Set(capabilities);

  while (uncovered.size) {
    const candidate = ordered
      .filter((item) => !splitById.has(item.id) && item.capabilityIds.some((id) => uncovered.has(id)))
      .sort((left, right) => {
        const leftCoverage = left.capabilityIds.filter((id) => uncovered.has(id)).length;
        const rightCoverage = right.capabilityIds.filter((id) => uncovered.has(id)).length;
        return rightCoverage - leftCoverage || stableHash(left.id) - stableHash(right.id);
      })[0];
    if (!candidate) break;
    splitById.set(candidate.id, "selection");
    candidate.capabilityIds.forEach((id) => uncovered.delete(id));
  }

  // Every represented Eval family should also have a held-out observation.
  (["trigger", "capability", "grounding", "integration"] as const).forEach((family) => {
    if (ordered.some((item) => item.family === family && splitById.get(item.id) === "selection")) return;
    const candidate = ordered.find((item) => item.family === family && !splitById.has(item.id));
    if (candidate) splitById.set(candidate.id, "selection");
  });

  const remainingByFamily = new Map<SkillEvalCase["family"], Array<Omit<SkillEvalCase, "split">>>();
  ordered.filter((item) => !splitById.has(item.id)).forEach((item) => {
    const bucket = remainingByFamily.get(item.family) || [];
    bucket.push(item);
    remainingByFamily.set(item.family, bucket);
  });
  remainingByFamily.forEach((bucket) => {
    bucket.forEach((item, index) => splitById.set(item.id, index % 3 === 2 ? "test" : "train"));
  });

  // Small banks can still miss a global test split after family stratification.
  if (!Array.from(splitById.values()).includes("test")) {
    const candidate = ordered.filter((item) => splitById.get(item.id) === "train").at(-1);
    if (candidate) splitById.set(candidate.id, "test");
  }
  if (!Array.from(splitById.values()).includes("train")) {
    const candidate = ordered.find((item) => splitById.get(item.id) !== "selection");
    if (candidate) splitById.set(candidate.id, "train");
  }

  return cases.map((item) => ({ ...item, split: splitById.get(item.id) || "train" }));
}

export function heldOutCapabilityCoverage(cases: SkillEvalCase[], requiredCapabilityIds: string[]) {
  const heldOut = cases.filter((item) => item.split === "selection");
  const covered = new Set(heldOut.flatMap((item) => item.capabilityIds));
  const required = Array.from(new Set(requiredCapabilityIds.filter(Boolean)));
  return {
    covered: required.filter((id) => covered.has(id)),
    missing: required.filter((id) => !covered.has(id)),
  };
}

export function sampleOptimizationCases(
  cases: SkillEvalCase[],
  split: OptimizationSplit,
  limit: number,
  options: { requiredCapabilityIds?: string[] } = {},
) {
  const categoryPriority = ["failure_mode", "core_capability", "trigger_negative", "trigger_implicit", "trigger_context", "trigger_explicit"];
  const pool = cases
    .filter((item) => item.split === split)
    .sort((left, right) => {
      const leftPriority = categoryPriority.indexOf(left.category);
      const rightPriority = categoryPriority.indexOf(right.category);
      const normalizedLeft = leftPriority < 0 ? categoryPriority.length : leftPriority;
      const normalizedRight = rightPriority < 0 ? categoryPriority.length : rightPriority;
      return normalizedLeft - normalizedRight || stableHash(left.id) - stableHash(right.id);
    });
  const selected: SkillEvalCase[] = [];
  const required = new Set(options.requiredCapabilityIds || []);
  while (required.size) {
    const candidate = pool
      .filter((item) => !selected.some((selectedItem) => selectedItem.id === item.id) && item.capabilityIds.some((id) => required.has(id)))
      .sort((left, right) => {
        const leftCoverage = left.capabilityIds.filter((id) => required.has(id)).length;
        const rightCoverage = right.capabilityIds.filter((id) => required.has(id)).length;
        return rightCoverage - leftCoverage || stableHash(left.id) - stableHash(right.id);
      })[0];
    if (!candidate) break;
    selected.push(candidate);
    candidate.capabilityIds.forEach((id) => required.delete(id));
  }
  const effectiveLimit = Math.max(limit, selected.length);
  (["trigger", "capability", "grounding", "integration"] as const).forEach((family) => {
    const candidate = pool.find((item) => item.family === family);
    if (candidate && selected.length < effectiveLimit && !selected.some((selectedItem) => selectedItem.id === candidate.id)) selected.push(candidate);
  });
  pool.forEach((item) => {
    if (selected.length < effectiveLimit && !selected.some((selectedItem) => selectedItem.id === item.id)) selected.push(item);
  });
  return selected;
}

export function normalizeOptimizationEvidence(value: unknown, allowedCaseIds: string[]): OptimizationEvidenceReport | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { cases?: unknown; failurePatterns?: unknown; textualFeedback?: unknown; failedCases?: unknown };
  if (!Array.isArray(raw.cases)) return null;
  const allowed = new Set(allowedCaseIds);
  const cases = raw.cases.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const caseId = typeof item.caseId === "string" ? item.caseId : "";
    if (!allowed.has(caseId)) return [];
    const rawDimensions = Array.isArray(item.dimensions) ? item.dimensions : [];
    const dimensions = rawDimensions.flatMap((dimension) => {
      if (!dimension || typeof dimension !== "object") return [];
      const detail = dimension as Record<string, unknown>;
      if (typeof detail.label !== "string" || !Number.isFinite(Number(detail.score))) return [];
      return [{
        label: detail.label.trim().slice(0, 80),
        score: Math.max(0, Math.min(100, Math.round(Number(detail.score)))),
        evidence: typeof detail.evidence === "string" ? detail.evidence.trim().slice(0, 400) : "",
      }];
    });
    if (!dimensions.length) return [];
    return [{
      caseId,
      prompt: typeof item.prompt === "string" ? item.prompt.trim().slice(0, 4_000) : "",
      output: typeof item.output === "string" ? item.output.trim().slice(0, 14_000) : "",
      triggered: item.triggered === true,
      score: Math.max(0, Math.min(100, Math.round(Number(item.score) || 0))),
      passed: item.passed === true,
      evidence: typeof item.evidence === "string" ? item.evidence.trim().slice(0, 500) : "",
      failureReason: typeof item.failureReason === "string" ? item.failureReason.trim().slice(0, 500) : "",
      dimensions,
    }];
  });
  if (cases.length !== allowed.size) return null;
  const rawFeedback = raw.textualFeedback && typeof raw.textualFeedback === "object"
    ? raw.textualFeedback as Record<string, unknown>
    : {};
  const criticalProblems = Array.isArray(rawFeedback.criticalProblems)
    ? rawFeedback.criticalProblems.flatMap((entry, index) => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      const critique = typeof item.critique === "string" ? item.critique.trim().slice(0, 800) : "";
      const direction = typeof item.direction === "string" ? item.direction.trim().slice(0, 800) : "";
      if (!critique || !direction) return [];
      return [{
        id: typeof item.id === "string" && item.id.trim() ? item.id.trim().slice(0, 120) : `gradient-${index + 1}`,
        critique,
        direction,
        caseIds: stringList(item.caseIds, 8).filter((id) => allowed.has(id)),
        affectedCapabilities: stringList(item.affectedCapabilities, 8),
      }];
    }).slice(0, 3)
    : [];
  const failedCases = Array.isArray(raw.failedCases)
    ? raw.failedCases.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      const caseId = typeof item.caseId === "string" ? item.caseId.trim() : "";
      if (!allowed.has(caseId)) return [];
      const family = ["trigger", "capability", "grounding", "integration"].includes(String(item.family))
        ? item.family as FailedCaseEvidence["family"]
        : "capability";
      const failureSummary = typeof item.failureSummary === "string" ? item.failureSummary.trim().slice(0, 700) : "";
      if (!failureSummary) return [];
      const inputPrompt = typeof item.inputPrompt === "string" && item.inputPrompt.trim()
        ? item.inputPrompt.trim().slice(0, 4_000)
        : undefined;
      return [{
        caseId,
        family,
        capabilityIds: stringList(item.capabilityIds, 8),
        failureSummary,
        observedEvidence: typeof item.observedEvidence === "string" ? item.observedEvidence.trim().slice(0, 1_200) : "",
        ...(inputPrompt ? { inputPrompt } : {}),
      }];
    }).slice(0, 12)
    : [];
  return {
    cases,
    failurePatterns: stringList(raw.failurePatterns, 8),
    textualFeedback: {
      summary: typeof rawFeedback.summary === "string" ? rawFeedback.summary.trim().slice(0, 1_200) : "",
      criticalProblems,
      preserve: stringList(rawFeedback.preserve, 6),
    },
    failedCases,
  };
}

export function aggregateDimensionScore(report: OptimizationEvidenceReport, caseIds: string[], label: string) {
  const selected = new Set(caseIds);
  const values = report.cases
    .filter((item) => selected.has(item.caseId))
    .flatMap((item) => item.dimensions.filter((dimension) => dimension.label === label).map((dimension) => dimension.score));
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function decideCandidateCommitGate(input: {
  baseline: OptimizationEvidenceReport;
  candidate: OptimizationEvidenceReport;
  selectionCaseIds: string[];
  targetLabel: string;
  protectedLabels: string[];
  baselineBlockers: number;
  candidateBlockers: number;
  mode: CandidateCommitMode;
  requirementChecks?: CandidateRequirementCheck[];
}): OptimizationGateDecision {
  const beforeScore = aggregateDimensionScore(input.baseline, input.selectionCaseIds, input.targetLabel);
  const candidateScore = aggregateDimensionScore(input.candidate, input.selectionCaseIds, input.targetLabel);
  const regressions: string[] = [];
  const reasons: string[] = [];

  input.protectedLabels.filter((label) => input.mode === "target-improvement" ? label !== input.targetLabel : true).forEach((label) => {
    const before = aggregateDimensionScore(input.baseline, input.selectionCaseIds, label);
    const after = aggregateDimensionScore(input.candidate, input.selectionCaseIds, label);
    if (before && after < before - 5) regressions.push(`${label} ${before}→${after}`);
  });

  const baselineById = new Map(input.baseline.cases.map((item) => [item.caseId, item]));
  input.candidate.cases.filter((item) => input.selectionCaseIds.includes(item.caseId)).forEach((item) => {
    const before = baselineById.get(item.caseId);
    if (before?.passed && !item.passed && item.score < before.score - 10) regressions.push(`验证任务 ${item.caseId} 从通过变为失败`);
  });

  const candidateCaseIds = new Set(input.candidate.cases.map((item) => item.caseId));
  const missingCases = input.selectionCaseIds.filter((id) => !candidateCaseIds.has(id));
  if (missingCases.length) reasons.push(`候选验证缺少 ${missingCases.length} 个冻结任务结果`);
  if (input.mode === "target-improvement" && candidateScore <= beforeScore) reasons.push(`目标维度没有严格提升（${beforeScore}→${candidateScore}）`);
  if (input.candidateBlockers > 0) reasons.push(`候选版本的发布检查仍有 ${input.candidateBlockers} 个确定性阻塞问题`);
  const failedRequirements = (input.requirementChecks || []).filter((item) => !item.satisfied);
  if (failedRequirements.length) reasons.push(`候选版本没有落实 ${failedRequirements.length} 项本轮确认要求`);
  if (regressions.length) reasons.push(`出现 ${regressions.length} 项明显回退`);

  return {
    accepted: reasons.length === 0,
    beforeScore,
    candidateScore,
    delta: candidateScore - beforeScore,
    reasons,
    regressions,
  };
}

export function decideOptimizationGate(input: {
  baseline: OptimizationEvidenceReport;
  candidate: OptimizationEvidenceReport;
  selectionCaseIds: string[];
  targetLabel: string;
  protectedLabels: string[];
  baselineBlockers: number;
  candidateBlockers: number;
}): OptimizationGateDecision {
  return decideCandidateCommitGate({ ...input, mode: "target-improvement" });
}
