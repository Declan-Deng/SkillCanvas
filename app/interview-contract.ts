import { pickRecommendedInterviewOption } from "./interview-discovery.ts";

export const INTERVIEW_UNSURE_OPTION = "我不确定，请 AI 帮我判断";

export const INTERVIEW_DIMENSIONS = [
  ["使用场景", "核心价值", "任务变化", "成功标准"],
  ["输入信息", "工作流程", "交付形式", "信息策略"],
  ["自主程度", "质量标准", "失败模式", "协作边界"],
  ["实战任务", "触发语言", "偏好复用", "交付确认"],
] as const;

export type InterviewQuestionContract = {
  id: string;
  dimension: string;
  label: string;
  helper: string;
  placeholder: string;
  options: string[];
  selectionMode: "single" | "multiple";
  recommendedOption?: string;
};

export type InterviewContractIssue = {
  path: string;
  message: string;
};

/**
 * The application owns question count, dimensions, stable ids and the
 * beginner fallback option. The model owns only the task-specific wording and
 * concrete choices. Both the API boundary and browser use this exact parser so
 * a server success can never become a client-only schema failure.
 */
export function normalizeInterviewQuestions(
  raw: unknown,
  roundIndex: number,
  priorEvidence = "",
): { questions: InterviewQuestionContract[]; issues: InterviewContractIssue[] } {
  const expected = INTERVIEW_DIMENSIONS[roundIndex];
  if (!expected) return { questions: [], issues: [{ path: "/round", message: `不支持第 ${roundIndex + 1} 轮需求细化` }] };
  const source = Array.isArray(raw) ? raw : [];
  const candidates = source.filter((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const value = item as Record<string, unknown>;
    const searchable = [value.dimension, value.label, value.helper, ...(Array.isArray(value.options) ? value.options : [])].join(" ");
    return value.dimension !== "使用频率" && !/(?:多久|多频繁|使用频率|更新频率)/.test(searchable);
  });
  const issues: InterviewContractIssue[] = [];
  // Reserve explicit dimensions first. Positional recovery may use only a
  // genuinely unlabelled question, never steal another dimension's question.
  const assigned = expected.map((dimension) => candidates.find((candidate) => (candidate as Record<string, unknown>).dimension === dimension));
  const unlabelled = candidates.filter((candidate) => !(candidate as Record<string, unknown>).dimension);
  const seenLabels = new Set<string>();
  const questions = expected.flatMap((dimension, index) => {
    const item = assigned[index] || unlabelled.shift();
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      issues.push({ path: `/questions/${index}`, message: `缺少“${dimension}”问题` });
      return [];
    }
    const value = item as Record<string, unknown>;
    const label = typeof value.label === "string" ? value.label.trim().slice(0, 180) : "";
    const labelKey = label.replace(/\s+/g, "");
    if (labelKey && seenLabels.has(labelKey)) {
      issues.push({ path: `/questions/${index}/label`, message: `“${dimension}”重复使用了其他问题，不能代替缺失维度` });
      return [];
    }
    seenLabels.add(labelKey);
    const options = Array.isArray(value.options)
      ? Array.from(new Set(value.options
        .filter((option): option is string => typeof option === "string" && Boolean(option.trim()))
        .map((option) => option.trim().slice(0, 80))))
        .filter((option) => option !== INTERVIEW_UNSURE_OPTION)
        .slice(0, 4)
      : [];
    if (label.length < 4) issues.push({ path: `/questions/${index}/label`, message: `“${dimension}”缺少可读的问题文案` });
    if (options.length < 3) issues.push({ path: `/questions/${index}/options`, message: `“${dimension}”至少需要 3 个具体选项` });
    if (label.length < 4 || options.length < 3) return [];
    options.push(INTERVIEW_UNSURE_OPTION);
    const recommendedOption = pickRecommendedInterviewOption(options, value.recommendedOption, priorEvidence, INTERVIEW_UNSURE_OPTION);
    return [{
      id: `ai-round-${roundIndex + 1}-question-${index + 1}`,
      dimension,
      label,
      helper: typeof value.helper === "string" && value.helper.trim()
        ? value.helper.trim().slice(0, 240)
        : "这个选择会影响 Skill 的具体行为。",
      placeholder: typeof value.placeholder === "string" && value.placeholder.trim()
        ? value.placeholder.trim().slice(0, 180)
        : "补充你的具体情况",
      options,
      selectionMode: value.selectionMode === "multiple" ? "multiple" as const : "single" as const,
      recommendedOption,
    }];
  });
  if (!Array.isArray(raw)) issues.unshift({ path: "/questions", message: "questions 必须是数组" });
  if (questions.length !== expected.length && !issues.length) issues.push({ path: "/questions", message: `必须包含 ${expected.length} 个问题` });
  return { questions, issues };
}

export function normalizeInterviewPayload(mode: "preview" | "interview", value: unknown, roundIndex: number, priorEvidence = "") {
  const payload = value && typeof value === "object" && !Array.isArray(value) ? structuredClone(value) as Record<string, unknown> : {};
  const result = normalizeInterviewQuestions(payload.questions, roundIndex, priorEvidence);
  payload.questions = result.questions;
  const issues = [...result.issues];
  if (mode === "preview") {
    if (typeof payload.interpretation !== "string" || payload.interpretation.trim().length < 20) {
      issues.push({ path: "/interpretation", message: "缺少完整的目标理解" });
    }
    const preview = payload.preview;
    if (!preview || typeof preview !== "object" || Array.isArray(preview)) issues.push({ path: "/preview", message: "缺少可展示的理解预演" });
    else {
      const item = preview as Record<string, unknown>;
      for (const key of ["title", "scenario", "userPrompt", "sampleInput", "output"] as const) {
        if (typeof item[key] !== "string" || !item[key].trim()) issues.push({ path: `/preview/${key}`, message: `预演缺少 ${key}` });
      }
    }
  }
  return { payload, issues };
}
