import { COMPILER_OWNED_SEMANTIC_PATHS, isImplementationBytePath, normalizeCanonicalMutations, type CanonicalMutation } from "./canonical-mutations.ts";

export type IssuePriority = "P0" | "P1" | "P2" | "P3";
export type CapabilityScope = "global" | "task-specific" | "conditional" | "optional";
export type EvalFamily = "trigger" | "capability" | "grounding" | "integration";
export type EvalFailureType = "missing_decision_rule" | "missing_exception" | "missing_tool_knowledge" | "missing_verification" | "instruction_conflict";

export type FailureAttribution = {
  type: EvalFailureType;
  label: string;
  owner: "domainEvidence" | "riskBranches" | "capabilities" | "evaluationPlan" | "requirements";
  allowedMutationTypes: string[];
  evidence: string;
};

export const FAILURE_ATTRIBUTION_MUTATIONS: Record<EvalFailureType, string[]> = {
  missing_decision_rule: ["domain-evidence.add", "domain-evidence.update", "domain-evidence.remove"],
  missing_exception: ["risk-branch.add", "risk-branch.update", "risk-branch.remove"],
  missing_tool_knowledge: ["capability.update"],
  // A failed verification may be strengthened or its observable output
  // contract repaired. Deleting the failing Eval would only hide evidence.
  missing_verification: ["output.update", "eval-source.add", "eval-source.update"],
  instruction_conflict: ["requirement.update", "requirement.remove", "constraint.update", "constraint.remove"],
};

const FAILURE_LABELS: Record<EvalFailureType, string> = {
  missing_decision_rule: "缺决策规则",
  missing_exception: "缺例外或失败分支",
  missing_tool_knowledge: "缺工具知识",
  missing_verification: "缺验证",
  instruction_conflict: "instruction 冲突",
};

const FAILURE_OWNERS: Record<EvalFailureType, FailureAttribution["owner"]> = {
  missing_decision_rule: "domainEvidence",
  missing_exception: "riskBranches",
  missing_tool_knowledge: "capabilities",
  missing_verification: "evaluationPlan",
  instruction_conflict: "requirements",
};

/** Attribute an observable Eval failure to one compiler-owned semantic surface.
 * The model may provide evidence, but it cannot choose a broader edit surface. */
export function attributeEvalFailure(evidence: string, family: EvalFamily = "capability"): FailureAttribution {
  const value = evidence.trim();
  const conflict = /冲突|矛盾|互相抵触|不一致的指令|优先级错误|覆盖了用户|contradict|conflict|incompatible instruction|priority inversion|(?:用户|本轮).{0,24}(?:已|明确)(?:提供|授权|允许|确认).{0,80}(?:仍|却|但|反而).{0,32}(?:询问|追问|要求确认|暂停|停止|拒绝)|(?:仍|却|但|反而).{0,32}(?:询问|追问|要求确认|暂停|停止|拒绝).{0,80}(?:已经提供|明确授权|明确允许|无需确认)|(?:unnecessary|repeated).{0,16}(?:question|confirmation)|(?:asks?|waits?).{0,32}(?:confirmation|approval).{0,48}(?:already|explicitly).{0,24}(?:provided|authorized|allowed)/i;
  const tool = /\b(?:MCP|API|tool|browser|search|filesystem|command|adapter)\b|工具|调用|连接|授权|参数|回执|可用性|降级路径/i;
  const verification = /验证|验收|核对|检查|断言|评分器|证据不足|没有证明|未验证|verify|validation|acceptance|assertion|grader|unchecked/i;
  const missingOutput = /(?:没有|未|没有真正|未能|未实际)(?:产生|生成|交付|给出|返回|输出).{0,32}(?:结果|内容|交付物|产物|文件|简历|报告)|(?:拒绝|停止|暂停).{0,20}(?:生成|交付|输出|返回)(?:结果|内容|交付物|产物|文件|简历|报告)?|(?:只|仅)(?:给出|返回|输出|停留在).{0,24}(?:分析|步骤|计划|问题|追问|说明|规则)|(?:no|without|failed to|refus(?:e|ed|es)|stop(?:s|ped)?).{0,20}(?:observable|concrete|actual|final).{0,12}(?:output|result|deliverable)|(?:only|merely).{0,20}(?:analysis|questions?|plan|instructions?)/i;
  const integrationToolFailure = family === "integration" && /不可用|未连接|未授权|调用失败|缺少回执|invalid parameters?|unavailable|not connected|unauthorized|missing receipt/i.test(value);
  const exception = /例外|边界|异常|空值|缺失输入|格式错误|不可用|失败恢复|回退|停止条件|edge case|exception|boundary|malformed|missing input|fallback|failure recovery/i;
  const decision = /决策|判断规则|选择条件|优先级|取舍|分类规则|映射规则|decision rule|heuristic|routing rule|tie.?breaker/i;
  const type: EvalFailureType = conflict.test(value)
    ? "instruction_conflict"
    : missingOutput.test(value)
      ? "missing_verification"
      : tool.test(value) || integrationToolFailure
        ? "missing_tool_knowledge"
        : verification.test(value)
          ? "missing_verification"
          : exception.test(value)
            ? "missing_exception"
            : decision.test(value)
              ? "missing_decision_rule"
              : "missing_decision_rule";
  return {
    type,
    label: FAILURE_LABELS[type],
    owner: FAILURE_OWNERS[type],
    allowedMutationTypes: FAILURE_ATTRIBUTION_MUTATIONS[type],
    evidence: value.slice(0, 1_200),
  };
}

export type PipelineIssue = {
  id: string;
  priority: IssuePriority;
  type: string;
  source: "static" | "closure" | "semantic" | "eval" | "regression" | "quality";
  evidence: string;
  files: string[];
  capabilityId?: string;
  failureType?: EvalFailureType;
  allowedMutationTypes?: string[];
  evalCaseIds?: string[];
};

export type OpenSkillQualityReport = {
  score: number;
  passed: boolean;
  checks: Array<{ id: string; passed: boolean; detail: string }>;
  issues: PipelineIssue[];
};

export type ScopedCapability = {
  id?: string;
  kind?: string;
  path?: string;
  scope?: CapabilityScope;
  activationCondition?: string;
  affects?: string[];
  mustNotAffect?: string[];
  output?: string;
  routingCondition?: string;
  enabled?: boolean;
  status?: string;
  evaluationCriteria?: string[];
  necessity?: {
    successLift: "high" | "medium" | "low";
    bareModelReliable: boolean;
    deterministicNeed: boolean;
    realResourceAvailable: boolean;
    externalDependency: boolean;
    decision: "include" | "optional" | "exclude";
  };
};

export type PatchOperation = {
  action: "edit" | "create" | "delete";
  path: string;
  find?: string;
  replacement?: string;
  content?: string;
};

export type PatchImpact = {
  scope: CapabilityScope;
  affectedCapabilities: string[];
  affectedArtifacts: string[];
  mustNotAffect: string[];
  regressionFamilies: EvalFamily[];
};

export type MutationBudget = {
  maxArtifactsModified: number;
  maxNewFiles: number;
  maxNewCapabilities: number;
};

export type PatchPlan = {
  strategy: string;
  issueIds: string[];
  consumedDecisionIds: string[];
  operations: PatchOperation[];
  canonicalMutations: CanonicalMutation[];
  protectedArtifacts: string[];
  impact: PatchImpact;
};

export type PatchTargetBinding = {
  mutationIndex: number;
  type: CanonicalMutation["type"];
  from: string;
  to: string;
};

