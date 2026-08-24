import type { OptimizationEvidenceReport } from "./optimizer-core";

export type ClosureCapability = {
  id: string;
  kind: string;
  path?: string;
  layer?: string;
  status?: string;
  enabled?: boolean;
  scope?: "global" | "task-specific" | "conditional" | "optional";
};

export type CapabilityClosureIssue = {
  id: string;
  type: "missing-implementation" | "missing-routing" | "missing-eval" | "missing-tool-contract" | "orphan-resource" | "malformed-manifest";
  severity: "critical" | "warning";
  capabilityId?: string;
  detail: string;
  route: "workflow" | "resource" | "tool" | "eval" | "simplify";
  files: string[];
};

export type CapabilityClosureReport = {
  score: number;
  closed: number;
  total: number;
  issues: CapabilityClosureIssue[];
};

export type GenerationEvidenceMetrics = {
  score: number;
  passRate: number;
  passed: number;
  total: number;
};

export type GenerationGoalGate = {
  accepted: boolean;
  scoreDelta: number;
  reasons: string[];
  regressions: string[];
};

/** A passed Loop may be restored after a deterministic compiler migration.
 * Remove only observations whose referenced runtime files no longer exist;
 * path-free quality observations remain visible. */
export function removeResolvedFileObservations(issues: string[], files: Record<string, string>) {
  const pathPattern = /\b(?:agents|references|scripts|assets|evals|integrations)\/[A-Za-z0-9._/-]+/g;
  return issues.filter((issue) => {
    const paths = [...issue.matchAll(pathPattern)].map((match) => match[0]);
    return !paths.length || paths.some((path) => Boolean(files[path]));
  });
}

/** Turn a user-facing artifact description into concrete, inspectable globs.
 * This closes a compiler-owned contract gap before any model repair runs. */
export function inferArtifactPatterns(description: string) {
  const text = description.toLowerCase();
  const patterns: string[] = [];
  const add = (pattern: string) => { if (!patterns.includes(pattern)) patterns.push(pattern); };
  if (/\bpdf\b|便携式文档/.test(text)) add("outputs/*.pdf");
  if (/\bdocx?\b|\bword\b|文字文档/.test(text)) add("outputs/*.docx");
  if (/\bpptx?\b|powerpoint|演示文稿|幻灯片/.test(text)) add("outputs/*.pptx");
  if (/\bxlsx?\b|\bexcel\b|电子表格/.test(text)) add("outputs/*.xlsx");
  if (/\bcsv\b|逗号分隔/.test(text)) add("outputs/*.csv");
  if (/\bjson\b/.test(text)) add("outputs/*.json");
  if (/\bhtml?\b|网页文件/.test(text)) add("outputs/*.html");
  if (/\bmarkdown\b|\.md\b/.test(text)) add("outputs/*.md");
  if (/图片|图像|海报|封面|\bpng\b|\bjpe?g\b/.test(text)) {
    add("outputs/*.png");
    add("outputs/*.jpg");
  }
  return patterns.length ? patterns : ["outputs/**"];
}

/** Detect an actual file-delivery promise rather than the mere presence of a
 * file-shaped word. This deliberately requires both a delivery intention and
 * a concrete artifact format, so "read this CSV" does not silently become
 * "export a CSV". */
export function artifactDeliveryRequested(description: string) {
  const format = /\b(?:pdf|docx?|word|pptx?|powerpoint|xlsx?|excel|csv|json|html?|markdown)\b|\.md\b|文件|可运行产物|图片|图像|海报|封面/i;
  const delivery = /交付|输出|导出|生成|保存|下载|创建|写入|产出|返回|给我|拿到|得到|需要|想要|希望|要一份/i;
  return description.split(/[\n；;]/).some((segment) => format.test(segment) && delivery.test(segment));
}

/** A reusable runtime asset needs explicit evidence that the output structure
 * itself should be preserved. Reusing rules, preferences, or task logic is not
 * evidence for manufacturing a CSV/template asset. */
