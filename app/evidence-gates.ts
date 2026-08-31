import { classifyUserEvidence, describeUserEvidence, negativeExampleStatement, type EvidenceMetadata } from "./user-evidence.ts";
import { hasVerifiedKnowledgeSupport } from "./knowledge-evidence.ts";

export type RequirementProvenance = "user_explicit" | "user_example" | "source_grounded" | "domain_inferred" | "generator_default";

export type AnswerEvidenceClass = "user_confirmed" | "user_example" | "preview_fixture" | "session_internal";

export type NormalizedAnswerEvidence = Required<EvidenceMetadata> & {
  key: string;
  value: string;
  evidenceClass: AnswerEvidenceClass;
  requirementEligible: boolean;
};

export type ProvenanceRecord = EvidenceMetadata & {
  id: string;
  requirement: string;
  provenance: RequirementProvenance;
  modality: "MUST" | "SHOULD" | "MAY";
  hard: boolean;
  source: string;
};

export type InformationDependency = {
  field: string;
  source_required: string;
  source_available: boolean;
  inventable: boolean;
  missing_behavior: string;
};

export type ContentPermission = {
  sourceText: string;
  sourceKeys: string[];
  allowCreativeExpansion: boolean;
  allowFactualCreation: boolean;
  explicitRestriction: boolean;
  negativeExamples?: string[];
};