export type CrossArtifactReport = {
  passed: boolean;
  issues: PipelineIssue[];
  edges: Array<{
    capabilityId: string;
    declared: boolean;
    implemented: boolean;
    routed: boolean;
    evaluated: boolean;
  }>;
};

export type PruneResult = {
  files: Record<string, string>;
  changedPaths: string[];
  deletedPaths: string[];
};

export const DEFAULT_MUTATION_BUDGET: MutationBudget = {
  maxArtifactsModified: 3,
  maxNewFiles: 1,
  maxNewCapabilities: 0,
};

const PRIORITY_ORDER: IssuePriority[] = ["P0", "P1", "P2", "P3"];
const GENERIC_KNOWLEDGE = /clear|professional|natural|logical|concise|high.?quality|best practice|表达自然|逻辑清晰|保持专业|高质量|结构清楚|内容完整|符合需求|易于理解/gi;
const BEHAVIOR_CHANGING_KNOWLEDGE = /constraint|heuristic|threshold|decision rule|edge case|failure pattern|platform|schema|formula|terminology|限制|启发式|判断规则|边界条件|失败模式|平台规则|字段|公式|术语|反例/gi;

function stableId(prefix: string, value: string, index: number) {
  const slug = value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return `${prefix}-${slug || index + 1}`;
}

function list(value: unknown, limit = 12) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()).slice(0, limit)
    : [];
}

function parseJson<T>(raw: string | undefined): T | null {
  try {
    return JSON.parse(raw || "") as T;
  } catch {
    return null;
  }
}

function activeCapability(item: ScopedCapability) {
  return item.enabled !== false && item.status !== "not-needed" && item.kind !== "eval";
}

// Legacy audits still emit human-readable blocker strings. They may describe
// contract defects, but they are not allowed to infer execution severity from
// wording. P0 is owned exclusively by the structured Bundle Validator.
export function makeContractIssues(messages: string[]): PipelineIssue[] {
  return messages.map((message, index) => ({
    id: stableId("contract", message, index),
    priority: "P1",
    type: "LEGACY_CONTRACT_BLOCKER",
    source: "semantic",
    evidence: message,
    files: [],
  }));
}

/** Stable identity across the structured validator adapter and the legacy
 * audit wrapper. Both may report the same detector code with different outer
 * issue types; one defect must remain one repair target. */
export function contractIssueIdentity(issue: Pick<PipelineIssue, "type" | "evidence">) {
  const embeddedCode = issue.evidence.match(/^\[([A-Z0-9_]+)\]\s*/)?.[1];
  return `${embeddedCode || issue.type}:${issue.evidence.replace(/^\[[A-Z0-9_]+\]\s*/, "")}`;
}

export function selectHighestPriorityIssues(issues: PipelineIssue[]) {
  const highest = PRIORITY_ORDER.find((priority) => issues.some((item) => item.priority === priority));
  return highest ? issues.filter((item) => item.priority === highest) : [];
}

/** Give one optimizer round one semantic owner. Mixing instruction conflicts,
 * missing verification, and knowledge gaps in the same request encourages a
 * broad rewrite and makes it impossible to tell which mutation fixed what. */
export function focusOptimizationIssues(issues: PipelineIssue[], limit = 3) {
  const selected = selectHighestPriorityIssues(issues);
  const attributed = selected.filter((item) => item.failureType && item.allowedMutationTypes?.length);
  if (!attributed.length) {
    const rootType = selected[0]?.type;
    return selected.filter((item) => !rootType || item.type === rootType).slice(0, Math.max(1, limit));
  }
  const groups = new Map<EvalFailureType, PipelineIssue[]>();
  attributed.forEach((item) => {
    const type = item.failureType!;
    groups.set(type, [...(groups.get(type) || []), item]);
  });
  const focused = [...groups.entries()].sort((left, right) => {
    const weight = (items: PipelineIssue[]) => items.reduce((sum, item) => sum + 1 + (item.evalCaseIds?.length || 0), 0);
    return weight(right[1]) - weight(left[1]) || FAILURE_LABELS[left[0]].localeCompare(FAILURE_LABELS[right[0]], "zh-CN");
  })[0]?.[1] || [];
  return focused.slice(0, Math.max(1, limit));
}

export function optimizationPolicyFor(issues: PipelineIssue[]) {
  const selected = focusOptimizationIssues(issues);
  const priority = selected[0]?.priority || null;
  return {
    priority,
    selected,
    allowSemanticOptimization: priority !== "P0",
    allowResearch: priority === "P2" && selected.some((item) => /knowledge|domain|research|decision_rule|知识|领域|决策规则/i.test(`${item.type} ${item.evidence}`)),
    requireStaticRerun: priority === "P0",
  };
}

export function normalizeCapabilityScope(item: ScopedCapability): CapabilityScope {
  if (["global", "task-specific", "conditional", "optional"].includes(String(item.scope))) return item.scope as CapabilityScope;
  if (item.enabled === false || item.status === "not-needed") return "optional";
  if (/每次|always|every time/i.test(item.routingCondition || "")) return "global";
  if (/当|如果|若|仅当|when|if|only when/i.test(item.activationCondition || item.routingCondition || "")) return "conditional";
  return item.kind === "llm" ? "task-specific" : "conditional";
}

export function canonicalCapabilityContract(item: ScopedCapability) {
  const scope = normalizeCapabilityScope(item);
  const conditional = scope === "conditional" || scope === "optional";
  return {
    scope,
    activationCondition: item.activationCondition || item.routingCondition || (scope === "global" ? "每次 Skill 运行" : "仅在当前任务明确需要该能力时"),
    affects: list(item.affects).length
      ? list(item.affects)
      : item.kind === "builtin-tool" || item.kind === "mcp"
        ? ["tool-routing"]
        : item.kind === "eval"
          ? ["evaluation"]
          : ["runtime-workflow"],
    mustNotAffect: list(item.mustNotAffect).length
      ? list(item.mustNotAffect)
      : conditional
        ? ["default-output-contract", "unrelated-evals"]
        : [],
  };
}

export function inferEvalFamily(testCase: Record<string, unknown>): EvalFamily {
  const explicit = typeof testCase.eval_family === "string" ? testCase.eval_family : "";
  if (["trigger", "capability", "grounding", "integration"].includes(explicit)) return explicit as EvalFamily;
  const category = String(testCase.category || "");
  const graders = list(testCase.graders);
  if (/^trigger_|no-trigger/.test(category)) return "trigger";
  if (/tool|integration|artifact|mcp|image/.test(category) || graders.includes("artifact_checker") || graders.includes("tool_grounding")) return "integration";
  if (/ground|content_policy|state_correctness|fact|source/.test(category)) return "grounding";
  return "capability";
}

export function capabilityOwnsArtifacts(item: ScopedCapability) {
  // Semantic/reference capabilities may describe an artifact-shaped outcome,
  // but they cannot create a real file by themselves. Treating an LLM that
  // writes resume content as the PDF producer leaked artifact expectations
  // into its core behavior eval and left the actual export step unowned.
  if (!["script", "builtin-tool", "mcp"].includes(item.kind || "")) return false;
  // `output-contract` only means that a capability can influence the content
  // contract. It does not mean the capability writes a file. Likewise, a
  // bundled asset is an input resource, not the owner of a newly delivered
  // artifact. Ownership must be declared explicitly or expressed as a real
  // create/write/export action.
  // Catalog descriptions often list several possible observations, such as
  // "stdout, test result, or generated file". That wording is not an active
  // file-delivery contract. The artifact compiler sets this effect only when
  // the current task really requires a file, so ownership must use the
  // canonical effect instead of guessing from prose.
  return list(item.affects).some((entry) => /^(?:artifact-output|file-output)$/i.test(entry.trim()));
}

