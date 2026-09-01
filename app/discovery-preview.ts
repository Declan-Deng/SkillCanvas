export type DiscoveryPreview = {
  /** This stage has no execution/provenance verifier. Never accept a model's
   * claim that its illustrative fixture is a real tool/file result. */
  provenance?: "illustrative";
  title: string;
  scenario: string;
  userPrompt: string;
  sampleInput: string;
  output: string;
  learned: string[];
  uncertainties: string[];
  feedbackOptions: string[];
};

export type InterviewReadiness = {
  confidence: number;
  canFinish: boolean;
  criticalGaps: string[];
  reason: string;
};

export const EMPTY_INTERVIEW_READINESS: InterviewReadiness = {
  confidence: 0,
  canFinish: false,
  criticalGaps: [],
  reason: "先看一次理解预演，再确认真正影响结果的选择。",
};

/** A later recommendation must not silently reverse an earlier rejection.
 * The option may remain available, but the UI should not recommend or
 * preselect it until the user explicitly changes their mind. */
export function optionConflictsWithPriorEvidence(option: string, evidence: string) {
  const negativeStatements = evidence
    .split(/[\n；;]/)
    .map((item) => item.trim())
    .filter((item) => /不对|不要|不是|不需要|不希望|不符合|别用|取消|排除|拒绝/i.test(item));
  if (!negativeStatements.length) return false;
  const chunks = option
    .split(/[（(）)、,，/:：\s]+/)
    .map((item) => item.replace(/^(?:如|例如|比如|使用|采用)/, "").replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "").toLowerCase())
    .filter((item) => item.length >= 3);
  if (!chunks.length) return false;
  return negativeStatements.some((statement) => {
    const normalized = statement.replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "").toLowerCase();
    return chunks.some((chunk) => normalized.includes(chunk));
  });
}

function clean(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function stringList(value: unknown, limit: number, itemLimit: number) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim().slice(0, itemLimit))))
    .slice(0, limit);
}

export function markUnsupportedPreviewMetrics(output: string, userPrompt: string) {
  return output.replace(/\d+(?:\.\d+)?\s*(?:万人|万元|亿元|%|％|倍|万|亿|元|人|次|天|周|月|年)/g, (metric) => userPrompt.includes(metric)
    ? metric
    : "[待确认：量化结果]");
}

export function normalizeDiscoveryPreview(value: unknown): DiscoveryPreview | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  // These are reused as executable Eval inputs, not just preview labels.
  const userPrompt = typeof candidate.userPrompt === "string" ? candidate.userPrompt.trim() : "";
  const rawOutput = clean(candidate.output, 8_000);
  const output = markUnsupportedPreviewMetrics(rawOutput, userPrompt);
  const learned = stringList(candidate.learned, 5, 180);
  const feedbackOptions = stringList(candidate.feedbackOptions, 5, 40);
  if (!userPrompt || output.length < 20 || learned.length < 2 || feedbackOptions.length < 3) return null;
  return {
    provenance: "illustrative",
    title: clean(candidate.title, 80) || "AI 的第一版理解预演",
    scenario: clean(candidate.scenario, 320) || "根据当前目标和资料生成的预演，不代表最终 Skill。",
    userPrompt,
    sampleInput: typeof candidate.sampleInput === "string" ? candidate.sampleInput.trim() : "",
    output,
    learned,
    uncertainties: Array.from(new Set([
      ...stringList(candidate.uncertainties, 5, 180),
      ...(rawOutput !== output ? ["输入中没有出现的具体数字已标为待确认，避免把预演当成真实事实。"] : []),
    ])).slice(0, 5),
    feedbackOptions,
  };
}

export function normalizeInterviewReadiness(value: unknown): InterviewReadiness {
  if (!value || typeof value !== "object") return EMPTY_INTERVIEW_READINESS;
  const candidate = value as Record<string, unknown>;
  const numericConfidence = typeof candidate.confidence === "number"
    ? candidate.confidence
    : Number(candidate.confidence);
  const confidence = Number.isFinite(numericConfidence)
    ? Math.max(0, Math.min(100, Math.round(numericConfidence)))
    : 0;
  const criticalGaps = stringList(candidate.criticalGaps, 4, 100);
  const requestedCanFinish = candidate.canFinish === true;
  return {
    confidence,
    canFinish: requestedCanFinish && confidence >= 82 && criticalGaps.length <= 1,
    criticalGaps,
    reason: clean(candidate.reason, 240) || (criticalGaps.length
      ? `还需要确认：${criticalGaps.join("、")}`
      : "AI 会继续确认真正影响结果的选择。"),
  };
}

export function previewFeedbackEvidence(
  preview: DiscoveryPreview | null,
  selected: string[],
  custom: string,
) {
  if (!preview) return [];
  const normalizedSelected = Array.from(new Set(selected.map((item) => item.trim()).filter(Boolean))).slice(0, 5);
  const customFeedback = custom.trim().slice(0, 500);
  return [
    {
      dimension: "理解预演",
      evidenceKind: "material" as const,
      polarity: "neutral" as const,
      question: "AI 根据一句话做出的第一版结果",
      answer: `以下是 AI 生成的模拟示例，不是用户事实、授权或真实文件/工具证据。不得从中提取用户要求；只根据下一项用户反馈调整。\n示例任务：${preview.userPrompt}\n示例输入：${preview.sampleInput}\n示意结果：${preview.output.slice(0, 2_000)}`,
    },
    {
      dimension: "预演反馈",
      question: "看完预演，哪里还不够懂你",
      answer: [...normalizedSelected, customFeedback].filter(Boolean).join("；") || "方向基本符合预期，继续细化关键选择",
    },
  ];
}
