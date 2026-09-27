/** Shared by research compilation and canonical IR. A category label or a
 * source URL alone never constitutes a closed capability gap. */
export type KnowledgeSourceSupport = { url: string; quote: string };
export type KnowledgeVerification = {
  fingerprint: string;
  sourceSupported: boolean;
  deltaRelevant: boolean;
  categoryValid: boolean;
  notGeneric: boolean;
  notUserPolicy: boolean;
  verifiedGapIds: string[];
  reason: string;
  /** Compiler-owned clause IDs, each tied to the already located excerpts. */
  supportChecks: { id: string; sourceIndexes: number[]; reason: string; supported?: boolean }[];
};

const strings = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()))] : [];
export const evidenceText = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");

export function knowledgeClaim(value: Record<string, unknown>) {
  const rawSupport = value.sourceSupport || value.source_support;
  const sourceSupport = (Array.isArray(rawSupport) ? rawSupport : []).flatMap((item): KnowledgeSourceSupport[] => {
    if (!item || typeof item !== "object" || typeof item.url !== "string" || typeof item.quote !== "string") return [];
    return [{ url: item.url, quote: item.quote }];
  });
  return {
    knowledge: String(value.knowledge || ""),
    decision: String(value.decision || ""),
    action: String(value.action || value.rule || value.observable_behavior || ""),
    appliesWhen: String(value.appliesWhen || value.applies_when || ""),
    exception: String(value.exception || ""),
    category: String(value.category || ""),
    gapIds: strings(value.gapIds || value.gap_ids).sort(),
    sourceSupport,
  };
}

export function knowledgeClaimFingerprint(value: Record<string, unknown>) {
  let hash = 2166136261;
  for (const char of JSON.stringify(knowledgeClaim(value))) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return `knowledge-v3-${(hash >>> 0).toString(16)}`;
}

export function knowledgeSupportChecks(value: Record<string, unknown>) {
  const claim = knowledgeClaim(value);
  return (["knowledge", "action", "exception"] as const).flatMap((field) => {
    // Absence of a sourced exception is an uncertainty marker, not a claim.
    if (field === "exception" && /^(?:无|无特殊例外|暂无|来源未说明例外|none|not specified|unknown)[。.]?$/i.test(claim[field].trim())) return [];
    return claim[field].split(/[；;。\n]+|\.(?=\s|$)/u).map((text) => text.trim()).filter(Boolean)
      .map((text, index) => ({ id: `${field}:${index}`, claim: text }));
  });
}

/** A semantic review cannot self-authorize invented output literals or
 * technical constants. These mechanically checkable facts need exact source
 * support; task-specific labels belong in the user contract, not web rules. */
export function knowledgeGroundingGaps(value: Record<string, unknown>) {
  const claim = knowledgeClaim(value);
  const evidence = evidenceText(claim.sourceSupport.map((item) => item.quote).join("\n"));
  const operationalText = `${claim.action}\n${claim.exception}`;
  const literals = [...operationalText.matchAll(/(?:标记|标注|填写|填入|返回|设为|设置为|显示|改为|替换为|写|label|mark|write|return|set|replace)[^。；;\n]{0,32}?[“‘"`]([^”’"`\n]{1,100})[”’"`]/giu)].map((match) => match[1]);
  const technicalConstants = [...operationalText.matchAll(/\b(?:[A-Z][A-Z0-9_-]{1,12}|\d+(?:\.\d+)?%?)\b/g)].map((match) => match[0]);
  return [...new Set([...literals, ...technicalConstants])].filter((value) => !evidence.includes(evidenceText(value)));
}

export function hasVerifiedKnowledgeSupport(value: Record<string, unknown>) {
  return knowledgeVerificationFailures(value).length === 0;
}