export function reusableOutputAssetRequested(description: string) {
  const outputShape = /模板|范本|版式|表头|字段顺序|输出格式|交付格式|template|layout|schema/i;
  const reuse = /复用|保存|固定|以后|后续|每次|默认|长期|写入技能包|remember|reuse/i;
  return description.split(/[\n；;]/).some((segment) => outputShape.test(segment) && reuse.test(segment));
}

export function reconcileArtifactOutputContract(input: {
  mode: "human" | "machine" | "artifact" | "mixed";
  artifactPatterns: string[];
  description: string;
  requiresArtifact: boolean;
}) {
  const artifactPatterns = Array.from(new Set(input.artifactPatterns.filter((item) => Boolean(item.trim()))));
  if (input.requiresArtifact && !artifactPatterns.length) artifactPatterns.push(...inferArtifactPatterns(input.description));
  return {
    mode: artifactPatterns.length && input.mode === "human" ? "mixed" as const : input.mode,
    artifactPatterns,
  };
}

function activeCapability(item: ClosureCapability) {
  return item.enabled !== false && item.status !== "not-needed" && item.kind !== "eval";
}

function inferFamily(item: Record<string, unknown>) {
  if (["trigger", "capability", "grounding", "integration"].includes(String(item.eval_family))) return String(item.eval_family);
  const category = String(item.category || "");
  if (/^trigger_|no-trigger/.test(category)) return "trigger";
  if (/tool|integration|artifact|mcp|image/.test(category)) return "integration";
  if (/ground|content_policy|state|fact|source/.test(category)) return "grounding";
  return "capability";
}

function providesFocusedEvidence(item: Record<string, unknown>, capability: ClosureCapability) {
  if (!Array.isArray(item.capability_ids) || !item.capability_ids.includes(capability.id)) return false;
  const family = inferFamily(item);
  if (family === "trigger") return false;
  const expected = item.expected && typeof item.expected === "object" ? item.expected as Record<string, unknown> : {};
  const hasEvidence = (Array.isArray(expected.behaviors) && expected.behaviors.length > 0) || (Array.isArray(expected.artifacts) && expected.artifacts.length > 0);
  if (!hasEvidence || !Array.isArray(item.graders)) return false;
  if (["builtin-tool", "mcp", "asset"].includes(capability.kind)) {
    if (family !== "integration" || !item.graders.some((grader) => ["integration", "tool_grounding", "artifact_checker"].includes(String(grader)))) return false;
    const context = item.context && typeof item.context === "object" ? item.context as Record<string, unknown> : {};
    return !["conditional", "optional"].includes(capability.scope || "") || Object.keys(context).some((key) => /activ|tool|integration|routing|scope/i.test(key));
  }
  if (capability.kind === "reference") return family === "grounding" && item.graders.includes("grounding");
  return family === "capability" && item.graders.some((grader) => ["core_capability", "failure_mode", "loop_control"].includes(String(grader)));
}

function parseEvalCoverage(raw: string, capabilities: ClosureCapability[]) {
  const coverage = new Map<string, string[]>();
  try {
    const parsed = JSON.parse(raw) as { evals?: Array<Record<string, unknown>> };
    (parsed.evals || []).forEach((item) => {
      if (typeof item.id !== "string") return;
      capabilities.filter((capability) => providesFocusedEvidence(item, capability)).forEach((capability) => {
        coverage.set(capability.id, [...(coverage.get(capability.id) || []), String(item.id)]);
      });
    });
  } catch {
    // The static bundle audit reports malformed JSON separately.
  }
  return coverage;
}

/** Build the explicit requirement/capability -> implementation -> eval closure
 * used by the autonomous generation loop. This is deterministic and runs
 * before any semantic LLM critic. */