/** Close an explicit file-delivery contract with a real runtime owner.
 * The semantic model creates content; a runtime file capability creates the
 * inspectable artifact. Reuse an existing disabled declaration when present
 * so the compiler never emits duplicate capabilities. */
export function reconcileArtifactProducerCapabilities<T extends ScopedCapability>(input: {
  capabilities: T[];
  fallback: T;
  artifactPatterns: string[];
  requiresArtifact: boolean;
}) {
  const capabilities = input.capabilities.map((item) => ({ ...item }));
  const requestedExtensions = input.artifactPatterns.flatMap((pattern) => pattern.toLowerCase().match(/\.(?:pdf|docx?|pptx?|xlsx?|csv|json|html?|md|png|jpe?g)\b/g) || []);
  const ownsRequestedArtifact = (item: T) => {
    if (!activeCapability(item) || !capabilityOwnsArtifacts(item)) return false;
    if (!requestedExtensions.length) return true;
    const contract = `${item.path || ""} ${item.output || ""} ${item.routingCondition || ""}`.toLowerCase();
    return requestedExtensions.some((extension) => contract.includes(extension) || contract.includes(extension.slice(1)));
  };
  const existingIndex = capabilities.findIndex((item) => item.id === input.fallback.id);
  const existing = existingIndex >= 0 ? capabilities[existingIndex] : undefined;
  const compilerOwned = existing?.requirement?.startsWith("创建并交付与输出契约匹配的文件：")
    && existing.output?.startsWith("真实存在且匹配 ");
  if (!input.requiresArtifact || (!compilerOwned && capabilities.some(ownsRequestedArtifact))) return capabilities;
  const patterns = input.artifactPatterns.length ? input.artifactPatterns : ["outputs/**"];
  const equivalentWriter = capabilities.findIndex((item) => activeCapability(item)
    && item.kind === "builtin-tool" && capabilityOwnsArtifacts(item)
    && item.path === input.fallback.path && item.name === input.fallback.name);
  if (equivalentWriter >= 0 && existingIndex < 0) {
    const writer = capabilities[equivalentWriter];
    capabilities[equivalentWriter] = {
      ...writer,
      optional: false, enabled: true, recommended: true, status: "use-provided",
      affects: [...new Set([...list(writer.affects), "artifact-output", "output-contract"])],
      output: `${writer.output || "文件"}；真实存在且匹配 ${patterns.join("、")} 的文件产物`,
    } as T;
    return capabilities;
  }
  const artifactCapability = {
    ...input.fallback,
    ...existing,
    optional: false,
    enabled: true,
    status: "use-provided",
    recommended: true,
    scope: "task-specific",
    activationCondition: "输出契约明确要求交付真实文件时",
    requirement: `创建并交付与输出契约匹配的文件：${patterns.join("、")}`,
    purpose: "把大模型完成的内容写入真实文件，并把可检查的文件路径返回给用户",
    output: `真实存在且匹配 ${patterns.join("、")} 的文件产物`,
    fallback: "宿主没有文件创建或导出能力时，停止文件交付分支并给出可复制内容；不得声称文件已经生成",
    affects: ["artifact-output", "output-contract"],
    mustNotAffect: ["text-only-output", "core-semantic-reasoning"],
    necessity: {
      successLift: "high",
      bareModelReliable: false,
      deterministicNeed: true,
      realResourceAvailable: true,
      externalDependency: true,
      decision: "include",
    },
  } as T;
  if (existingIndex >= 0) capabilities[existingIndex] = artifactCapability;
  else capabilities.push(artifactCapability);
  return capabilities;
}

function expectedRecord(testCase: Record<string, unknown>) {
  return testCase.expected && typeof testCase.expected === "object" ? testCase.expected as Record<string, unknown> : {};
}

/** A capability is covered only by a focused case with observable evidence and
 * the grader family that can actually inspect that capability. Merely listing
 * a capability_id is attribution metadata, not proof of coverage. */
export function caseProvidesCapabilityEvidence(testCase: Record<string, unknown>, capability: ScopedCapability) {
  const capabilityId = capability.id || "";
  if (!capabilityId || !list(testCase.capability_ids).includes(capabilityId)) return false;
  const family = inferEvalFamily(testCase);
  if (family === "trigger") return false;
  const expected = expectedRecord(testCase);
  const behaviors = list(expected.behaviors);
  const artifacts = list(expected.artifacts);
  if (!behaviors.length && !artifacts.length) return false;
  const graders = list(testCase.graders);
  const kind = capability.kind || "llm";
  if (kind === "builtin-tool" || kind === "mcp" || kind === "asset") {
    if (family !== "integration" || !graders.some((grader) => ["integration", "tool_grounding", "artifact_checker"].includes(grader))) return false;
    const contract = canonicalCapabilityContract(capability);
    if ((contract.scope === "conditional" || contract.scope === "optional") && !(testCase.context && typeof testCase.context === "object" && Object.keys(testCase.context as Record<string, unknown>).some((key) => /activ|tool|integration|routing|scope/i.test(key)))) return false;
    if (capabilityOwnsArtifacts(capability) && !artifacts.length) return false;
    return true;
  }
  if (kind === "reference") return family === "grounding" && graders.some((grader) => ["grounding", "content_policy", "state_correctness"].includes(grader));
  return family === "capability" && graders.some((grader) => ["core_capability", "failure_mode", "loop_control"].includes(grader));
}

function sameStringSet(left: unknown, right: unknown) {
  return JSON.stringify([...new Set(list(left))].sort()) === JSON.stringify([...new Set(list(right))].sort());
}

