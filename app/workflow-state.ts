export const REQUIREMENT_DIMENSIONS = [
  "使用场景", "核心价值", "任务变化", "成功标准",
  "输入信息", "工作流程", "交付形式", "信息策略",
  "自主程度", "质量标准", "失败模式", "协作边界",
  "实战任务", "触发语言", "偏好复用", "交付确认",
] as const;

export type WorkflowStepId = "brief" | "interview" | "blueprint" | "build" | "evaluate" | "ship";

export const WORKFLOW_STEPS: Array<{ id: WorkflowStepId; label: string; eyebrow: string }> = [
  { id: "brief", label: "说出想法", eyebrow: "01" },
  { id: "interview", label: "预演并理解", eyebrow: "02" },
  { id: "blueprint", label: "确认关键决定", eyebrow: "03" },
  { id: "build", label: "生成并优化", eyebrow: "04" },
  { id: "evaluate", label: "对照验证", eyebrow: "05" },
  { id: "ship", label: "带走使用", eyebrow: "06" },
];

export function normalizeWorkflowStep(value: unknown): WorkflowStepId | null {
  const step = String(value);
  return WORKFLOW_STEPS.some((item) => item.id === step) ? step as WorkflowStepId : null;
}

export function canNavigateToWorkflowStep(target: WorkflowStepId, current: WorkflowStepId, completed: Set<WorkflowStepId>) {
  const targetIndex = WORKFLOW_STEPS.findIndex((item) => item.id === target);
  return targetIndex === 0 || target === current || WORKFLOW_STEPS.slice(0, targetIndex).every((item) => completed.has(item.id));
}

export type RequirementDimension = typeof REQUIREMENT_DIMENSIONS[number];

export function summarizeRequirementCoverage(evidence: Array<{ dimension: string; answer: string }>) {
  const allowed = new Set<string>(REQUIREMENT_DIMENSIONS);
  const covered = new Set(evidence.map((item) => item.dimension).filter((dimension) => allowed.has(dimension)));
  const uncertain = new Set(evidence
    .filter((item) => allowed.has(item.dimension) && /不确定|待确认|尚未确认/.test(item.answer))
    .map((item) => item.dimension));
  return { covered, uncertain, coveredCount: covered.size, uncertainCount: uncertain.size };
}

const UNCERTAINTY = /未明确|没有明确|尚未明确|未提及|没有提及|尚未提供|没有提供|待确认|不确定|可能需要|可能希望/i;
const TERM_SUFFIX = "项|字段|格式|方式|内容|流程|文件|目标|时间|风险|示例|资料|工具|结果|要求|偏好|指标|清单|报告|规则|步骤|日期|负责人";
const LEADING_WORDS = /^(?:用户|我|我们|请|希望|需要|要求|必须|输出|交付|生成|提供|包含|包括|支持|展示|检查|最终|同时|还要|以及|并且)+/;

function cleanTerm(value: string) {
  return value
    .replace(/[“”"'`*#()[\]【】]/g, "")
    .replace(LEADING_WORDS, "")
    .replace(/^(?:一个|一份|一些|具体|明确|对应|相关)/, "")
    .replace(/(?:即可|就行|都要|为准)$/g, "")
    .trim();
}

/** Extract only phrases the user actually wrote, so the blueprint compiler can
 * correct false "not confirmed" claims without promoting model inferences. */
export function extractExplicitRequirementTerms(evidence: string) {
  const terms = new Set<string>();
  evidence.split(/[。！？!?；;\n]/).forEach((sentence) => {
    const listMatches = sentence.matchAll(/(?:包含|包括|需要|要求|希望|输出|交付|生成|提供|展示|检查|支持)\s*([^。！？!?；;]{2,64})/g);
    for (const match of listMatches) {
      match[1].split(/、|，|,|以及|并且|和|与/).map(cleanTerm).filter((item) => item.length >= 2 && item.length <= 24).forEach((item) => terms.add(item));
    }
    const nouns = sentence.match(new RegExp(`[\\u3400-\\u9fffA-Za-z0-9_-]{2,18}(?:${TERM_SUFFIX})`, "g")) || [];
    nouns.map(cleanTerm).filter((item) => item.length >= 2 && item.length <= 24).forEach((item) => terms.add(item));
  });
  return Array.from(terms).sort((left, right) => right.length - left.length);
}

export type BlueprintLike = { content: string; status?: "ready" | "attention"; [key: string]: unknown };

/**
 * Cross-check user-visible blueprint copy against explicit requirement evidence.
 * The model may still write useful uncertainty notes, but it cannot describe an
 * exact phrase supplied by the user as absent or unconfirmed.
 */
export function reconcileBlueprintProvenance<T extends BlueprintLike>(sections: T[], explicitEvidence: string): T[] {
  const terms = extractExplicitRequirementTerms(explicitEvidence);
  return sections.map((section) => {
    let changed = false;
    let content = section.content;
    for (const term of terms) {
      if (!content.includes(term)) continue;
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const patterns = [
        new RegExp(`(?:用户)?(?:尚未|没有|未)(?:明确|提及|提供)[^，。；\\n]{0,28}${escaped}[^，。；\\n]{0,18}`, "gi"),
        new RegExp(`待确认[：:]?[^，。；\\n]{0,28}${escaped}[^，。；\\n]{0,18}`, "gi"),
        new RegExp(`${escaped}[^，。；\\n]{0,16}(?:仍)?(?:待确认|未明确|不确定)`, "gi"),
      ];
      patterns.forEach((pattern) => {
        content = content.replace(pattern, (match) => {
          if (!UNCERTAINTY.test(match)) return match;
          changed = true;
          return `${term}已由用户明确提出（来源：用户明确输入）`;
        });
      });
    }
    content = content.replace(/（来源：用户明确输入）（来源：用户明确输入）/g, "（来源：用户明确输入）");
    return changed ? { ...section, content } : section;
  });
}