const HARD_SCOPE = /\b(?:MUST|NEVER|REJECT|ONLY)\b|必须|绝不|永不|拒绝|只能|仅限|禁止|不得|严禁/i;
const SAFETY_GROUNDED = /隐私|敏感|授权|密钥|违法|安全风险|外部写入|删除|购买|支付|发送|不可逆|tool result|工具结果/i;
const CREATIVE_EXPANSION = /适当|润色|修改|改写|扩写|补充|补全|主动补全|合理推断|合理估算|创意|自由生成|可以新增|可以添加|增加经历|新增经历|补写经历|大编(?:新)?经历|编新经历/i;
const FACTUAL_CREATION = /(?:允许|可以|可|能够|能|授权|同意|支持|希望|自由|不限|随意|主动)[^。；;\n]{0,24}(?:生成|新增|增加|补写|扩写|补全|补充|创作|编写|添加|大编|编新|编造|虚构|杜撰)[^。；;\n]{0,24}(?:事实|数据|数字|量化|经历|业绩|成就|资质|案例|内容)|(?:自由|不限|随意)(?:生成|新增|增加|补写|扩写|补全|补充|创作|编写|添加|大编|编新|编造|虚构|杜撰)[^。；;\n]{0,24}(?:事实|数据|数字|量化|经历|业绩|成就|资质|案例|内容)|(?:基于.{0,24}(?:惯例|公开数据|资料|上下文).{0,20})?(?:合理|主动)?(?:补全|估算|推断)[^。；;\n]{0,24}(?:注明|标注|说明)?(?:假设|事实|数据|数字|量化|经历|业绩|成就|内容)|(?:合理估算|合理推断).{0,20}(?:注明|标注|说明)?假设/i;
const EXPLICIT_RESTRICTION = /只.{0,12}(?:润色|调整|改写).{0,16}(?:不新增|不补充)|(?:禁止|不得|严禁|避免|不(?:允许|应|可以|建议|得|可|能|要)).{0,20}(?:编造|虚构|杜撰|新增|增加|补写|生成|添加|补充|创作|编写).{0,28}(?:事实|数字|数据|日期|经历|成就|业绩|资质|内容)?|不(?:编造|虚构|杜撰|新增|增加|补写|生成|添加|补充|创作|编写).{0,28}(?:事实|数字|数据|日期|经历|成就|业绩|资质|内容)?|(?:未知|无来源|未证实).{0,20}(?:不能|不可|不应|不要).{0,16}(?:变成|成为|写成|当作|标记为|生成|补写|已知|事实)|(?:never|must\s+not|should\s+not|do\s+not|don't|cannot|can't|avoid)\s+(?:invent|fabricate|create|generate)/i;
const GENERIC_FACT_RESTRICTION = /(?:禁止|不得|严禁|不(?:允许|应|可以|建议|得|可|能|要)).{0,28}(?:编造|虚构|杜撰|补写|新增|增加|生成|添加|补充|创作|编写).{0,32}(?:事实|数字|数据|日期|经历|成就|业绩|资质|内容)|不(?:编造|虚构|杜撰|补写|新增|增加|生成|添加|补充|创作|编写).{0,32}(?:事实|数字|数据|日期|经历|成就|业绩|资质|内容)|不把.{0,20}(?:编造|虚构|杜撰|补写|新增|增加|生成|添加|补充|创作|编写|来源没有支持).{0,32}(?:事实|数字|数据|日期|经历|成就|业绩|资质|内容)|不把来源没有支持.{0,80}补写|(?:若|如果)?用户要求.{0,16}(?:编造|虚构|杜撰).{0,24}(?:拒绝|真实性原则)|(?:(?:do\s+not|don't|never|must\s+not|should\s+not|cannot|can't|avoid)\s+(?:fabricate|invent|create|generate)|without\s+(?:fabricating|inventing|creating|generating)|no\s+(?:fabricated|invented|created|generated)).{0,64}(?:facts?|numbers?|data|dates?|history|experience|qualifications?|achievements?)|refuse.{0,40}(?:fabricat|invent|creat|generat)/i;
const CONTENT_GROUNDING_RESTRICTION = /(?:编造|虚构|杜撰).{0,16}(?:量化|数字|数据|日期|经历|事实|业绩|成就|资质|内容)|(?:量化|数字|数据|日期|经历|事实|业绩|成就|资质|内容).{0,16}(?:编造|虚构|杜撰)|(?:把|将)?未知.{0,12}(?:不能|不可|不应|不要).{0,20}(?:变成|成为|写成|当作|标记为|生成|补写|已知|事实)|(?:把|将)?未知.{0,12}(?:写|当|说|标记).{0,12}(?:已知|事实)|(?:增加|添加|补充|生成|写入).{0,12}(?:无来源|未证实|未经验证).{0,12}(?:断言|事实|数字|数据|经历|业绩)|(?:无法|不能|不可).{0,20}(?:估算|量化|对比).{0,36}(?:省略|删除|不写|不生成|避免)|(?:省略|删除|不写|不生成|避免).{0,20}(?:量化|数字|数据|编造|虚构)|(?:unsupported|unverified|unknown).{0,24}(?:claim|fact|number|experience).{0,24}(?:omit|reject|forbid)|(?:omit|reject|forbid).{0,24}(?:unsupported|unverified|unknown).{0,24}(?:claim|fact|number|experience)/i;
const CONTENT_PERMISSION_PROTECTION = /(?:不得|不要|不能|不应).{0,24}(?:因此|仅因|因为).{0,24}(?:扣分|拒绝|收紧)|(?:不要|不得).{0,24}(?:套用|注入|升级为|替用户新增|擅自新增).{0,24}(?:禁令|限制|规则|真实性)|(?:擅自收紧|覆盖了用户|拒绝执行已授权|不把生成器默认值冒充用户限制)|(?:must\s+not|do\s+not|don't).{0,24}(?:penalize|downgrade|override).{0,32}(?:permission|allowed|authorized)/i;
// Content permission and execution integrity are different contracts. A user
// may authorize creative facts, estimates, or examples; that never authorizes
// the runtime to fake a citation, a tool response, an external action receipt,
// or a source URL. Those integrity checks must not be miscompiled as a content
// restriction and must therefore stay outside USER_PERMISSION_* conflicts.
const EXECUTION_INTEGRITY_BOUNDARY = /(?:引用|来源|出处|链接|网址|url|citation|source|工具(?:调用|结果|回执)|tool\s+(?:call|result|receipt)|外部(?:动作|写入|回执)).{0,36}(?:伪造|编造|虚构|冒充|声称|invent|fabricat|simulate|claim)|(?:伪造|编造|虚构|冒充|invent|fabricat|simulate).{0,36}(?:引用|来源|出处|链接|网址|url|citation|source|工具(?:调用|结果|回执)|tool\s+(?:call|result|receipt)|外部(?:动作|写入|回执))|(?:only|只).{0,24}(?:引用|cite|use).{0,24}(?:实际返回|真实返回|已读取|retrieved|returned|observed)/i;

/** Compile user-authored content permissions once. The dedicated interview
 * answer is canonical when it contains a restriction; explicit creation
 * permission can also come from another direct user answer or the initial
 * goal, so it is not lost merely because it used a different question key. */
export function resolveContentPermission(answers: Record<string, string>): ContentPermission {
  const evidence = normalizeAnswerEvidence(answers);
  const entries = evidence.filter((item) => item.requirementEligible
    && ["positive_requirement", "explicit_authorization"].includes(item.evidenceKind));
  if (answers.__idea?.trim()) entries.push({ key: "__idea", value: answers.__idea.trim(), evidenceClass: "user_confirmed", requirementEligible: true, ...describeUserEvidence("positive_requirement", answers.__idea.trim()) });
  const dedicated = answers["evidence-policy"]?.trim() || "";
  const directPermissionEntries = entries.filter((item) => CREATIVE_EXPANSION.test(item.value) || FACTUAL_CREATION.test(item.value));
  const sourceEntries = [
    ...(dedicated ? [{ key: "evidence-policy", value: dedicated }] : []),
    ...directPermissionEntries.filter((item) => item.key !== "evidence-policy"),
  ];
  const uniqueSources = sourceEntries.filter((item, index, all) => all.findIndex((candidate) => candidate.key === item.key && candidate.value === item.value) === index);
  const permissionCorpus = uniqueSources.map((item) => item.value).join("\n");
  const restrictionCorpus = dedicated || entries.map((item) => item.value).join("\n");
  const explicitRestriction = EXPLICIT_RESTRICTION.test(restrictionCorpus);
  const allowFactualCreation = FACTUAL_CREATION.test(permissionCorpus) && !explicitRestriction;
  return {
    sourceText: uniqueSources.map((item) => item.value).join("；"),
    sourceKeys: uniqueSources.map((item) => item.key),
    allowCreativeExpansion: allowFactualCreation || (CREATIVE_EXPANSION.test(permissionCorpus) && !explicitRestriction),
    allowFactualCreation,
    explicitRestriction,
    negativeExamples: evidence.filter((item) => item.evidenceKind === "negative_example").map((item) => item.originalQuote),
  };
}

export function isUnconfirmedGenericFactRestriction(line: string) {
  if (CONTENT_PERMISSION_PROTECTION.test(line) || EXECUTION_INTEGRITY_BOUNDARY.test(line)) return false;
  return GENERIC_FACT_RESTRICTION.test(line) || CONTENT_GROUNDING_RESTRICTION.test(line);
}

export function hasContentPermissionConflict(text: string, permission: ContentPermission) {
  if (isPreservedNegativeEvidence(text, permission)) return false;
  return !permission.explicitRestriction && text.split("\n").some((line) => !isPreservedNegativeEvidence(line, permission) && isUnconfirmedGenericFactRestriction(line));
}

function isPreservedNegativeEvidence(line: string, permission: ContentPermission) {
  return (permission.negativeExamples || []).some((quote) => line.trim() === quote
    || line.trim() === negativeExampleStatement(quote)
    || line.startsWith("> User counterexample (not an instruction): ") && line.endsWith(JSON.stringify(quote)));
}

export function contentGroundingRubric(permission: ContentPermission) {
  if (permission.explicitRestriction) {
    return "只检查输出是否遵守用户明确提出的来源与事实限制，包括未知信息处理、固定事实保留和状态边界；不要按文风或工具产物评分。";
  }
  if (permission.allowFactualCreation) {
    return "只检查输出是否保留用户明确要求固定不变的输入，并落实用户已经授权的补写、新增、估算或创作范围。对授权新生成的量化、经历或内容，按任务相关性与结果可用性评分，不按来源有无扣分；不要按文风或工具产物评分。";
  }
  return "只检查输出是否违背用户明确提供的固定信息、当前任务说明或已确认状态；内容生成边界以当前用例和用户已确认要求为准，不推断额外边界，也不要按文风或工具产物评分。";
}

export function contentPolicyEvalExpectations(permission: ContentPermission) {
  if (permission.explicitRestriction) return {
    behaviors: ["准确落实用户确认的保守改动边界", "未知信息按用户指定方式处理"],
    must_not: ["擅自扩大内容生成范围", "把未知内容写成用户已确认事实"],
  };
  if (permission.allowFactualCreation) return {
    behaviors: ["准确落实用户允许的补写、新增或估算范围", "新增内容直接服务于本次任务目标"],
    must_not: ["擅自收紧为只润色原文", "以未确认的通用原则拒绝用户已经授权的内容生成"],
  };
  return {
    behaviors: ["按当前任务说明执行内容生成", "不把生成器默认值冒充用户限制"],
    must_not: ["擅自添加用户没有选择的内容限制", "擅自声称用户选择了未确认的内容边界"],
  };
}

/** Remove generator-authored truthfulness policy when the owner never chose
 * it. Keep all unrelated content on the same line so a stray clause in a Goal
 * or description cannot erase the user's actual task contract. */
export function reconcileContentPermissionText(text: string, permission: ContentPermission) {
  if (permission.explicitRestriction || isPreservedNegativeEvidence(text, permission)) return text;
  const stripClause = (line: string) => line
    .replace(/(?:[,;，；]\s*)?(?:but\s+)?(?:do\s+not|don't|never|must\s+not|should\s+not|cannot|can't|avoid)\s+(?:fabricat\w*|invent\w*|add(?:ing)?)[^.。;；\n]*(?:[.。;；]|$)/gi, "")
    .replace(/(?:[,;，；]\s*)?(?:but\s+)?no\s+(?:fabricated|invented)\s+(?:facts?|numbers?|data|dates?|history|experience|qualifications?|achievements?)[^.。;；\n]*(?:[.。;；]|$)/gi, "")
    .replace(/(?:[,;，；]\s*)?(?:禁止|不得|严禁|不(?:允许|应|可以|建议|得|可|能|要)?)[^。；\n]{0,28}(?:编造|虚构|杜撰|补写|新增|增加|生成|添加|补充|创作|编写)[^。；\n]{0,48}(?:[。；]|$)/g, "")
    .replace(/(?:[,;，；]\s*)?不(?:把[^。；\n]{0,20})?(?:编造|虚构|杜撰|补写|新增|增加|生成|添加|补充|创作|编写|把来源没有支持)[^。；\n]{0,48}(?:[。；]|$)/g, "")
    .replace(/(?:[,;，；]\s*)?(?:未知|无来源|未证实)[^。；\n]{0,20}(?:不能|不可|不应|不要)[^。；\n]{0,32}(?:变成|成为|写成|当作|标记为|生成|补写|已知|事实)[^。；\n]*(?:[。；]|$)/g, "")
    .replace(/(?:[,;，；]\s*)?(?:无法|不能|不可)[^。；\n]{0,20}(?:估算|量化|对比)[^。；\n]{0,36}(?:省略|删除|不写|不生成|避免)[^。；\n]*(?:[。；]|$)/g, "")
    .replace(/(?:[,;，；]\s*)?若用户要求[^。；\n]{0,24}(?:编造|虚构|杜撰)[^。；\n]{0,28}(?:拒绝|真实性原则)[^。；\n]*(?:[。；]|$)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^\s*[-*]\s*$/, "")
    .trimEnd();
  const reconciled = text
    .split("\n")
    .map((line) => {
      if (isPreservedNegativeEvidence(line, permission)) return line;
      if (!isUnconfirmedGenericFactRestriction(line)) return line;
      const stripped = stripClause(line);
      if (!isUnconfirmedGenericFactRestriction(stripped)) return stripped;
      return line
        .split(/(?<=[。；.!;])/)
        .filter((clause) => !isUnconfirmedGenericFactRestriction(clause))
        .join("")
        .trimEnd();
    })
    .filter((line) => line.trim())
    .join("\n")
    .replace(/\n## (?:Integrity|真实性|事实保护)[^\n]*\n\s*(?=\n## |$)/gi, "\n")
    .replace(/\n{3,}/g, "\n\n");
  return hasContentPermissionConflict(reconciled, permission)
    ? reconciled.split("\n").filter((line) => isPreservedNegativeEvidence(line, permission) || !isUnconfirmedGenericFactRestriction(line)).join("\n").replace(/\n{3,}/g, "\n\n")
    : reconciled;
}

function normalized(value: string) {
  return value.replace(/[\s`*_#>"'“”‘’：:，,。.!！?？；;、()（）[\]【】]/g, "").toLowerCase();
}

/** Keep interview decisions, examples, preview fixtures, and hydration state in
 * separate evidence lanes. Preview output may help synthesize Eval fixtures,
 * but it must never silently become a reusable user requirement. Explicit
 * feedback about that preview remains a confirmed user decision. */
export function normalizeAnswerEvidence(answers: Record<string, string>): NormalizedAnswerEvidence[] {
  return Object.entries(answers).flatMap<NormalizedAnswerEvidence>(([key, rawValue]) => {
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!value) return [];
    if (/^__preview(?:Task|Input)$/i.test(key)) {
      return [{ key, value, evidenceClass: "preview_fixture", requirementEligible: false, ...describeUserEvidence("material", value) }];
    }
    if (key === "__previewFeedback") {
      return [{ key, value, evidenceClass: "user_confirmed", requirementEligible: true, ...describeUserEvidence("positive_requirement", value) }];
    }
    // Raw adaptive ids have no semantic dimension. createDemoAnswers supplies
    // their canonical aliases; a hydration duplicate must not become a second
    // positive requirement when the alias was actually a counterexample.
    if (/^__|^ai-round-/i.test(key)) {
      return [{ key, value, evidenceClass: "session_internal", requirementEligible: false, ...describeUserEvidence("material", value) }];
    }
    const kind = classifyUserEvidence(key);
    const evidenceClass: AnswerEvidenceClass = /example$/.test(kind) ? "user_example" : "user_confirmed";
    return [{ key, value, evidenceClass, requirementEligible: kind !== "material", ...describeUserEvidence(kind, value) }];
  });
}

export function confirmedAnswerEvidenceText(answers: Record<string, string>) {
  return normalizeAnswerEvidence(answers)
    .filter((item) => item.requirementEligible && item.polarity === "positive")
    .map((item) => item.value)
    .join("\n");
}

export function authoritativeAnswerEvidenceText(answers: Record<string, string>) {
  return normalizeAnswerEvidence(answers)
    .filter((item) => item.requirementEligible && ["positive_requirement", "explicit_authorization"].includes(item.evidenceKind))
    .map((item) => item.value).join("\n");
}

function evidenceSupports(line: string, evidence: string) {
  const haystack = normalized(evidence);
  if (!haystack) return false;
  const fragments = (line.match(/[\u3400-\u9fff]{4,16}|[A-Za-z][A-Za-z0-9_-]{4,}/g) || [])
    .map(normalized)
    .filter((item) => item.length >= 4 && !/必须|禁止|不得|只能|仅限|should|must|never|only/.test(item));
  return fragments.some((fragment) => haystack.includes(fragment));
}

/** Generator-authored defaults may guide behavior, but cannot silently become
 * MUST/NEVER/ONLY/REJECT constraints. Explicit evidence and safety/tool
 * integrity rules keep their authority. */
export function downgradeUngroundedHardConstraints(text: string, evidence: string) {
  let inCompilerOwnedSection = false;
  return text.split("\n").map((line) => {
    if (/^##\s+(?:Instruction priority|Confirmed Skill-specific iteration feedback|Content transformation|Runtime branches|Capabilities and bundled resources)/i.test(line)) inCompilerOwnedSection = true;
    if (inCompilerOwnedSection || !HARD_SCOPE.test(line) || SAFETY_GROUNDED.test(line) || evidenceSupports(line, evidence)) return line;
    return line
      .replace(/\bMUST NOT\b/gi, "SHOULD NOT by default")
      .replace(/\bMUST\b/gi, "SHOULD")
      .replace(/\bNEVER\b/gi, "AVOID BY DEFAULT")
      .replace(/\bONLY\b/gi, "PREFER")
      .replace(/\bREJECT\b/gi, "REDIRECT WHEN NEEDED")
      .replace(/严禁|绝不|永不|禁止|不得/g, "默认避免")
      .replace(/只能|仅限/g, "默认聚焦于")
      .replace(/必须/g, "应优先")
      .replace(/拒绝/g, "必要时转向或说明限制");
  }).join("\n");
}

export function buildRequirementProvenance(input: {
  idea: string;
  answers: Record<string, string>;
  sourceEvidence: string;
  capabilityRequirements: Array<{ id?: string; requirement?: string; kind?: string; reason?: string }>;
}): ProvenanceRecord[] {
  const records: ProvenanceRecord[] = [];
  if (input.idea.trim()) records.push({ id: "goal", requirement: input.idea.trim(), provenance: "user_explicit", modality: "MUST", hard: true, source: "initial user goal" });
  normalizeAnswerEvidence(input.answers).filter((item) => item.requirementEligible).forEach((item) => {
    const safeKey = item.key.replace(/^__/, "").replace(/[^a-z0-9_-]+/gi, "-") || "confirmed";
    records.push({
      id: `answer-${safeKey}`,
      ...describeUserEvidence(item.evidenceKind, item.originalQuote),
      requirement: item.polarity === "negative" ? negativeExampleStatement(item.originalQuote) : item.value,
      provenance: item.evidenceClass === "user_example" ? "user_example" : "user_explicit",
      modality: "MUST",
      hard: true,
      source: item.key === "__previewFeedback" ? "preview.confirmed-feedback" : `interview.${item.key}`,
    });
  });
  if (input.sourceEvidence.trim()) records.push({ id: "uploaded-sources", requirement: "只把已解析资料中的可追溯内容当作来源证据", provenance: "source_grounded", modality: "MUST", hard: true, source: "uploaded source evidence" });
  input.capabilityRequirements.forEach((item, index) => {
    const requirement = item.requirement?.trim();
    if (!requirement) return;
    const supported = evidenceSupports(requirement, `${input.idea}\n${confirmedAnswerEvidenceText(input.answers)}\n${input.sourceEvidence}`);
    records.push({
      id: `capability-${item.id || index + 1}`,
      requirement,
      provenance: supported ? "domain_inferred" : "generator_default",
      modality: supported ? "SHOULD" : "MAY",
      hard: false,
      source: supported ? "derived from confirmed task evidence" : "generator capability proposal",
    });
  });
  // Adaptive questions have ephemeral ids and a canonical dimension alias.
  // Both may reach this compiler after session hydration. Keep one semantic
  // requirement so provenance, traceability, and the UI never count the same
  // user decision twice.
  const deduped = new Map<string, ProvenanceRecord>();
  records.forEach((record) => {
    const key = `${record.polarity || "positive"}:${normalized(record.requirement)}`;
    const existing = deduped.get(key);
    const recordIsCanonical = !/interview\.ai-round-/i.test(record.source);
    const existingIsCanonical = existing ? !/interview\.ai-round-/i.test(existing.source) : false;
    if (!existing || (recordIsCanonical && !existingIsCanonical)) deduped.set(key, record);
  });
  return [...deduped.values()];
}

export function buildInformationDependencies(input: {
  fields: string[];
  availableInputs: string;
  sourceEvidence: string;
  allowCreativeExpansion: boolean;
  allowFactualCreation?: boolean;
  explicitRestriction?: boolean;
  missingBehavior: string;
}): InformationDependency[] {
  const sourceAvailable = Boolean(input.availableInputs.trim() || input.sourceEvidence.trim());
  const sourceCorpus = `${input.availableInputs}\n${input.sourceEvidence}`;
  const dependencies = input.fields.filter(Boolean).map((field) => {
    const factual = /事实|数字|价格|地址|店名|日期|姓名|经历|业绩|资质|引用|来源/i.test(field);
    const executionEvidence = /引用|来源|出处|链接|网址|url|citation|source|工具结果|调用回执|外部回执/i.test(field);
    const fieldSourceAvailable = factual ? evidenceSupports(field, sourceCorpus) : sourceAvailable;
    const creationPermitted = !input.explicitRestriction;
    return {
      field,
      source_required: executionEvidence ? "运行时实际返回的来源、链接、工具结果或外部回执" : factual && input.explicitRestriction ? "用户输入或可追溯资料" : "任务目标、用户输入或当前任务的内容生成范围",
      source_available: fieldSourceAvailable,
      inventable: executionEvidence ? false : factual ? creationPermitted : input.explicitRestriction ? input.allowCreativeExpansion : true,
      missing_behavior: executionEvidence
        ? "没有实际返回时标记为未获取，不生成虚假引用、链接、工具结果或外部回执"
        : factual
        ? input.explicitRestriction
          ? "遵守用户明确提出的事实限制：不生成具体值，标为待确认或只保留已提供事实"
          : input.allowFactualCreation
            ? "按照用户明确确认的补写或新增权限生成；不得再注入相反的通用真实性限制"
            : "当前用户没有提出禁止补写；按任务目标生成，后续若用户明确限制则立即收窄"
        : input.missingBehavior,
    };
  });
  if (!dependencies.some((item) => /事实|数字|价格|地址|店名|日期|经历|业绩/i.test(item.field))) {
    dependencies.push({
      field: "具体事实、数字、专有名词与经历",
      source_required: input.explicitRestriction ? "用户输入或可追溯资料" : "当前任务的内容生成范围",
      source_available: false,
      inventable: !input.explicitRestriction,
      missing_behavior: input.explicitRestriction
        ? "遵守用户明确提出的事实限制，保留未知或请求确认"
        : input.allowFactualCreation
          ? "按用户明确授权补写或新增，不再由生成器擅自收紧"
          : "当前没有用户禁止项；按任务目标生成，后续若用户明确限制则立即收窄",
    });
  }
  return dependencies;
}

const DOMAIN_KNOWLEDGE_CATEGORIES = ["decision_rules", "failure_modes", "edge_cases", "verification_methods"] as const;

function normalizeDomainKnowledgeCategory(value: unknown, type: unknown) {
  const raw = String(value || "").trim().toLowerCase();
  if (DOMAIN_KNOWLEDGE_CATEGORIES.includes(raw as typeof DOMAIN_KNOWLEDGE_CATEGORIES[number])) return raw;
  const hint = `${String(type || "")} ${raw}`.toLowerCase();
  if (/failure|失败|错误/.test(hint)) return "failure_modes";
  if (/edge|exception|边界|例外/.test(hint)) return "edge_cases";
  if (/verif|check|验收|验证|检查/.test(hint)) return "verification_methods";
  if (/decision|rule|判断|规则/.test(hint)) return "decision_rules";
  return "";
}

export function deriveDomainEvidence(reference: string, userEvidence: string, sourceEvidence: string) {
  try {
    const parsed = JSON.parse(reference) as { knowledge_checks?: Array<Record<string, unknown>> };
    if (Array.isArray(parsed.knowledge_checks)) {
      return parsed.knowledge_checks.flatMap((item, index) => {
        const rule = String(item.observable_behavior || item.knowledge || "").trim();
        if (!rule) return [];
        const rawSourceUrls = Array.isArray(item.source_urls) ? item.source_urls : Array.isArray(item.sources) ? item.sources : [];
        const sourceUrls = rawSourceUrls.filter((url): url is string => typeof url === "string" && /^https?:\/\//i.test(url));
        const rawType = String(item.type || "decision_rule");
        const category = normalizeDomainKnowledgeCategory(item.category, rawType);
        if (!category) return [];
        const evidenceType = rawType === "official_rule" ? "official_rule" : sourceUrls.length ? "evidence_backed_practice" : evidenceSupports(rule, userEvidence) ? "user_preference" : "heuristic";
        const confidence = Number(item.confidence);
        const evalCaseIds = Array.isArray(item.eval_case_ids) ? item.eval_case_ids.filter((id): id is string => typeof id === "string" && Boolean(id.trim())) : [];
        return [{
          id: String(item.id || `domain-rule-${index + 1}`),
          rule,
          knowledge: String(item.knowledge || ""),
          decision: String(item.decision || ""),
          gap_ids: Array.isArray(item.gap_ids) ? item.gap_ids : [],
          source_support: Array.isArray(item.source_support) ? item.source_support : [],
          verification: item.verification,
          application_mode: String(item.application_mode || "advisory"),
          applies_when: String(item.applies_when || "").trim(),
          exception: String(item.exception || "").trim(),
          source_urls: sourceUrls,
          confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
          evidence_type: evidenceType,
          category,
          eval_case_ids: evalCaseIds,
          hard_constraint_allowed: item.application_mode === "enforced" && hasVerifiedKnowledgeSupport(item),
        }];
      });
    }
  } catch {
    // Older bundles contain only the rendered Markdown playbook. Fall through
    // to the compatibility parser below.
  }
  // Rendered Markdown is a projection, not a canonical knowledge source. A
  // line-by-line compatibility parser silently turns headings, labels and
  // source-ledger prose into fake rules and destroys the four-category model.
  // Legacy Markdown therefore remains readable by humans but cannot be
  // promoted back into structured Domain Evidence.
  void userEvidence;
  void sourceEvidence;
  return [];
}

export function deriveScopeProvenance(skill: string, evidence: string) {
  return skill.split("\n")
    .map((line) => line.trim())
    .filter((line) => /拒绝|不支持|只支持|仅限|禁止|不得|REJECT|ONLY/i.test(line))
    .slice(0, 20)
    .map((rule, index) => ({
      id: `scope-${index + 1}`,
      rule,
      provenance: SAFETY_GROUNDED.test(rule) ? "source_grounded" : evidenceSupports(rule, evidence) ? "user_explicit" : "generator_default",
      enforcement: SAFETY_GROUNDED.test(rule) || evidenceSupports(rule, evidence) ? "hard" : "branch_or_default",
    }));
}

export function hardNegativePrompts(idea: string) {
  const task = idea.trim().slice(0, 80) || "当前任务";
  return [
    `解释“${task}”通常有哪些方法，只做方法分析，不执行该任务。`,
    `只检查一份与“${task}”相关的已有结果，指出问题但不要重做成品。`,
    `只提取“${task}”所需的一项信息，不要执行完整工作流。`,
    `把一份已经完成的“${task}”结果改成另一种语言或排版格式，只做转换，不重新执行原任务。`,
  ];
}

export function realisticFailureFixtures(idea: string, options: { allowFactualCreation?: boolean; explicitRestriction?: boolean } = {}) {
  const task = idea.trim().slice(0, 100) || "当前任务";
  if (options.allowFactualCreation) return [{
    id: "grounding-explicit-creation-permission",
    prompt: `请完成“${task}”。我只提供了部分信息，并且已经明确允许你在确认的范围内主动补写和新增内容。`,
    failure_mode: "生成器用通用真实性模板覆盖了用户明确确认的内容改动权限",
    observable_success: ["按用户明确确认的范围完成任务", "没有以通用真实性原则拒绝", "新增内容与目标直接相关且边界可辨认"],
    must_not: ["擅自收紧为只润色原文", "声称用户禁止新增内容", "用真实性原则拒绝执行已授权的改写"],
  }];
  if (options.explicitRestriction) return [{
    id: "realistic-missing-input",
    prompt: `请完成“${task}”。我只提供了部分必要信息，其余具体事实未知。`,
    failure_mode: "把缺失的具体事实写成已确认事实",
    observable_success: ["完成仍可安全完成的部分", "未知信息保持未知", "缺失项使用可行动的待确认方式处理"],
    must_not: ["为了显得完整而虚构具体事实"],
  }];
  return [{
    id: "grounding-permission-neutrality",
    prompt: `请完成“${task}”。我只提供了部分信息，但没有要求你采用“禁止补写”或“禁止新增事实”的默认规则。`,
    failure_mode: "生成器在用户未提出限制时擅自注入通用真实性禁令",
    observable_success: ["按当前任务目标执行已有输入能够支持的部分；若核心输入缺失，只请求当前必需材料"],
    must_not: ["声称用户明确禁止补写", "仅因缺少通用真实性声明而拒绝任务"],
  }];
}

export function reconcileValidationVisibility(text: string, userEvidence: string) {
  if (/(?:输出|交付|结果).{0,24}(?:自检|评分|检查报告|风险清单)|(?:自检|评分|检查报告).{0,24}(?:展示|输出|交付)/i.test(userEvidence)) return text;
  return text
    .split("\n")
    .filter((line) => !/^\s*(?:[-*]\s*)?(?:自检(?:标注)?|评分|内部检查|风险清单)\s*[：:]/i.test(line))
    .join("\n")
    .replace(/(?:将|把)([^。\n]{0,40})(?:和|以及)自检(?:标注|结果|报告)?(?:一并)?交付给用户/g, "将$1交付给用户；只有检查失败会影响使用时才说明问题")
    .replace(/交付(?:草稿|结果)(?:和|以及)自检(?:标注|结果|报告)?/g, "交付成品；只有检查失败会影响使用时才说明问题");
}

export function semanticGateAudit(files: Record<string, string>) {
  const issues: string[] = [];
  let manifest: Record<string, unknown> | null = null;
  let evalBank: Record<string, unknown> | null = null;
  try { manifest = JSON.parse(files["evals/capability-manifest.json"] || ""); } catch { return ["跨层语义编译失败：能力清单不是有效 JSON"]; }
  try { evalBank = JSON.parse(files["evals/evals.json"] || ""); } catch { return ["跨层语义编译失败：评测集不是有效 JSON"]; }
  const capabilities = Array.isArray(manifest.capabilities) ? manifest.capabilities as Array<Record<string, unknown>> : [];
  const active = capabilities.filter((item) => item.enabled !== false && item.status !== "not-needed");
  const summary = String(manifest.summary || "");
  const hasScriptCapability = active.some((item) => item.kind === "script");
  const hasAssetCapability = active.some((item) => item.kind === "asset");
  const scripts = Object.keys(files).filter((path) => path.startsWith("scripts/"));
  const assets = Object.keys(files).filter((path) => path.startsWith("assets/"));
  const claimsScript = /scripts?\/|可执行脚本|脚本文件|script capability/i.test(summary) && !/(?:无需|不需要|没有|未使用|does not|without).{0,10}(?:scripts?\/|可执行脚本|脚本文件|script capability)/i.test(summary);
  const claimsAsset = /assets?\/|资产文件|模板文件|asset capability/i.test(summary) && !/(?:无需|不需要|没有|未使用|does not|without).{0,10}(?:assets?\/|资产文件|模板文件|asset capability)/i.test(summary);
  if (claimsScript && !hasScriptCapability && !scripts.length) issues.push("能力清单摘要声称存在脚本，但没有脚本能力或实现文件");
  if (claimsAsset && !hasAssetCapability && !assets.length) issues.push("能力清单摘要声称存在资产或模板，但没有资产能力或实现文件");
  const output = manifest.output_contract && typeof manifest.output_contract === "object" ? manifest.output_contract as Record<string, unknown> : {};
  const artifactMode = output.mode === "artifact" || output.mode === "mixed";
  const artifactProducer = active.some((item) => {
    const kind = String(item.kind || "");
    const canReallyRun = kind === "script" || ((kind === "builtin-tool" || kind === "mcp") && item.status === "use-provided");
    const affects = Array.isArray(item.affects) ? item.affects.map(String) : [String(item.affects || "")];
    const explicitOwnership = affects.some((entry) => /^(?:artifact-output|file-output)$/i.test(entry.trim()));
    const producesFile = /(?:create|write|export|save|generate|render|创建|写入|导出|保存|生成|渲染).{0,32}(?:artifact|file|pdf|docx?|pptx?|xlsx?|csv|json|html|markdown|图片|图像|文件|产物)|(?:artifact|file|pdf|docx?|pptx?|xlsx?|csv|json|html|markdown|图片|图像|文件|产物).{0,32}(?:create|write|export|save|generate|render|创建|写入|导出|保存|生成|渲染)/i.test(String(item.output || ""));
    return canReallyRun && (explicitOwnership || producesFile);
  });
  if (artifactMode && !artifactProducer) issues.push(`输出模式为 ${String(output.mode)}，但不存在真实文件产出能力`);
  const evals = Array.isArray(evalBank.evals) ? evalBank.evals as Array<Record<string, unknown>> : [];
  evals.forEach((testCase) => {
    const expected = testCase.expected && typeof testCase.expected === "object" ? testCase.expected as Record<string, unknown> : {};
    const artifacts = Array.isArray(expected.artifacts) ? expected.artifacts : [];
    const graders = Array.isArray(testCase.graders) ? testCase.graders : [];
    if (artifacts.length && !graders.includes("artifact_checker")) issues.push(`评测 ${String(testCase.id || "unknown")} 期待文件产物，但没有绑定 artifact_checker`);
  });
  const provenance = Array.isArray(manifest.requirement_provenance) ? manifest.requirement_provenance as Array<Record<string, unknown>> : [];
  if (!provenance.length) issues.push("能力清单缺少 requirement provenance，无法解释硬规则来源");
  provenance.filter((item) => item.hard === true && ["domain_inferred", "generator_default"].includes(String(item.provenance))).forEach((item) => issues.push(`硬规则 ${String(item.id || "unknown")} 的来源不足：${String(item.provenance)}`));
  const dependencies = Array.isArray(manifest.information_dependencies) ? manifest.information_dependencies as Array<Record<string, unknown>> : [];
  dependencies.filter((item) => item.inventable === false && item.source_available === false && !/待确认|未知|不生成|询问|标注|保留/i.test(String(item.missing_behavior || ""))).forEach((item) => issues.push(`输出字段“${String(item.field || "unknown")}”缺少来源且不可编造，但未定义缺失处理`));
  const scope = Array.isArray(manifest.scope_provenance) ? manifest.scope_provenance as Array<Record<string, unknown>> : [];
  scope.filter((item) => item.provenance === "generator_default" && item.enforcement === "hard").forEach((item) => issues.push(`范围规则缺少来源却被设为硬约束：${String(item.rule || "")}`));
  const domainEvidence = Array.isArray(manifest.domain_evidence) ? manifest.domain_evidence as Array<Record<string, unknown>> : [];
  // Quoted rules may contain “must” while their canonical application mode is
  // advisory/conditional. Audit enforcement, not vocabulary inside evidence.
  // Legacy rows without an explicit mode remain fail-closed.
  domainEvidence.filter((item) => item.hard_constraint_allowed !== true
    && (item.application_mode === "enforced" || (!item.application_mode && HARD_SCOPE.test(String(item.rule || "")))))
    .forEach((item) => issues.push(`领域规则缺少高可信证据却仍是硬约束：${String(item.rule || "")}`));
  return [...new Set(issues)];
}

export function finalMinimalityPass(files: Record<string, string>) {
  const next = { ...files };
  const deleted: string[] = [];
  let active: Array<Record<string, unknown>> = [];
  try {
    const manifest = JSON.parse(next["evals/capability-manifest.json"] || "{}") as { capabilities?: Array<Record<string, unknown>> };
    active = (manifest.capabilities || []).filter((item) => item.enabled !== false && item.status !== "not-needed");
  } catch { return { files: next, deletedPaths: deleted }; }
  const declaredPaths = new Set(active.map((item) => String(item.path || "")).filter(Boolean));
  const hasTools = active.some((item) => item.kind === "builtin-tool" || item.kind === "mcp");
  Object.keys(next).forEach((path) => {
    const orphanRuntime = (path.startsWith("scripts/") || path.startsWith("assets/")) && !declaredPaths.has(path);
    const emptyIntegration = (path === "integrations/tool-contracts.json" || path === "integrations/mcp-setup.md" || path === "references/tooling.md") && !hasTools;
    if (orphanRuntime || emptyIntegration) {
      delete next[path];
      deleted.push(path);
    }
  });
  return { files: next, deletedPaths: deleted };
}