export function auditCrossArtifactConsistency(files: Record<string, string>): CrossArtifactReport {
  const issues: PipelineIssue[] = [];
  const manifest = parseJson<{ capabilities?: ScopedCapability[]; coverage?: Array<{ requirement_id?: string; implementation?: { path?: string }; evaluation?: { case_ids?: string[] } }>; output_contract?: { artifactPatterns?: string[] } }>(files["evals/capability-manifest.json"]);
  const evalBank = parseJson<{ evals?: Array<Record<string, unknown>> }>(files["evals/evals.json"]);
  const toolContracts = parseJson<{ tools?: Array<Record<string, unknown>> }>(files["integrations/tool-contracts.json"]);
  const skill = files["SKILL.md"] || "";
  if (!manifest) {
    return { passed: false, issues: [{ id: "manifest-invalid", priority: "P0", type: "INVALID_CAPABILITY_MANIFEST", source: "regression", evidence: "evals/capability-manifest.json 不是有效 JSON。", files: ["evals/capability-manifest.json"] }], edges: [] };
  }
  if (!evalBank) {
    return { passed: false, issues: [{ id: "evals-invalid", priority: "P0", type: "INVALID_EVAL_BANK", source: "regression", evidence: "evals/evals.json 不是有效 JSON。", files: ["evals/evals.json"] }], edges: [] };
  }
  const capabilities = (manifest.capabilities || []).filter(activeCapability);
  const coverage = manifest.coverage || [];
  const evals = evalBank.evals || [];
  const seenCapabilities = new Set<string>();
  capabilities.forEach((item, index) => {
    const id = item.id || `capability-${index + 1}`;
    if (seenCapabilities.has(id)) issues.push({ id: `duplicate-${id}`, priority: "P1", type: "DUPLICATE_CAPABILITY_DECLARATION", source: "regression", evidence: `能力 ${id} 在 manifest 中重复声明。`, files: ["evals/capability-manifest.json"], capabilityId: id });
    seenCapabilities.add(id);
    const necessity = item.necessity;
    if (!necessity || !necessity.decision) {
      issues.push({ id: `${id}-necessity`, priority: "P1", type: "CAPABILITY_NECESSITY_UNPROVEN", source: "semantic", evidence: `能力 ${id} 没有说明相对裸模型的必要性、确定性需求、资源可用性和外部依赖。`, files: ["evals/capability-manifest.json"], capabilityId: id });
    } else if (necessity.decision === "exclude") {
      issues.push({ id: `${id}-excluded-active`, priority: "P1", type: "EXCLUDED_CAPABILITY_STILL_ACTIVE", source: "semantic", evidence: `能力 ${id} 的必要性结论为 exclude，却仍被声明为运行时能力。`, files: ["evals/capability-manifest.json"], capabilityId: id });
    }
  });

  const edges = capabilities.map((item, index) => {
    const capabilityId = item.id || `capability-${index + 1}`;
    const path = item.path || "";
    const implementationRequired = ["reference", "script", "asset"].includes(item.kind || "");
    const implemented = !implementationRequired || Boolean(path && files[path]?.trim());
    const routed = !implementationRequired || normalizeCapabilityScope(item) === "optional" || Boolean(path && skill.includes(path));
    const mapped = coverage.find((entry) => entry.requirement_id === capabilityId);
    const caseIds = new Set(mapped?.evaluation?.case_ids || []);
    const evaluated = evals.some((entry) => (caseIds.size === 0 || caseIds.has(String(entry.id || ""))) && caseProvidesCapabilityEvidence(entry, item));
    if (!implemented) issues.push({ id: `${capabilityId}-implementation`, priority: "P1", type: "DECLARED_WITHOUT_IMPLEMENTATION", source: "regression", evidence: `能力 ${capabilityId} 已声明，但实现文件不存在。`, files: ["evals/capability-manifest.json", path].filter(Boolean), capabilityId });
    if (!routed) issues.push({ id: `${capabilityId}-routing`, priority: "P1", type: "IMPLEMENTED_WITHOUT_ROUTING", source: "regression", evidence: `能力 ${capabilityId} 有实现，但主工作流没有激活条件。`, files: ["SKILL.md", path].filter(Boolean), capabilityId });
    if (!evaluated) issues.push({ id: `${capabilityId}-eval`, priority: "P1", type: "CAPABILITY_WITHOUT_EVAL", source: "regression", evidence: `能力 ${capabilityId} 没有聚焦评测。`, files: ["evals/evals.json", "evals/capability-manifest.json"], capabilityId });
    if ((item.kind === "builtin-tool" || item.kind === "mcp") && toolContracts) {
      const contract = (toolContracts.tools || []).find((entry) => String(entry.id || "") === capabilityId);
      if (contract) {
        const canonical = canonicalCapabilityContract(item);
        const matches = String(contract.scope || "") === canonical.scope
          && String(contract.activation_condition || "") === canonical.activationCondition
          && sameStringSet(contract.affects, canonical.affects)
          && sameStringSet(contract.must_not_affect, canonical.mustNotAffect);
        if (!matches) issues.push({
          id: `${capabilityId}-scope-contract`,
          priority: "P1",
          type: "CAPABILITY_SCOPE_DECLARATION_MISMATCH",
          source: "regression",
          evidence: `能力 ${capabilityId} 在能力清单与工具契约中的作用范围、激活条件或禁止影响范围不一致。`,
          files: ["evals/capability-manifest.json", "integrations/tool-contracts.json"],
          capabilityId,
        });
      }
    }
    return { capabilityId, declared: true, implemented, routed, evaluated };
  });

  evals.forEach((testCase, index) => {
    const expected = testCase.expected && typeof testCase.expected === "object" ? testCase.expected as Record<string, unknown> : {};
    const artifacts = list(expected.artifacts);
    if (!artifacts.length) return;
    const capabilityIds = list(testCase.capability_ids);
    const owners = capabilities.filter((item) => item.id && capabilityIds.includes(item.id) && capabilityOwnsArtifacts(item));
    const family = inferEvalFamily(testCase);
    if (!owners.length || (family !== "integration" && owners.every((item) => ["conditional", "optional"].includes(normalizeCapabilityScope(item))))) {
      issues.push({
        id: `output-scope-${String(testCase.id || index + 1)}`,
        priority: "P1",
        type: "OUTPUT_SCOPE_CONFLICT",
        source: "regression",
        evidence: `评测 ${String(testCase.id || index + 1)} 全局要求 ${artifacts.join("、")}，但当前被测能力没有对应的文件产出责任或激活条件。`,
        files: ["evals/evals.json", "evals/capability-manifest.json"],
      });
    }
  });

  return { passed: issues.length === 0, issues, edges };
}

export function normalizePatchPlan(value: unknown): PatchPlan | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const rawImpact = raw.impact && typeof raw.impact === "object" ? raw.impact as Record<string, unknown> : {};
  const rawOperations = Array.isArray(raw.operations) ? raw.operations : [];
  const operations = rawOperations.slice(0, 8).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const action = ["edit", "create", "delete"].includes(String(item.action)) ? item.action as PatchOperation["action"] : null;
    const path = typeof item.path === "string" ? item.path.trim() : "";
    if (!action || !path) return [];
    return [{ action, path, find: typeof item.find === "string" ? item.find : undefined, replacement: typeof item.replacement === "string" ? item.replacement : undefined, content: typeof item.content === "string" ? item.content : undefined }];
  });
  const canonicalMutations = normalizeCanonicalMutations(raw.canonicalMutations);
  const scope = ["global", "task-specific", "conditional", "optional"].includes(String(rawImpact.scope)) ? rawImpact.scope as CapabilityScope : "task-specific";
  const regressionFamilies = list(rawImpact.regressionFamilies).filter((item): item is EvalFamily => ["trigger", "capability", "grounding", "integration"].includes(item));
  if ((!operations.length && !canonicalMutations.length) || !list(raw.issueIds).length) return null;
  return {
    strategy: typeof raw.strategy === "string" ? raw.strategy.trim().slice(0, 160) : "targeted_patch",
    issueIds: list(raw.issueIds, 12),
    consumedDecisionIds: list(raw.consumedDecisionIds, 12),
    operations,
    canonicalMutations,
    protectedArtifacts: list(raw.protectedArtifacts, 12),
    impact: {
      scope,
      affectedCapabilities: list(rawImpact.affectedCapabilities, 12),
      affectedArtifacts: list(rawImpact.affectedArtifacts, 12),
      mustNotAffect: list(rawImpact.mustNotAffect, 12),
      regressionFamilies: regressionFamilies.length ? regressionFamilies : ["capability"],
    },
  };
}

/** Bind placeholder update targets to compiler-owned IDs when failure
 * evidence leaves exactly one safe target. Models often invent plausible IDs
 * such as `output-primary` or `eval-source-1`; retrying the same model cannot
 * make that mapping safer than the canonical graph already can.
 *
 * Only non-destructive updates are redirected, and only when unambiguous.
 * Additions retain their supplied IDs and removals are never redirected. */