/** Report the actual deterministic veto, not only the model's prose verdict. */
export function knowledgeVerificationFailures(value: Record<string, unknown>) {
  const claim = knowledgeClaim(value);
  const verification = value.verification as KnowledgeVerification | undefined;
  const checks = knowledgeSupportChecks(value);
  const failures: string[] = [];
  if (!claim.decision || !claim.action || !claim.appliesWhen || !claim.gapIds.length) failures.push("缺少决策、动作、适用条件或能力缺口");
  const unsupported = knowledgeGroundingGaps(value);
  if (unsupported.length) failures.push(`来源未支持具体标签或数值：${unsupported.join("、")}`);
  if (!claim.sourceSupport.length || claim.sourceSupport.some((support) => !support.url || !support.quote)) failures.push("缺少可定位的来源片段");
  if (verification?.fingerprint !== knowledgeClaimFingerprint(value)) failures.push("核验结果与候选版本不一致");
  if (verification?.sourceSupported !== true) failures.push("来源未支持完整表述");
  if (verification?.deltaRelevant !== true) failures.push("未证实能补足对应能力缺口");
  if (verification?.categoryValid !== true) failures.push("知识类别不匹配");
  if (verification?.notGeneric !== true) failures.push("仍属于泛化建议");
  if (verification?.notUserPolicy !== true) failures.push("把用户设定误当成外部知识");
  if (!Array.isArray(verification?.verifiedGapIds) || claim.gapIds.some((id) => !verification.verifiedGapIds.includes(id))) failures.push("部分能力缺口未获核验");
  if (!Array.isArray(verification?.supportChecks) || verification.supportChecks.length !== checks.length
    || checks.some((check) => {
      const receipts = verification.supportChecks.filter((item) => item.id === check.id);
      return receipts.length !== 1 || typeof receipts[0].reason !== "string" || !receipts[0].reason.trim()
        || receipts[0].supported === false
        || !Array.isArray(receipts[0].sourceIndexes) || !receipts[0].sourceIndexes.length
        || receipts[0].sourceIndexes.some((index) => !Number.isInteger(index) || index < 0 || index >= claim.sourceSupport.length);
    })) failures.push("逐句来源核验凭据缺失或无效");
  return failures;
}

// Decisions come from structured verdicts and located clause receipts.
// Explanation prose is diagnostic only: keyword matching cannot determine
// negation or whether a caveat concerns this claim or an unrelated scenario.

export function knowledgeDecisionKey(value: Record<string, unknown>) {
  const claim = knowledgeClaim(value);
  return [claim.appliesWhen, claim.decision, claim.action, claim.exception].map(evidenceText).join("|");
}

export function isExcludedKnowledge(value: Record<string, unknown>, exclusions: string[], userPolicies: string[] = []) {
  const claim = knowledgeClaim(value);
  const text = evidenceText(`${claim.knowledge} ${claim.decision} ${claim.action}`);
  // This catches exact/contained restatements cheaply. Paraphrases and
  // entailment are checked by the separate, batched semantic verifier.
  return [...exclusions, ...userPolicies].some((line) => {
    const key = evidenceText(line);
    return key.length >= 8 && text.includes(key);
  });
}

export function assessKnowledgeEvidence(evidence: unknown[], requiredGapIds: string[], requiredCategories: string[]) {
  const records = evidence.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  const unique = [...new Map(records.map((item) => [knowledgeDecisionKey(item), item])).values()];
  const verified = unique.filter(hasVerifiedKnowledgeSupport);
  const operational = verified.filter((item) => ["enforced", "conditional"].includes(String(item.applicationMode || item.application_mode)));
  const coveredCategories = requiredCategories.filter((category) => operational.some((item) => item.category === category));
  const observedCategories = requiredCategories.filter((category) => verified.some((item) => item.category === category));
  const coveredGapIds = requiredGapIds.filter((id) => operational.some((item) => knowledgeClaim(item).gapIds.includes(id)));
  return {
    coveredCategories,
    observedCategories,
    missingCategories: requiredCategories.filter((category) => !coveredCategories.includes(category)),
    requiredGapIds,
    coveredGapIds,
    missingGapIds: requiredGapIds.filter((id) => !coveredGapIds.includes(id)),
    verifiedRuleCount: operational.length,
    advisoryRuleCount: verified.length - operational.length,
  };
}
