import {
  externalCapabilityDeltaGaps,
  normalizeCapabilityDelta,
  type CapabilityDelta,
  type CapabilityDeltaGap,
} from "./capability-delta.ts";
import { assessKnowledgeEvidence } from "./knowledge-evidence.ts";

export const REQUIRED_KNOWLEDGE_CATEGORIES = [
  "decision_rules",
  "failure_modes",
  "edge_cases",
  "verification_methods",
] as const;

export type KnowledgeAssessment = {
  status: "sufficient" | "insufficient" | "not-required";
  requiredCategories: string[];
  coveredCategories: string[];
  missingCategories: string[];
  requiredGapIds?: string[];
  coveredGapIds?: string[];
  missingGapIds?: string[];
  observedCategories?: string[];
  verifiedRuleCount?: number;
  advisoryRuleCount?: number;
};

export type KnowledgeRequirementPolicy = {
  required: boolean;
  externalGaps: CapabilityDeltaGap[];
  requiredGapIds: string[];
  requiredCategories: string[];
};

/** Single source of truth for whether build-time knowledge is mandatory.
 * Contract-only behavior is real Skill behavior, but it is fully owned by the
 * user's confirmed contract and must never be turned into a web-search gate.
 */
export function knowledgeRequirementPolicy(value: CapabilityDelta | unknown): KnowledgeRequirementPolicy {
  const delta = normalizeCapabilityDelta(value);
  const externalGaps = externalCapabilityDeltaGaps(delta);
  return {
    required: externalGaps.length > 0,
    externalGaps,
    requiredGapIds: externalGaps.map((gap) => gap.id),
    requiredCategories: externalGaps.length ? [...REQUIRED_KNOWLEDGE_CATEGORIES] : [],
  };
}

/** Canonicalize the assessment from the same policy used by planning and
 * validation. Model-authored status and coverage are hints, never authority.
 */
export function normalizeKnowledgeAssessmentForPolicy(
  value: KnowledgeAssessment | undefined,
  domainEvidence: unknown[],
  policy: Pick<KnowledgeRequirementPolicy, "required" | "requiredGapIds" | "requiredCategories">,
): KnowledgeAssessment {
  if (!policy.required) {
    return {
      status: "not-required",
      requiredCategories: [],
      coveredCategories: [],
      missingCategories: [],
    };
  }
  const requiredCategories = Array.from(new Set(
    (value?.requiredCategories?.length ? value.requiredCategories : policy.requiredCategories)
      .filter((category) => policy.requiredCategories.includes(category)),
  ));
  const completeRequiredCategories = requiredCategories.length
    ? Array.from(new Set([...policy.requiredCategories, ...requiredCategories]))
    : [...policy.requiredCategories];
  const coverage = assessKnowledgeEvidence(domainEvidence, policy.requiredGapIds, completeRequiredCategories);
  return {
    status: coverage.missingCategories.length || coverage.missingGapIds.length ? "insufficient" : "sufficient",
    requiredCategories: completeRequiredCategories,
    ...coverage,
  };
}

export function normalizeKnowledgeAssessmentForDelta(
  value: KnowledgeAssessment | undefined,
  domainEvidence: unknown[],
  delta: CapabilityDelta | unknown,
) {
  return normalizeKnowledgeAssessmentForPolicy(value, domainEvidence, knowledgeRequirementPolicy(delta));
}

/** Returns a deterministic contract error only when external knowledge is
 * genuinely required. This exact predicate is shared by compiler and gate.
 */
export function knowledgeRequirementBypassReason(
  delta: CapabilityDelta | unknown,
  assessment: Pick<KnowledgeAssessment, "status"> | undefined,
) {
  const policy = knowledgeRequirementPolicy(delta);
  if (!policy.required || assessment?.status !== "not-required") return "";
  return "Capability Delta 已声明 external 专业知识差值，但专业知识被标记为 not-required；必须采集四类知识或明确标记 insufficient";
}