export function bindPatchPlanTargetIds(input: {
  plan: PatchPlan;
  issues: PipelineIssue[];
  files: Record<string, string>;
}) {
  const ir = parseJson<{
    requirements?: Array<{ id?: string }>;
    tasks?: Array<{ id?: string }>;
    capabilities?: Array<{ id?: string }>;
    inputs?: Array<{ id?: string }>;
    outputs?: Array<{ id?: string; producerCapabilityIds?: string[] }>;
    constraints?: Array<{ id?: string }>;
    knowledgeRequirements?: Array<{ id?: string }>;
    domainEvidence?: Array<{ id?: string }>;
    riskBranches?: Array<{ id?: string }>;
    evaluationPlan?: { cases?: Array<{ id?: string }> };
  }>(input.files["evals/skill-ir.json"]);
  if (!ir) return { plan: input.plan, bindings: [] as PatchTargetBinding[] };

  const selectedIssues = input.plan.issueIds.flatMap((id) => input.issues.find((issue) => issue.id === id) || []);
  const unique = (values: Array<string | undefined>) => [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
  const ids = {
    requirement: unique((ir.requirements || []).map((item) => item.id)),
    task: unique((ir.tasks || []).map((item) => item.id)),
    capability: unique((ir.capabilities || []).map((item) => item.id)),
    input: unique((ir.inputs || []).map((item) => item.id)),
    output: unique((ir.outputs || []).map((item) => item.id)),
    constraint: unique((ir.constraints || []).map((item) => item.id)),
    knowledge: unique((ir.knowledgeRequirements || []).map((item) => item.id)),
    "domain-evidence": unique((ir.domainEvidence || []).map((item) => item.id)),
    "risk-branch": unique((ir.riskBranches || []).map((item) => item.id)),
    "eval-source": unique((ir.evaluationPlan?.cases || []).map((item) => item.id)),
  } as const;
  const issueEvalIds = unique(selectedIssues.flatMap((issue) => issue.evalCaseIds || [])).filter((id) => ids["eval-source"].includes(id));
  const issueCapabilityIds = unique(selectedIssues.map((issue) => issue.capabilityId)).filter((id) => ids.capability.includes(id));
  const issueOutputIds = unique((ir.outputs || [])
    .filter((output) => (output.producerCapabilityIds || []).some((id) => issueCapabilityIds.includes(id)))
    .map((output) => output.id));
  const bindings: PatchTargetBinding[] = [];

  const bind = (mutation: CanonicalMutation, index: number): CanonicalMutation => {
    if (!mutation.type.endsWith(".update")) return mutation;
    const owner = mutation.type.slice(0, -".update".length) as keyof typeof ids;
    if (!(owner in ids)) return mutation;
    const idKey = ({
      requirement: "requirementId",
      task: "taskId",
      capability: "capabilityId",
      input: "inputId",
      output: "outputId",
      constraint: "constraintId",
      knowledge: "knowledgeId",
      "domain-evidence": "evidenceId",
      "risk-branch": "branchId",
      "eval-source": "caseId",
    } as const)[owner];
    const current = String((mutation as unknown as Record<string, unknown>)[idKey] || "");
    const validIds = ids[owner] as readonly string[];
    if (validIds.includes(current)) return mutation;
    const evidenceTargets = owner === "eval-source"
      ? issueEvalIds
      : owner === "capability"
        ? issueCapabilityIds
        : owner === "output"
          ? issueOutputIds
          : [];
    const candidates = evidenceTargets.length === 1 ? evidenceTargets : validIds.length === 1 ? [...validIds] : [];
    if (candidates.length !== 1) return mutation;
    const to = candidates[0];
    bindings.push({ mutationIndex: index, type: mutation.type, from: current, to });
    return { ...mutation, [idKey]: to } as CanonicalMutation;
  };

  return {
    plan: { ...input.plan, canonicalMutations: input.plan.canonicalMutations.map(bind) },
    bindings,
  };
}

function canonicalMutationTarget(mutation: CanonicalMutation): { owner: string; id: string } | null {
  if (mutation.type === "requirement.update" || mutation.type === "requirement.remove") return { owner: "requirement", id: mutation.requirementId };
  if (mutation.type === "task.update" || mutation.type === "task.remove") return { owner: "task", id: mutation.taskId };
  if (mutation.type === "capability.update" || mutation.type === "capability.remove") return { owner: "capability", id: mutation.capabilityId };
  if (mutation.type === "input.update" || mutation.type === "input.remove") return { owner: "input", id: mutation.inputId };
  if (mutation.type === "output.update" || mutation.type === "output.remove") return { owner: "output", id: mutation.outputId };
  if (mutation.type === "constraint.update" || mutation.type === "constraint.remove") return { owner: "constraint", id: mutation.constraintId };
  if (mutation.type === "knowledge.update" || mutation.type === "knowledge.remove") return { owner: "knowledge", id: mutation.knowledgeId };
  if (mutation.type === "domain-evidence.update" || mutation.type === "domain-evidence.remove") return { owner: "domain-evidence", id: mutation.evidenceId };
  if (mutation.type === "risk-branch.update" || mutation.type === "risk-branch.remove") return { owner: "risk-branch", id: mutation.branchId };
  if (mutation.type === "eval-source.update" || mutation.type === "eval-source.remove") return { owner: "eval-source", id: mutation.caseId };
  return null;
}

export function validatePatchPlan(input: {
  plan: PatchPlan;
  issues: PipelineIssue[];
  files: Record<string, string>;
  capabilities: ScopedCapability[];
  budget?: MutationBudget;
  requiredDecisionIds?: string[];
}) {
  const budget = input.budget || DEFAULT_MUTATION_BUDGET;
  const errors: string[] = [];
  const knownIssueIds = new Set(input.issues.map((item) => item.id));
  const consumedDecisionIds = new Set(input.plan.consumedDecisionIds);
  const missingDecisionContext = (input.requiredDecisionIds || []).filter((id) => !consumedDecisionIds.has(id));
  if (missingDecisionContext.length) errors.push(`Patch Plan 没有确认消费历史决策：${missingDecisionContext.join("、")}`);
  const selectedPriority = selectHighestPriorityIssues(input.issues)[0]?.priority;
  const selectedIssues = input.plan.issueIds.flatMap((id) => input.issues.find((item) => item.id === id) || []);
  const attributedIssues = selectedIssues.filter((item) => item.failureType && item.allowedMutationTypes?.length);
  if (!input.plan.issueIds.every((id) => knownIssueIds.has(id))) errors.push("Patch Plan 引用了 Critic 没有提出的问题");
  if (selectedPriority && input.plan.issueIds.some((id) => input.issues.find((item) => item.id === id)?.priority !== selectedPriority)) errors.push(`当前只能修复最高优先级 ${selectedPriority}`);
  if (attributedIssues.length) {
    const allowed = new Set(attributedIssues.flatMap((item) => item.allowedMutationTypes || []));
    const disallowed = input.plan.canonicalMutations.filter((mutation) => !allowed.has(mutation.type));
    if (disallowed.length) errors.push(`Eval failure 已归因，当前只允许修改 ${[...allowed].join("、")}；越界 mutation：${disallowed.map((item) => item.type).join("、")}`);
    if (input.plan.operations.length) errors.push("Eval failure 已归因后只能修改对应 Canonical SkillIR 区域，不能改写实现文件或重新生成整包");
    if (!input.plan.canonicalMutations.length) errors.push("Eval failure 已归因，但 Patch Plan 没有返回对应的 CanonicalMutation");
    input.plan.canonicalMutations.filter((mutation) => mutation.type === "domain-evidence.add").forEach((mutation) => {
      const evidence = mutation.evidence;
      const sourceUrls = Array.isArray(evidence.source_urls) ? evidence.source_urls.filter((item) => typeof item === "string" && /^https?:\/\//i.test(item)) : [];
      const evalCaseIds = Array.isArray(evidence.eval_case_ids) ? evidence.eval_case_ids.filter((item) => typeof item === "string" && Boolean(item.trim())) : [];
      if (!sourceUrls.length && !evalCaseIds.length) errors.push("新增决策规则必须保留 source_urls 或 eval_case_ids 作为失败反哺证据，不能写成模型常识");
    });
    const toolCapabilityIds = attributedIssues.filter((item) => item.failureType === "missing_tool_knowledge").map((item) => item.capabilityId).filter((id): id is string => Boolean(id));
    const wrongToolTarget = input.plan.canonicalMutations.find((mutation) => mutation.type === "capability.update"
      && toolCapabilityIds.length > 0
      && !toolCapabilityIds.includes(mutation.capabilityId));
    if (wrongToolTarget) errors.push(`工具知识失败只能修改被归因的能力：${toolCapabilityIds.join("、")}`);
  }
  const ir = parseJson<{
    requirements?: Array<{ id?: string }>;
    tasks?: Array<{ id?: string }>;
    capabilities?: Array<{ id?: string }>;
    inputs?: Array<{ id?: string }>;
    outputs?: Array<{ id?: string }>;
    constraints?: Array<{ id?: string }>;
    knowledgeRequirements?: Array<{ id?: string }>;
    domainEvidence?: Array<{ id?: string }>;
    riskBranches?: Array<{ id?: string }>;
    evaluationPlan?: { cases?: Array<{ id?: string }> };
  }>(input.files["evals/skill-ir.json"]);
  if (ir) {
    const targets: Record<string, Set<string>> = {
      requirement: new Set((ir.requirements || []).map((item) => String(item.id || "")).filter(Boolean)),
      task: new Set((ir.tasks || []).map((item) => String(item.id || "")).filter(Boolean)),
      capability: new Set((ir.capabilities || []).map((item) => String(item.id || "")).filter(Boolean)),
      input: new Set((ir.inputs || []).map((item) => String(item.id || "")).filter(Boolean)),
      output: new Set((ir.outputs || []).map((item) => String(item.id || "")).filter(Boolean)),
      constraint: new Set((ir.constraints || []).map((item) => String(item.id || "")).filter(Boolean)),
      knowledge: new Set((ir.knowledgeRequirements || []).map((item) => String(item.id || "")).filter(Boolean)),
      "domain-evidence": new Set((ir.domainEvidence || []).map((item) => String(item.id || "")).filter(Boolean)),
      "risk-branch": new Set((ir.riskBranches || []).map((item) => String(item.id || "")).filter(Boolean)),
      "eval-source": new Set((ir.evaluationPlan?.cases || []).map((item) => String(item.id || "")).filter(Boolean)),
    };
    input.plan.canonicalMutations.forEach((mutation) => {
      const target = canonicalMutationTarget(mutation);
      if (target && !targets[target.owner]?.has(target.id)) errors.push(`${mutation.type} 目标 ${target.id || "<empty>"} 不存在于当前 Canonical SkillIR`);
    });
  }
  const changedPaths = new Set(input.plan.operations.map((item) => item.path));
  const newFiles = input.plan.operations.filter((item) => item.action === "create" && !(item.path in input.files));
  const newCapabilities = input.plan.canonicalMutations.filter((item) => item.type === "capability.add");
  if (changedPaths.size > budget.maxArtifactsModified) errors.push(`本轮修改 ${changedPaths.size} 个文件，超过 ${budget.maxArtifactsModified} 个文件的预算`);
  if (newFiles.length > budget.maxNewFiles) errors.push(`本轮新增 ${newFiles.length} 个文件，超过 ${budget.maxNewFiles} 个文件的预算`);
  if (newCapabilities.length > budget.maxNewCapabilities) errors.push(`本轮新增 ${newCapabilities.length} 项能力，超过 ${budget.maxNewCapabilities} 项能力的预算`);
  if (input.plan.operations.some((item) => input.plan.protectedArtifacts.includes(item.path))) errors.push("Patch Plan 试图修改受保护文件");
  input.plan.operations.forEach((operation) => {
    if (COMPILER_OWNED_SEMANTIC_PATHS.has(operation.path)) errors.push(`语义文件 ${operation.path} 必须通过 CanonicalMutation 修改，不能使用 FilePatch`);
    if (!isImplementationBytePath(operation.path)) errors.push(`FilePatch 只允许修改 scripts/* 或 assets/* implementation bytes：${operation.path}`);
    if (operation.action === "edit" && (!(operation.path in input.files) || !operation.find || typeof operation.replacement !== "string")) errors.push(`编辑操作 ${operation.path} 缺少唯一查找文本或目标文件`);
    if (operation.action === "create" && (!operation.content?.trim() || operation.path in input.files)) errors.push(`创建操作 ${operation.path} 不是一个新且非空的文件`);
    if (operation.action === "delete" && (operation.path === "SKILL.md" || !(operation.path in input.files))) errors.push(`删除操作 ${operation.path} 不安全或文件不存在`);
  });
  const conditionalCapabilities = input.capabilities.filter((item) => input.plan.impact.affectedCapabilities.includes(item.id || "") && ["conditional", "optional"].includes(normalizeCapabilityScope(item)));
  if (conditionalCapabilities.length && input.plan.impact.scope === "global") errors.push("条件能力不能通过一次 Patch 扩散为全局要求");
  conditionalCapabilities.forEach((item) => {
    list(item.mustNotAffect).forEach((protectedTarget) => {
      if (input.plan.impact.affectedArtifacts.includes(protectedTarget) || input.plan.operations.some((operation) => operation.path.includes(protectedTarget))) errors.push(`Patch 违反能力 ${item.id} 的 mustNotAffect：${protectedTarget}`);
    });
  });
  const manifestOperation = input.plan.operations.find((operation) => operation.path === "evals/capability-manifest.json");
  if (budget.maxNewCapabilities === 0 && manifestOperation?.action === "create") errors.push("初始架构冻结后不能创建新的能力清单");
  return { valid: errors.length === 0, errors, changedPaths: [...changedPaths], newFiles: newFiles.map((item) => item.path) };
}

export function constrainPatchPlan(input: {
  plan: PatchPlan;
  files: Record<string, string>;
  budget?: MutationBudget;
  protectedArtifacts?: string[];
}) {
  const budget = input.budget || DEFAULT_MUTATION_BUDGET;
  const protectedArtifacts = [...new Set([...input.plan.protectedArtifacts, ...(input.protectedArtifacts || [])])];
  const protectedSet = new Set(protectedArtifacts);
  const selectedPaths = new Set<string>();
  let newFileCount = 0;
  const operations = input.plan.operations.filter((operation) => {
    if (!isImplementationBytePath(operation.path)) return false;
    if (protectedSet.has(operation.path)) return false;
    const isNewFile = operation.action === "create" && !(operation.path in input.files);
    if (!selectedPaths.has(operation.path) && selectedPaths.size >= budget.maxArtifactsModified) return false;
    if (isNewFile && newFileCount >= budget.maxNewFiles) return false;
    if (!selectedPaths.has(operation.path)) selectedPaths.add(operation.path);
    if (isNewFile) newFileCount += 1;
    return true;
  });
  return {
    ...input.plan,
    protectedArtifacts,
    operations,
    canonicalMutations: input.plan.canonicalMutations,
    impact: {
      ...input.plan.impact,
      affectedArtifacts: input.plan.impact.affectedArtifacts.filter((path) => selectedPaths.has(path)),
    },
  };
}

export function applyPatchPlan(files: Record<string, string>, plan: PatchPlan) {
  const next = { ...files };
  const changedPaths: string[] = [];
  plan.operations.forEach((operation) => {
    if (operation.action === "edit") {
      const current = next[operation.path];
      const find = operation.find || "";
      const first = current?.indexOf(find) ?? -1;
      if (first < 0 || current.indexOf(find, first + find.length) >= 0) throw new Error(`Patch 在 ${operation.path} 中没有找到唯一修改位置`);
      next[operation.path] = `${current.slice(0, first)}${operation.replacement || ""}${current.slice(first + find.length)}`;
    } else if (operation.action === "create") next[operation.path] = operation.content || "";
    else delete next[operation.path];
    changedPaths.push(operation.path);
  });
  return { files: next, changedPaths: [...new Set(changedPaths)] };
}

export function estimateDomainValueDensity(files: Record<string, string>) {
  const text = Object.entries(files).filter(([path]) => path === "SKILL.md" || path.startsWith("references/")).map(([, content]) => content).join("\n");
  const generic = text.match(GENERIC_KNOWLEDGE)?.length || 0;
  const behaviorChanging = text.match(BEHAVIOR_CHANGING_KNOWLEDGE)?.length || 0;
  const denominator = Math.max(1, generic + behaviorChanging);
  const score = Math.round((behaviorChanging / denominator) * 100);
  return { score, generic, behaviorChanging, shouldResearch: text.length > 500 && score < 45 };
}

/**
 * Deterministic quality lint derived from recurring patterns in the OpenAI,
 * Anthropic, Microsoft and GitHub public Agent Skill catalogs. This is not a
 * style grader: every finding maps to a concrete runtime, discovery,
 * progressive-disclosure, knowledge or verification defect that the bounded
 * Optimization Loop can repair.
 */
export function auditOpenSkillQuality(files: Record<string, string>): OpenSkillQualityReport {
  const issues: PipelineIssue[] = [];
  const checks: OpenSkillQualityReport["checks"] = [];
  const skill = files["SKILL.md"] || "";
  const body = skill.replace(/^---\s*\n[\s\S]*?\n---(?:\s*\n|$)/, "");
  const frontmatter = skill.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/)?.[1] || "";
  const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.replace(/^['"]|['"]$/g, "").trim() || "";
  const headings = [...body.matchAll(/^#{1,3}\s+(.+?)\s*$/gm)].map((match) => match[1].trim());
  const lineCount = body.split("\n").length;
  const add = (issue: Omit<PipelineIssue, "source">) => issues.push({ ...issue, source: "quality" });
  const check = (id: string, passed: boolean, detail: string) => checks.push({ id, passed, detail });

  const discoverable = description.length >= 24
    && /use when|use for|trigger|when the user|用于|适用于|当用户|触发/i.test(description)
    && /(?:create|review|analy|inspect|convert|generate|build|fix|write|design|plan|deploy|debug|test|validate|optimi[sz]e|research|完成|生成|分析|检查|审阅|修改|转换|规划|处理|设计|验证|研究)/i.test(description);
  check("discovery", discoverable, discoverable ? "description 同时说明能力和触发场景" : "description 没有同时说明做什么与何时触发");
  if (!discoverable) add({
    id: "open-skill-discovery-description",
    priority: "P2",
    type: "WEAK_DISCOVERY_DESCRIPTION",
    evidence: "SKILL.md 的 description 必须同时说明 Skill 做什么、用户在什么任务下应触发；否则目标 Agent 可能根本不会加载它。",
    files: ["SKILL.md"],
  });

  const conciseEntry = lineCount <= 500;
  check("progressive-disclosure", conciseEntry, conciseEntry ? `主文件 ${lineCount} 行` : `主文件 ${lineCount} 行，超过建议的 500 行`);
  if (!conciseEntry) add({
    id: "open-skill-main-file-too-large",
    priority: "P2",
    type: "PROGRESSIVE_DISCLOSURE_OVERFLOW",
    evidence: `SKILL.md 有 ${lineCount} 行。主文件应保留触发、路由和核心工作流，把重资料移到按需读取的 references/。`,
    files: ["SKILL.md"],
  });

  const hasWorkflow = headings.some((heading) => /workflow|steps|process|instructions|工作流|步骤|流程|执行/i.test(heading))
    && /(?:^|\n)\s*(?:\d+[.)、]|[-*+]\s+(?:读取|检查|确认|生成|执行|验证|比较|输出|read|check|verify|run|create|write))/im.test(body);
  check("executable-workflow", hasWorkflow, hasWorkflow ? "主文件含可执行工作流" : "主文件缺少动作化工作流");
  if (!hasWorkflow) add({
    id: "open-skill-executable-workflow",
    priority: "P2",
    type: "NON_EXECUTABLE_WORKFLOW",
    evidence: "主文件没有可识别的动作化步骤。优秀 Skill 用命令式步骤告诉 Agent 读取什么、判断什么、产生什么，而不是只介绍领域知识。",
    files: ["SKILL.md", "evals/skill-ir.json"],
  });

  const hasVerification = headings.some((heading) => /verification|quality check|acceptance|validation|验收|验证|质量检查/i.test(heading))
    || /(?:验证|验收|核对|检查|verify|validate|acceptance).{0,80}(?:输出|结果|产物|文件|artifact|output|result)/i.test(body);
  check("verification", hasVerification, hasVerification ? "含可观察验收入口" : "缺少最终产物验收入口");
  if (!hasVerification) add({
    id: "open-skill-verification-contract",
    priority: "P2",
    type: "MISSING_VERIFICATION_METHOD",
    evidence: "Skill 没有说明完成后如何检查真实输出；应增加针对最终产物的可观察验证，而不是增加一组泛化评分。",
    files: ["SKILL.md", "evals/skill-ir.json"],
    failureType: "missing_verification",
    allowedMutationTypes: FAILURE_ATTRIBUTION_MUTATIONS.missing_verification,
  });

  const referencePaths = Object.keys(files).filter((path) => /^references\/.*\.(?:md|txt)$/i.test(path));
  referencePaths.forEach((path, index) => {
    const content = files[path] || "";
    const lines = content.split("\n").length;
    const reachable = skill.includes(path);
    if (!reachable) add({
      id: `open-skill-unrouted-reference-${index + 1}`,
      priority: "P2",
      type: "UNROUTED_REFERENCE",
      evidence: `${path} 没有从 SKILL.md 的工作流或路由条件中被引用，Agent 不知道何时读取它。`,
      files: ["SKILL.md", path],
    });
    if (lines > 300 && !/(?:^|\n)##?\s+(?:Table of Contents|Contents|目录)\s*$/im.test(content)) add({
      id: `open-skill-large-reference-no-toc-${index + 1}`,
      priority: "P3",
      type: "LARGE_REFERENCE_WITHOUT_TOC",
      evidence: `${path} 有 ${lines} 行但没有目录；长参考资料应允许 Agent 快速定位所需章节。`,
      files: [path],
    });
  });
  check("resource-reachability", !issues.some((issue) => issue.type === "UNROUTED_REFERENCE"), referencePaths.length ? "所有参考资料均可从主流程按需到达" : "没有额外参考资料");

  const ir = parseJson<Record<string, unknown>>(files["evals/skill-ir.json"]);
  const assessment = ir?.knowledgeAssessment && typeof ir.knowledgeAssessment === "object"
    ? ir.knowledgeAssessment as Record<string, unknown>
    : null;
  const required = list(assessment?.requiredCategories);
  const missing = list(assessment?.missingCategories);
  const knowledgeRequired = assessment?.status !== "not-required" && required.length > 0;
  const categoryConfig: Record<string, { label: string; failureType: EvalFailureType }> = {
    decision_rules: { label: "决策规则", failureType: "missing_decision_rule" },
    failure_modes: { label: "失败模式", failureType: "missing_exception" },
    edge_cases: { label: "边界案例", failureType: "missing_exception" },
    verification_methods: { label: "验证方法", failureType: "missing_verification" },
  };
  if (knowledgeRequired) missing.forEach((category, index) => {
    const config = categoryConfig[category] || { label: category, failureType: "missing_decision_rule" as const };
    add({
      id: `open-skill-missing-knowledge-${category}-${index + 1}`,
      priority: "P2",
      type: `MISSING_KNOWLEDGE_CATEGORY_${category.toUpperCase()}`,
      evidence: `Canonical SkillIR 已确认该任务需要专业知识，但仍缺少${config.label}。不得用通用最佳实践补齐，应围绕这一缺口定向检索或明确标记知识不足。`,
      files: ["evals/skill-ir.json", "references/domain-playbook.md"],
      failureType: config.failureType,
      allowedMutationTypes: FAILURE_ATTRIBUTION_MUTATIONS[config.failureType],
    });
  });
  check("knowledge-sufficiency", !knowledgeRequired || missing.length === 0, !knowledgeRequired ? "该 Skill 不依赖外部专业知识" : missing.length ? `缺少：${missing.join("、")}` : "四类专业知识已覆盖");

  const density = estimateDomainValueDensity(files);
  if (knowledgeRequired && density.shouldResearch && !missing.length) add({
    id: "open-skill-low-domain-value-density",
    priority: "P2",
    type: "LOW_BEHAVIOR_CHANGING_KNOWLEDGE",
    evidence: `专业知识中可改变行为的规则密度仅 ${density.score}；应补充有条件、动作和例外的规则，删除“专业、清晰、高质量”等泛化内容。`,
    files: ["SKILL.md", ...referencePaths.slice(0, 3)],
    failureType: "missing_decision_rule",
    allowedMutationTypes: FAILURE_ATTRIBUTION_MUTATIONS.missing_decision_rule,
  });

  const uniqueIssues = [...new Map(issues.map((issue) => [`${issue.type}:${issue.files.join("|")}:${issue.evidence}`, issue])).values()];
  const penalty = uniqueIssues.reduce((sum, issue) => sum + (issue.priority === "P1" ? 30 : issue.priority === "P2" ? 14 : 4), 0);
  return { score: Math.max(0, 100 - penalty), passed: !uniqueIssues.some((issue) => issue.priority === "P1" || issue.priority === "P2"), checks, issues: uniqueIssues };
}

function dedupeBy<T>(items: T[], key: (item: T, index: number) => string) {
  const seen = new Set<string>();
  return items.filter((item, index) => {
    const value = key(item, index);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function pruneBundleDeterministically(files: Record<string, string>): PruneResult {
  const next = { ...files };
  const changed = new Set<string>();
  const deletedPaths: string[] = [];
  const manifest = parseJson<Record<string, unknown>>(next["evals/capability-manifest.json"]);
  if (manifest) {
    const capabilities = Array.isArray(manifest.capabilities) ? manifest.capabilities : [];
    const coverage = Array.isArray(manifest.coverage) ? manifest.coverage : [];
    const cleanCapabilities = dedupeBy(capabilities, (item, index) => String((item as Record<string, unknown>)?.id || index))
      .filter((item) => !((item as Record<string, unknown>)?.necessity && ((item as Record<string, unknown>).necessity as Record<string, unknown>).decision === "exclude"));
    const activeIds = new Set(cleanCapabilities.map((item, index) => String((item as Record<string, unknown>)?.id || index)));
    const cleanCoverage = dedupeBy(coverage, (item, index) => String((item as Record<string, unknown>)?.requirement_id || index))
      .filter((item) => activeIds.has(String((item as Record<string, unknown>)?.requirement_id || "")));
    const layers = manifest.artifact_layers && typeof manifest.artifact_layers === "object" ? manifest.artifact_layers as Record<string, unknown> : null;
    const cleanLayers = layers ? Object.fromEntries(Object.entries(layers).map(([key, value]) => [key, Array.isArray(value) ? [...new Set(value)] : value])) : layers;
    const layersChanged = Boolean(layers && ["runtime", "evaluation", "build_time"].some((key) => Array.isArray(layers[key]) && Array.isArray(cleanLayers?.[key]) && (cleanLayers?.[key] as unknown[]).length !== (layers[key] as unknown[]).length));
    if (cleanCapabilities.length !== capabilities.length || cleanCoverage.length !== coverage.length || layersChanged) {
      next["evals/capability-manifest.json"] = JSON.stringify({ ...manifest, capabilities: cleanCapabilities, coverage: cleanCoverage, ...(cleanLayers ? { artifact_layers: cleanLayers } : {}) }, null, 2);
      changed.add("evals/capability-manifest.json");
    }
  }
  const contracts = parseJson<Record<string, unknown>>(next["integrations/tool-contracts.json"]);
  if (contracts && Array.isArray(contracts.tools)) {
    const cleanTools = dedupeBy(contracts.tools, (item, index) => String((item as Record<string, unknown>)?.id || index));
    if (cleanTools.length !== contracts.tools.length) {
      next["integrations/tool-contracts.json"] = JSON.stringify({ ...contracts, tools: cleanTools }, null, 2);
      changed.add("integrations/tool-contracts.json");
    }
  }
  const evalBank = parseJson<Record<string, unknown>>(next["evals/evals.json"]);
  if (evalBank && Array.isArray(evalBank.evals)) {
    const cleanEvals = dedupeBy(evalBank.evals, (item, index) => String((item as Record<string, unknown>)?.id || index));
    if (cleanEvals.length !== evalBank.evals.length) {
      next["evals/evals.json"] = JSON.stringify({ ...evalBank, evals: cleanEvals }, null, 2);
      changed.add("evals/evals.json");
    }
  }
  const bodies = new Map<string, string>();
  Object.keys(next).filter((path) => path.startsWith("references/")).sort().forEach((path) => {
    const body = next[path].replace(/^#{1,6}\s+.*$/gm, "").replace(/\s+/g, " ").trim().toLowerCase();
    const owner = body.length >= 80 ? bodies.get(body) : undefined;
    if (owner && !(next["SKILL.md"] || "").includes(path)) {
      delete next[path];
      deletedPaths.push(path);
      changed.add(path);
    } else if (body.length >= 80) bodies.set(body, path);
  });
  return { files: next, changedPaths: [...changed], deletedPaths };
}

export function candidateUtility(input: { qualityGain: number; regressionCount: number; changedFiles: number; newFiles: number; tokenDelta: number }) {
  const regressionCost = input.regressionCount * 20;
  const complexityCost = input.changedFiles * 1.5 + input.newFiles * 6;
  const tokenCost = Math.max(0, input.tokenDelta) / 1_000;
  return Math.round((input.qualityGain - regressionCost - complexityCost - tokenCost) * 10) / 10;
}
