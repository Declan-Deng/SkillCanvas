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

const DECISION_BOUNDARY_SIGNAL = /(?:若|当|仅当|只有|除非|否则|先.{0,48}再|取决于|决定|判断|选择|区分|分类|优先级|排序规则|阈值|例外|边界|失败|回退|恢复|校验|验证|证据|来源|可追溯|映射|去重|冲突|权限|工具|解析|分支|状态|风险|when|if|unless|before|after|decid|choose|classif|priorit|threshold|exception|failure|fallback|recover|verif|evidence|source|branch|permission|tool|parse)/i;
const SPECIFIC_FAILURE_SIGNAL = /(?:遗漏|丢失|误判|错误|冲突|虚构|编造|推断为事实|泄露|混淆|重复|失效|失败|回退|中断|不可|不能|无法|不稳定|不可靠|不可验证|不可追溯|解析|风险|偏差|污染|代价|用户明确|omit|miss|lose|loss|wrong|error|conflict|fabricat|hallucinat|infer.{0,12}fact|leak|duplicate|fail|regress|interrupt|cannot|unable|unstable|unreliable|unverif|untrace|parse|risk|bias|pollut|user explicitly)/i;
const GENERIC_WORKFLOW_REASON = /^(?:为了?|从而|以便)?\s*(?:确保|提高|提升|保证|便于|使).{0,80}(?:准确|全面|完整|清晰|合理|匹配|符合|要求|依据|编辑|后续|质量)[。.!！]?$/i;

/** A real delta must encode a decision boundary or deterministic guard and a
 * concrete failure it prevents. Merely restating the user's workflow is a
 * bare-model task description, not additional Skill capability. */
export function capabilityDeltaGapIsDefensible(value: Partial<CapabilityDeltaGap>) {
  const taskDecision = clean(value.taskDecision, "", 260);
  const requiredSkillBehavior = clean(value.requiredSkillBehavior, "", 420);
  const whySkillIsNeeded = clean(value.whySkillIsNeeded, "", 360);
  if (!taskDecision || !requiredSkillBehavior || !whySkillIsNeeded) return false;
  if (!DECISION_BOUNDARY_SIGNAL.test(`${taskDecision} ${requiredSkillBehavior}`)) return false;
  if (!SPECIFIC_FAILURE_SIGNAL.test(`${value.bareModelBehavior || ""} ${whySkillIsNeeded}`)) return false;
  if (GENERIC_WORKFLOW_REASON.test(whySkillIsNeeded)) return false;
  return true;
}

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
    if (!capabilityDeltaGapIsDefensible({
      taskDecision,
      bareModelBehavior: clean(candidate.bareModelBehavior, "", 360),
      requiredSkillBehavior,
      whySkillIsNeeded,
    })) return [];
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