export function auditCapabilityClosure(files: Record<string, string>, fallbackCapabilities: ClosureCapability[] = []): CapabilityClosureReport {
  let capabilities = fallbackCapabilities.filter(activeCapability);
  try {
    const manifest = JSON.parse(files["evals/capability-manifest.json"] || "{}") as { capabilities?: ClosureCapability[] };
    if (Array.isArray(manifest.capabilities) && manifest.capabilities.length) capabilities = manifest.capabilities.filter(activeCapability);
  } catch {
    return {
      score: 0,
      closed: 0,
      total: Math.max(1, capabilities.length),
      issues: [{ id: "manifest-malformed", type: "malformed-manifest", severity: "critical", detail: "能力清单不是有效 JSON，无法证明能力闭环。", route: "eval", files: ["evals/capability-manifest.json"] }],
    };
  }

  const skill = files["SKILL.md"] || "";
  const evalCoverage = parseEvalCoverage(files["evals/evals.json"] || "", capabilities);
  const issues: CapabilityClosureIssue[] = [];
  const closedCapabilities = capabilities.filter((item) => {
    let closed = true;
    const path = item.path || "";
    const implementationRequired = ["reference", "script", "asset"].includes(item.kind);
    if (implementationRequired && (!path || !files[path]?.trim())) {
      issues.push({ id: `${item.id}-implementation`, type: "missing-implementation", severity: "critical", capabilityId: item.id, detail: `能力 ${item.id} 没有真实实现文件。`, route: "resource", files: path ? [path] : ["SKILL.md"] });
      closed = false;
    }
    if (item.layer === "runtime" && implementationRequired && path && files[path] && !skill.includes(path)) {
      issues.push({ id: `${item.id}-routing`, type: "missing-routing", severity: "critical", capabilityId: item.id, detail: `能力 ${item.id} 的实现存在，但主工作流没有说明何时使用。`, route: "workflow", files: ["SKILL.md", path] });
      closed = false;
    }
    if ((item.kind === "builtin-tool" || item.kind === "mcp") && !files["integrations/tool-contracts.json"]?.includes(item.id)) {
      issues.push({ id: `${item.id}-tool-contract`, type: "missing-tool-contract", severity: "critical", capabilityId: item.id, detail: `能力 ${item.id} 缺少可用性、输入、输出和降级契约。`, route: "tool", files: ["integrations/tool-contracts.json"] });
      closed = false;
    }
    if (!(evalCoverage.get(item.id)?.length)) {
      issues.push({ id: `${item.id}-eval`, type: "missing-eval", severity: "critical", capabilityId: item.id, detail: `能力 ${item.id} 没有可执行评测用例。`, route: "eval", files: ["evals/evals.json", "evals/capability-manifest.json"] });
      closed = false;
    }
    return closed;
  }).length;

  const declaredPaths = new Set(capabilities.map((item) => item.path).filter(Boolean));
  Object.keys(files).filter((path) => /^(references|scripts|assets)\//.test(path)).forEach((path) => {
    if (!declaredPaths.has(path) && !skill.includes(path)) {
      issues.push({ id: `orphan-${path}`, type: "orphan-resource", severity: "warning", detail: `${path} 既不负责已声明能力，也没有被运行工作流引用。`, route: "simplify", files: [path] });
    }
  });

  const total = capabilities.length;
  return {
    score: total ? Math.round((closedCapabilities / total) * 100) : 0,
    closed: closedCapabilities,
    total,
    issues,
  };
}

export function summarizeGenerationEvidence(report: OptimizationEvidenceReport): GenerationEvidenceMetrics {
  const total = report.cases.length;
  const passed = report.cases.filter((item) => item.passed).length;
  const score = total ? Math.round(report.cases.reduce((sum, item) => sum + item.score, 0) / total) : 0;
  return { score, passRate: total ? Math.round((passed / total) * 100) : 0, passed, total };
}

/** A candidate can replace the current best bundle only when it improves the
 * held-out goal score without reducing closure or introducing regressions. */
