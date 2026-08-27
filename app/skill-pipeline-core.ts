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
  missing_verification: ["output.update", "eval-source.add", "eval-source.update", "eval-source.remove"],
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
  const conflict = /冲突|矛盾|互相抵触|不一致的指令|优先级错误|覆盖了用户|contradict|conflict|incompatible instruction|priority inversion/i;
  const tool = /\b(?:MCP|API|tool|browser|search|filesystem|command|adapter)\b|工具|调用|连接|授权|参数|回执|可用性|降级路径/i;
  const verification = /验证|验收|核对|检查|断言|评分器|证据不足|没有证明|未验证|verify|validation|acceptance|assertion|grader|unchecked/i;
  const exception = /例外|边界|异常|空值|缺失输入|格式错误|不可用|失败恢复|回退|停止条件|edge case|exception|boundary|malformed|missing input|fallback|failure recovery/i;
  const decision = /决策|判断规则|选择条件|优先级|取舍|分类规则|映射规则|decision rule|heuristic|routing rule|tie.?breaker/i;
  const type: EvalFailureType = conflict.test(value)
    ? "instruction_conflict"
    : tool.test(value) || family === "integration"
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
  source: "static" | "closure" | "semantic" | "eval" | "regression";
  evidence: string;
  files: string[];
  capabilityId?: string;
  failureType?: EvalFailureType;
  allowedMutationTypes?: string[];
  evalCaseIds?: string[];
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

export function selectHighestPriorityIssues(issues: PipelineIssue[]) {
  const highest = PRIORITY_ORDER.find((priority) => issues.some((item) => item.priority === priority));
  return highest ? issues.filter((item) => item.priority === highest) : [];
}

export function optimizationPolicyFor(issues: PipelineIssue[]) {
  const selected = selectHighestPriorityIssues(issues);
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
  const explicitOwnership = list(item.affects).some((entry) => /^(?:artifact-output|file-output)$/i.test(entry.trim()));
  const producesFile = /(?:create|write|export|save|generate|render|创建|写入|导出|保存|生成|渲染).{0,32}(?:artifact|file|pdf|docx?|pptx?|xlsx?|csv|json|html|markdown|图片|图像|文件|产物)|(?:artifact|file|pdf|docx?|pptx?|xlsx?|csv|json|html|markdown|图片|图像|文件|产物).{0,32}(?:create|write|export|save|generate|render|创建|写入|导出|保存|生成|渲染)/i.test(item.output || "");
  return explicitOwnership || producesFile;
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
  if (!input.requiresArtifact || capabilities.some(ownsRequestedArtifact)) return capabilities;
  const existingIndex = capabilities.findIndex((item) => item.id === input.fallback.id);
  const existing = existingIndex >= 0 ? capabilities[existingIndex] : undefined;
  const patterns = input.artifactPatterns.length ? input.artifactPatterns : ["outputs/**"];
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
