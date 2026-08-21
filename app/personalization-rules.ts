const FEEDBACK_SECTION_HEADING = "## Confirmed Skill-specific iteration feedback";

type FeedbackAwareCapabilityPlan = {
  riskBranches?: Array<{ condition: string; action: string; stopOrRedirect: string }>;
  items?: Array<{ kind?: string; fallback?: string }>;
};

export function normalizeFeedbackRequirement(value: string) {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
}

export function feedbackKeywords(value: string) {
  const normalized = normalizeFeedbackRequirement(value)
    .replace(/^(?:我)?(?:想要?|希望|需要|请|麻烦|最好|能不能|可以)?\s*(?:看到?|显示|增加|添加|补充|加入|支持|突出|关注)?\s*/i, "")
    .replace(/(?:这个|这一点|一下|一些|信息|内容|结果)$/g, "")
    .trim();
  const latin = normalized.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g) || [];
  const chinese = normalized.match(/[\u3400-\u9fff]{2,12}/g) || [];
  return Array.from(new Set([...chinese, ...latin])).slice(0, 6);
}

export function feedbackAppearsInRuntimeFiles(files: Record<string, string>, feedback: string) {
  const runtimeText = Object.entries(files)
    .filter(([path]) => path === "SKILL.md" || path.startsWith("references/") || path.startsWith("scripts/") || path.startsWith("assets/"))
    .map(([, content]) => content)
    .join("\n");
  const keywords = feedbackKeywords(feedback);
  return keywords.length ? keywords.some((keyword) => runtimeText.includes(keyword)) : runtimeText.includes(normalizeFeedbackRequirement(feedback));
}

export function extractConfirmedPersonalizationFeedback(skill: string) {
  const match = skill.match(/\n## Confirmed Skill-specific iteration feedback\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  return (match?.[1] || "")
    .split("\n")
    .map((line) => line.match(/^\s*-\s+(.+)$/)?.[1]?.trim() || "")
    .filter(Boolean);
}

function requestsDraftBeforeClarification(feedback: string[]) {
  return feedback.some((item) => (
    /(?:先|直接|立即|默认).{0,12}(?:给|生成|写|产出|起草).{0,12}(?:草稿|版本|结果|内容|方案)/i.test(item)
    || /(?:不要|无需|别).{0,12}(?:总是|一开始|先)?(?:问|追问|补充信息)/i.test(item)
  ));
}

/** Keep compiler-owned runtime branches aligned with feedback confirmed after
 * a real Demo. Otherwise finalizeSkillFiles would regenerate the old branch
 * from the pre-Demo capability plan and silently undo the personalization. */
export function reconcileCapabilityPlanWithFeedback<T extends FeedbackAwareCapabilityPlan>(plan: T, feedback: string[]): T {
  const cleanFeedback = Array.from(new Set(feedback.map(normalizeFeedbackRequirement).filter(Boolean)));
  if (!requestsDraftBeforeClarification(cleanFeedback)) return plan;

  const riskBranches = (plan.riskBranches || []).map((branch) => (
    /(?:缺少|不足|过少|未提供).{0,24}(?:输入|信息|素材)|(?:输入|信息|素材).{0,24}(?:缺少|不足|过少|未提供)/i.test(branch.condition)
      ? {
          ...branch,
          action: "先使用现有输入生成一版可逆草稿，并明确标注假设、推测和待确认内容",
          stopOrRedirect: "只有缺口会改变任务方向、造成安全风险或无法形成可用草稿时，才请求最少必要信息",
        }
      : branch
  ));
  const items = (plan.items || []).map((item) => (
    item.kind === "llm" && /(?:请求|追问|补充).{0,20}(?:输入|信息|素材)|(?:输入|信息|素材).{0,20}(?:请求|追问|补充)/i.test(item.fallback || "")
      ? { ...item, fallback: "先基于现有输入生成可逆草稿并标注假设；只有无法安全起草时才请求最少必要信息" }
      : item
  ));
  return { ...plan, riskBranches, items };
}

export function confirmedPersonalizationConflicts(files: Record<string, string>) {
  const skill = files["SKILL.md"] || "";
  const feedback = extractConfirmedPersonalizationFeedback(skill);
  if (!requestsDraftBeforeClarification(feedback)) return [];
  const runtimeBranches = skill.match(/\n## Runtime branches\s*\n([\s\S]*?)(?=\n##\s|$)/i)?.[1] || "";
  const capabilities = skill.match(/\n## Capabilities and bundled resources\s*\n([\s\S]*?)(?=\n##\s|$)/i)?.[1] || "";
  // Evaluate each compiled branch independently. A stop rule in the following
  // privacy/safety branch must not be joined to the missing-input branch.
  const runtimeLines = runtimeBranches.split("\n").map((line) => line.trim()).filter(Boolean);
  const capabilityLines = capabilities.split("\n").map((line) => line.trim()).filter(Boolean);
  const staleStopBranch = runtimeLines.some((line) => (
    /(?:缺少|不足|过少|未提供).{0,40}(?:输入|信息|素材)|(?:输入|信息|素材).{0,40}(?:缺少|不足|过少|未提供)/i.test(line)
    && /(?:请求|追问|补充).{0,100}(?:停止|等待)|(?:停止|等待).{0,100}(?:请求|追问|补充)/i.test(line)
  )) || capabilityLines.some((line) => (
    /If blocked:/i.test(line)
    && /(?:请求|追问|补充).{0,40}(?:输入|信息|素材)|(?:输入|信息|素材).{0,40}(?:请求|追问|补充)/i.test(line)
    && !/(?:先|直接|立即|默认).{0,30}(?:草稿|版本|结果|内容|方案)/i.test(line)
  ));
  return staleStopBranch ? ["用户确认先产出草稿，但缺失信息分支仍要求直接停止并追问"] : [];
}

export function applyConfirmedPersonalizationFeedback(files: Record<string, string>, feedback: string[]) {
  const cleanFeedback = Array.from(new Set(feedback.map(normalizeFeedbackRequirement).filter(Boolean)));
  if (!cleanFeedback.length || !files["SKILL.md"]) return files;

  const skill = files["SKILL.md"];
  const sectionPattern = /\n## Confirmed Skill-specific iteration feedback\s*\n([\s\S]*?)(?=\n##\s|$)/i;
  const existing = skill.match(sectionPattern)?.[1]
    ?.split("\n")
    .map((line) => line.replace(/^\s*-\s*/, "").trim())
    .filter(Boolean) || [];
  const requirements = Array.from(new Set([...existing, ...cleanFeedback]));
  const section = `${FEEDBACK_SECTION_HEADING}\n\nThese are explicit requirements for this Skill, confirmed after reviewing a real Demo. Apply them to the relevant workflow, output, and validation branch; do not generalize them into a cross-task personality claim.\n\n${requirements.map((item) => `- ${item}`).join("\n")}`;
  const nextSkill = sectionPattern.test(skill)
    ? skill.replace(sectionPattern, `\n${section}`)
    : `${skill.trim()}\n\n${section}`;
  return { ...files, "SKILL.md": nextSkill };
}