export function decideGenerationGoalGate(input: {
  baseline: OptimizationEvidenceReport;
  candidate: OptimizationEvidenceReport;
  caseIds: string[];
  baselineClosure: number;
  candidateClosure: number;
  baselineBlockers: number;
  candidateBlockers: number;
  baselineCriticalSemanticIssues: number;
  candidateCriticalSemanticIssues: number;
}): GenerationGoalGate {
  const selected = new Set(input.caseIds);
  const beforeCases = input.baseline.cases.filter((item) => selected.has(item.caseId));
  const afterCases = input.candidate.cases.filter((item) => selected.has(item.caseId));
  const beforeById = new Map(beforeCases.map((item) => [item.caseId, item]));
  const beforeScore = beforeCases.length ? Math.round(beforeCases.reduce((sum, item) => sum + item.score, 0) / beforeCases.length) : 0;
  const afterScore = afterCases.length ? Math.round(afterCases.reduce((sum, item) => sum + item.score, 0) / afterCases.length) : 0;
  const reasons: string[] = [];
  const regressions: string[] = [];

  afterCases.forEach((item) => {
    const before = beforeById.get(item.caseId);
    if (before?.passed && !item.passed) regressions.push(`${item.caseId} 从通过变为失败`);
    else if (before && item.score < before.score - 8) regressions.push(`${item.caseId} ${before.score}→${item.score}`);
  });
  if (afterScore <= beforeScore) reasons.push(`保留任务没有严格提升（${beforeScore}→${afterScore}）`);
  if (input.candidateClosure < input.baselineClosure) reasons.push(`能力闭环下降（${input.baselineClosure}%→${input.candidateClosure}%）`);
  if (input.candidateBlockers > input.baselineBlockers) reasons.push(`新增 ${input.candidateBlockers - input.baselineBlockers} 个发布阻塞问题`);
  if (input.baselineCriticalSemanticIssues === 0 && input.candidateCriticalSemanticIssues > 0) reasons.push(`新增 ${input.candidateCriticalSemanticIssues} 个关键语义冲突`);
  else if (input.baselineCriticalSemanticIssues > 0 && input.candidateCriticalSemanticIssues >= input.baselineCriticalSemanticIssues) reasons.push(`关键语义冲突没有减少（${input.baselineCriticalSemanticIssues}→${input.candidateCriticalSemanticIssues}）`);
  if (regressions.length) reasons.push(`出现 ${regressions.length} 项行为回退`);
  return { accepted: reasons.length === 0, scoreDelta: afterScore - beforeScore, reasons, regressions };
}

export function generationGoalSatisfied(input: {
  evidence: GenerationEvidenceMetrics;
  baseline: GenerationEvidenceMetrics;
  closureScore: number;
  blockers: number;
  criticalSemanticIssues: number;
}) {
  const lift = input.evidence.score - input.baseline.score;
  return input.blockers === 0
    && input.closureScore === 100
    && input.criticalSemanticIssues === 0
    && input.evidence.passRate >= 80
    && input.evidence.score >= 78
    && lift >= 3;
}

/** Distinguish a failed Optimization Gate from an exhausted comparison.
 * When both the no-Skill baseline and the current bundle already sit at the
 * exact evaluation ceiling, every held-out case passes, and the bundle has no
 * contract/closure blocker, a strict-lift rule cannot accept a new candidate.
 * That is a completed no-headroom result, not a quality warning. */
export function generationEvaluationAtCeiling(input: {
  evidence: GenerationEvidenceMetrics;
  baseline: GenerationEvidenceMetrics;
  closureScore: number;
  blockers: number;
  criticalSemanticIssues: number;
}) {
  return input.blockers === 0
    && input.criticalSemanticIssues === 0
    && input.closureScore === 100
    && input.baseline.score === 100
    && input.baseline.passRate === 100
    && input.evidence.score === 100
    && input.evidence.passRate === 100;
}
