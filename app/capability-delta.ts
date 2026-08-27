export type CapabilityDeltaGap = {
  id: string;
  taskDecision: string;
  bareModelBehavior: string;
  requiredSkillBehavior: string;
  whySkillIsNeeded: string;
  researchQuestions: string[];
};

export type CapabilityDelta = {
  status: "ready" | "insufficient";
  summary: string;
  bareModelCan: string[];
  skillMustTeach: CapabilityDeltaGap[];
  excludedGenericKnowledge: string[];
  researchFocus: string[];
};

const clean = (value: unknown, fallback = "", max = 420) => typeof value === "string"
  ? value.replace(/\s+/g, " ").trim().slice(0, max) || fallback
  : fallback;

const list = (value: unknown, limit = 12, max = 260) => Array.isArray(value)
  ? Array.from(new Set(value.map((item) => clean(item, "", max)).filter(Boolean))).slice(0, limit)
  : [];

const slug = (value: string, index: number) => value.toLowerCase()
  .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 52) || `gap-${index + 1}`;

/** Normalize the model-authored comparison into a compiler-owned contract.
 * A generic quality claim is never accepted as a reason to add Skill content. */
export function normalizeCapabilityDelta(value: unknown): CapabilityDelta {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const rawGaps = Array.isArray(raw.skillMustTeach) ? raw.skillMustTeach : [];
  const seen = new Set<string>();
  const gaps = rawGaps.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = item as Record<string, unknown>;
    const taskDecision = clean(candidate.taskDecision, "", 260);
    const requiredSkillBehavior = clean(candidate.requiredSkillBehavior, "", 420);
    const whySkillIsNeeded = clean(candidate.whySkillIsNeeded, "", 360);
    const combined = `${taskDecision} ${requiredSkillBehavior} ${whySkillIsNeeded}`;
    if (!taskDecision || !requiredSkillBehavior || !whySkillIsNeeded) return [];
    const genericOnly = /^(?:更|保持|确保|做到|提供)?\s*(?:专业|清晰|准确|自然|简洁|高质量|有逻辑|完整|更好|好)[。.!！]?$/i;
    if (genericOnly.test(requiredSkillBehavior) || genericOnly.test(whySkillIsNeeded)) return [];
    const key = `${taskDecision}|${requiredSkillBehavior}`.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      id: clean(candidate.id, slug(taskDecision, index), 80).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || `gap-${index + 1}`,
      taskDecision,
      bareModelBehavior: clean(candidate.bareModelBehavior, "裸模型能完成通用理解与表达，但不能稳定执行该专属判断", 360),
      requiredSkillBehavior,
      whySkillIsNeeded,
      researchQuestions: list(candidate.researchQuestions, 8, 260),
    }];
  }).slice(0, 12);
  const researchFocus = Array.from(new Set([
    ...list(raw.researchFocus, 12, 260),
    ...gaps.flatMap((gap) => gap.researchQuestions),
  ])).slice(0, 16);
  return {
    status: gaps.length ? "ready" : "insufficient",
    summary: clean(raw.summary, gaps.length
      ? `已识别 ${gaps.length} 项裸模型与目标 Skill 之间的行为差值`
      : "尚未识别出可证明的能力差值；不会用通用最佳实践填充 Skill。", 620),
    bareModelCan: list(raw.bareModelCan, 12, 260),
    skillMustTeach: gaps,
    excludedGenericKnowledge: list(raw.excludedGenericKnowledge, 12, 260),
    researchFocus,
  };
}

export const EMPTY_CAPABILITY_DELTA: CapabilityDelta = {
  status: "insufficient",
  summary: "尚未运行 Capability Delta 分析",
  bareModelCan: [],
  skillMustTeach: [],
  excludedGenericKnowledge: [],
  researchFocus: [],
};
