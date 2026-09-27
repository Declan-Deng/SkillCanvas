import { normalizeCapabilityDelta, type CapabilityDelta } from "./capability-delta.ts";
import { knowledgeRequirementPolicy, type KnowledgeAssessment } from "./knowledge-contract.ts";
import { EMPTY_KNOWLEDGE_PACK, type KnowledgePack } from "./knowledge-research.ts";

/** Bump when a saved browser session must be deterministically reprojected
 * before it can be trusted by the current compiler and validator. */
export const PIPELINE_CONTRACT_VERSION = "knowledge-policy-v2";

export function prepareKnowledgeRuntime(value: CapabilityDelta | unknown) {
  const capabilityDelta = normalizeCapabilityDelta(value);
  const policy = knowledgeRequirementPolicy(capabilityDelta);
  const researchDelta: CapabilityDelta = {
    ...capabilityDelta,
    skillMustTeach: policy.externalGaps,
    researchFocus: Array.from(new Set(policy.externalGaps.flatMap((gap) => gap.researchQuestions))).slice(0, 16),
  };
  return { capabilityDelta, policy, researchDelta };
}

export function createNotRequiredKnowledgePack(value: CapabilityDelta | unknown, generatedAt = new Date().toISOString()): KnowledgePack {
  const { capabilityDelta, policy } = prepareKnowledgeRuntime(value);
  if (policy.required) throw new Error("external 专业知识差值不能被标记为 not-required");
  return {
    ...EMPTY_KNOWLEDGE_PACK,
    status: "not-needed",
    summary: capabilityDelta.skillMustTeach.length
      ? "需要写入 Skill 的行为均来自用户已确认的契约，不需要用网页来源重新证明；系统将直接按已确认的工作方式生成。"
      : "本次按已确认的任务要求生成，不额外声称专业能力提升；需要来源的结论仍须提供证据。",
    coverage: { target: 0, covered: [], missing: [], score: 100 },
    categoryCoverage: { covered: [], missing: [], score: 100 },
    sufficiency: "not-required",
    generatedAt,
  };
}

/** Convert transient UI/compiler state into the only assessment shape the
 * Canonical IR may receive. An external gap can never become not-required.
 */
export function knowledgeAssessmentFromPack(
  value: CapabilityDelta | unknown,
  pack: Pick<KnowledgePack, "sufficiency" | "categoryCoverage" | "evidenceCoverage">,
): KnowledgeAssessment {
  const policy = knowledgeRequirementPolicy(value);
  if (!policy.required) {
    return {
      status: "not-required",
      requiredCategories: [],
      coveredCategories: [],
      missingCategories: [],
    };
  }
  const coveredCategories = policy.requiredCategories.filter((category) => pack.categoryCoverage.covered.includes(category));
  const missingCategories = policy.requiredCategories.filter((category) => !coveredCategories.includes(category));
  const coveredGapIds = policy.requiredGapIds.filter((gapId) => pack.evidenceCoverage?.coveredGapIds.includes(gapId));
  const missingGapIds = policy.requiredGapIds.filter((gapId) => !coveredGapIds.includes(gapId));
  return {
    status: pack.sufficiency === "sufficient" && missingCategories.length === 0 && missingGapIds.length === 0 ? "sufficient" : "insufficient",
    requiredCategories: [...policy.requiredCategories],
    coveredCategories,
    missingCategories,
    requiredGapIds: [...policy.requiredGapIds],
    coveredGapIds,
    missingGapIds,
  };
}

/** Reconcile a cached pack with the current Capability Delta before any UI,
 * compiler or validator consumes it. Saved labels belong to an older derived
 * state and must not be allowed to override the current knowledge policy.
 */
export function reconcileKnowledgePackWithCapabilityDelta(
  pack: KnowledgePack,
  value: CapabilityDelta | unknown,
): KnowledgePack {
  const { capabilityDelta, policy } = prepareKnowledgeRuntime(value);
  if (!policy.required) {
    if (pack.sufficiency === "not-required" && pack.status === "not-needed") return pack;
    return createNotRequiredKnowledgePack(capabilityDelta, pack.generatedAt || new Date().toISOString());
  }
  const evidenceCoverage = pack.evidenceCoverage || {
    requiredGapIds: [...policy.requiredGapIds],
    coveredGapIds: [],
    missingGapIds: [...policy.requiredGapIds],
    requiredCategories: [...policy.requiredCategories],
    coveredCategories: [],
    missingCategories: [...policy.requiredCategories],
    observedCategories: [],
    verifiedRuleCount: 0,
    advisoryRuleCount: 0,
  };
  const coveredGapIds = policy.requiredGapIds.filter((gapId) => evidenceCoverage.coveredGapIds.includes(gapId));
  const missingGapIds = policy.requiredGapIds.filter((gapId) => !coveredGapIds.includes(gapId));
  const coveredCategories = policy.requiredCategories.filter((category) => evidenceCoverage.coveredCategories.includes(category));
  const missingCategories = policy.requiredCategories.filter((category) => !coveredCategories.includes(category));
  const sufficient = missingGapIds.length === 0 && missingCategories.length === 0 && pack.atoms.length > 0;
  return {
    ...pack,
    status: sufficient ? pack.status : "unavailable",
    summary: sufficient
      ? pack.summary
      : "检测到需要外部专业知识的能力差值，但当前缓存没有完整、可核验的证据；系统会重新检索，而不会把它误标为不需要。",
    plan: {
      ...pack.plan,
      required: true,
      capabilityDeltaGapIds: [...policy.requiredGapIds],
      requiredCategories: [...policy.requiredCategories],
      knowledgeGaps: policy.externalGaps.map((gap) => gap.taskDecision),
      queries: capabilityDelta.researchFocus.slice(0, 4),
    },
    categoryCoverage: {
      covered: coveredCategories as KnowledgePack["categoryCoverage"]["covered"],
      missing: missingCategories as KnowledgePack["categoryCoverage"]["missing"],
      score: policy.requiredCategories.length ? Math.round((coveredCategories.length / policy.requiredCategories.length) * 100) : 0,
    },
    evidenceCoverage: {
      ...evidenceCoverage,
      requiredGapIds: [...policy.requiredGapIds],
      coveredGapIds,
      missingGapIds,
      requiredCategories: [...policy.requiredCategories],
      coveredCategories,
      missingCategories,
    },
    sufficiency: sufficient ? "sufficient" : "insufficient",
  };
}
