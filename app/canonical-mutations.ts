import { auditUserEvidencePolarity, bindSkillIREvals, normalizeKnowledgeAssessment, projectEvalBank, reconcileSkillIRUserEvidence, skillIRDigest, type SkillIR, type SkillIRCapability, type SkillIRRequirement } from "./skill-ir.ts";
import { requirementEvidence } from "./user-evidence.ts";
import { bindWorkflowCapabilities, closeWorkflowDagTerminals, compileWorkflowDag, normalizeWorkflowDagSteps, WORKFLOW_TERMINALS } from "./workflow-dag.ts";
import { hasVerifiedKnowledgeSupport } from "./knowledge-evidence.ts";
import { EMPTY_CAPABILITY_DELTA, normalizeCapabilityDelta } from "./capability-delta.ts";
import { reconcileRuntimeInputResources, hasRuntimeInputBinding } from "./bundle-resource-repair.ts";

export type CanonicalMutation =
  | { type: "identity.update"; changes: Partial<SkillIR["identity"]> }
  | { type: "requirement.add"; requirement: SkillIRRequirement }
  | { type: "requirement.update"; requirementId: string; changes: Partial<SkillIRRequirement> }
  | { type: "requirement.remove"; requirementId: string }
  | { type: "task.add"; task: SkillIR["tasks"][number] }
  | { type: "task.update"; taskId: string; changes: Partial<SkillIR["tasks"][number]> }
  | { type: "task.remove"; taskId: string }
  | { type: "capability.add"; capability: SkillIRCapability }
  | { type: "capability.update"; capabilityId: string; changes: Partial<SkillIRCapability> }
  | { type: "capability.remove"; capabilityId: string }
  | { type: "input.add"; input: SkillIR["inputs"][number] }
  | { type: "input.update"; inputId: string; changes: Partial<SkillIR["inputs"][number]> }
  | { type: "input.remove"; inputId: string }
  | { type: "output.add"; output: SkillIR["outputs"][number] }
  | { type: "output.update"; outputId: string; changes: Partial<SkillIR["outputs"][number]> }
  | { type: "output.remove"; outputId: string }
  | { type: "state.update"; changes: Record<string, unknown> }
  | { type: "constraint.add"; constraint: SkillIR["constraints"][number] }
  | { type: "constraint.update"; constraintId: string; changes: Partial<SkillIR["constraints"][number]> }
  | { type: "constraint.remove"; constraintId: string }
  | { type: "knowledge.add"; knowledge: SkillIR["knowledgeRequirements"][number] }
  | { type: "knowledge.update"; knowledgeId: string; changes: Partial<SkillIR["knowledgeRequirements"][number]> }
  | { type: "knowledge.remove"; knowledgeId: string }
  | { type: "domain-evidence.add"; evidence: Record<string, unknown> }
  | { type: "domain-evidence.update"; evidenceId: string; changes: Record<string, unknown> }
  | { type: "domain-evidence.remove"; evidenceId: string }
  | { type: "risk-branch.add"; branch: SkillIR["riskBranches"][number] }
  | { type: "risk-branch.update"; branchId: string; changes: Partial<SkillIR["riskBranches"][number]> }
  | { type: "risk-branch.remove"; branchId: string }
  | { type: "eval-source.add"; testCase: Record<string, unknown> }
  | { type: "eval-source.update"; caseId: string; changes: Record<string, unknown> }
  | { type: "eval-source.remove"; caseId: string };

export const COMPILER_OWNED_SEMANTIC_PATHS = new Set([
  "SKILL.md",
  "agents/openai.yaml",
  "evals/skill-ir.json",
  "evals/capability-manifest.json",
  "evals/evals.json",
  "references/domain-playbook.md",
  "references/output-contract.md",
  "references/state-model.md",
  "references/loop-plan.md",
  "references/tooling.md",
  "references/source-evidence.md",
  "integrations/tool-contracts.json",
]);

export function isImplementationBytePath(path: string) {
  return /^(?:scripts|assets)\/[A-Za-z0-9._/-]+$/.test(path) && !path.split("/").includes("..");
}

// Wider only for canonical repair, where validateImplementationFiles checks
// the reference owner. The general optimizer's FilePatch boundary stays tight.
export const isRepairImplementationPath = (path: string) => isImplementationBytePath(path) || isAuthoredReferencePath(path);

export function isAuthoredReferencePath(path: string) {
  return /^references\/[A-Za-z0-9._/-]+\.(?:md|txt)$/i.test(path)
    && !path.split("/").includes("..") && !COMPILER_OWNED_SEMANTIC_PATHS.has(path);
}

/** Non-projected reference documents already are file-backed implementations.
 * Require a real active owner; don't silently drop the very file a repair needs. */
export function validateImplementationFiles(ir: SkillIR, value: Record<string, unknown> = {}): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [path, content] of Object.entries(value)) {
    if (COMPILER_OWNED_SEMANTIC_PATHS.has(path)) {
      throw new Error(`IMPLEMENTATION_FILE_INVALID: ${path} 是编译器管理的文件，不能直接修改；纯投影漂移由程序重建，行为变更必须通过 canonicalMutations 修改对应契约后重新编译`);
    }
    if (!isRepairImplementationPath(path) || typeof content !== "string" || !content.trim()) {
      throw new Error(`IMPLEMENTATION_FILE_INVALID: ${path}；仅支持 scripts/assets 和非编译器管理的 references/*.md 或 *.txt，不能用文本冒充二进制文件`);
    }
    if (path.startsWith("references/") && !ir.capabilities.some((item) => item.kind === "reference"
      && item.necessity.decision !== "exclude" && item.implementation.path === path)) {
      throw new Error(`REFERENCE_OWNER_MISSING: ${path} 没有已启用的参考能力；请同时修改对应 capability 的 implementation 和 routingCondition`);
    }
    result[path] = content;
  }
  return result;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function canonicalMutationType(value: unknown) {
  const raw = text(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (!raw) return "";
  const canonicalOwner = (owner: string) => owner.replace("eval_source", "eval-source").replace("domain_evidence", "domain-evidence").replace("risk_branch", "risk-branch");
  if (raw.includes(".")) {
    const [owner, action] = raw.split(".", 2);
    return `${canonicalOwner(owner)}.${action}`;
  }
  const direct = raw.match(/^(requirement|task|capability|input|output|constraint|knowledge|domain_evidence|risk_branch|identity|state|eval_source)_(add|update|remove)$/);
  if (direct) return `${canonicalOwner(direct[1])}.${direct[2]}`;
  const reversed = raw.match(/^(add|update|remove)_(requirement|task|capability|input|output|constraint|knowledge|domain_evidence|risk_branch|identity|state|eval_source)$/);
  if (reversed) return `${canonicalOwner(reversed[2])}.${reversed[1]}`;
  return raw.replaceAll("_", ".");
}

export function normalizeCanonicalMutations(value: unknown): CanonicalMutation[] {
  return array(value).slice(0, 12).flatMap((entry) => {
    const raw = record(entry);
    if (!raw) return [];
    const type = canonicalMutationType(raw.type || raw.action);
    const changes = record(raw.changes) || record(raw.patch) || record(raw.updates) || {};
    const targetId = (...keys: string[]) => text(keys.map((key) => raw[key]).find((candidate) => text(candidate)) || raw.targetId || raw.target_id || raw.target || raw.id);
    const addedRecord = (key: string) => record(raw[key]) || record(raw.item) || record(raw.value);
    if (type === "identity.update") return [{ type, changes } as CanonicalMutation];
    if (type === "requirement.add" && addedRecord("requirement")) return [{ type, requirement: addedRecord("requirement") as SkillIRRequirement }];
    if (type === "requirement.update" && targetId("requirementId", "requirement_id")) return [{ type, requirementId: targetId("requirementId", "requirement_id"), changes } as CanonicalMutation];
    if (type === "requirement.remove" && targetId("requirementId", "requirement_id")) return [{ type, requirementId: targetId("requirementId", "requirement_id") }];
    if (type === "task.add" && addedRecord("task")) return [{ type, task: addedRecord("task") as SkillIR["tasks"][number] }];
    if (type === "task.update" && targetId("taskId", "task_id")) return [{ type, taskId: targetId("taskId", "task_id"), changes } as CanonicalMutation];
    if (type === "task.remove" && targetId("taskId", "task_id")) return [{ type, taskId: targetId("taskId", "task_id") }];
    if (type === "capability.add" && addedRecord("capability")) return [{ type, capability: addedRecord("capability") as SkillIRCapability }];
    if (type === "capability.update" && targetId("capabilityId", "capability_id")) return [{ type, capabilityId: targetId("capabilityId", "capability_id"), changes } as CanonicalMutation];
    if (type === "capability.remove" && targetId("capabilityId", "capability_id")) return [{ type, capabilityId: targetId("capabilityId", "capability_id") }];
    if (type === "input.add" && addedRecord("input")) return [{ type, input: addedRecord("input") as SkillIR["inputs"][number] }];
    if (type === "input.update" && targetId("inputId", "input_id")) return [{ type, inputId: targetId("inputId", "input_id"), changes } as CanonicalMutation];
    if (type === "input.remove" && targetId("inputId", "input_id")) return [{ type, inputId: targetId("inputId", "input_id") }];
    if (type === "output.add" && addedRecord("output")) return [{ type, output: addedRecord("output") as SkillIR["outputs"][number] }];
    if (type === "output.update" && targetId("outputId", "output_id")) return [{ type, outputId: targetId("outputId", "output_id"), changes } as CanonicalMutation];
    if (type === "output.remove" && targetId("outputId", "output_id")) return [{ type, outputId: targetId("outputId", "output_id") }];
    if (type === "state.update") return [{ type, changes }];
    if (type === "constraint.add" && addedRecord("constraint")) return [{ type, constraint: addedRecord("constraint") as SkillIR["constraints"][number] }];
    if (type === "constraint.update" && targetId("constraintId", "constraint_id")) return [{ type, constraintId: targetId("constraintId", "constraint_id"), changes } as CanonicalMutation];
    if (type === "constraint.remove" && targetId("constraintId", "constraint_id")) return [{ type, constraintId: targetId("constraintId", "constraint_id") }];
    if (type === "knowledge.add" && addedRecord("knowledge")) return [{ type, knowledge: addedRecord("knowledge") as SkillIR["knowledgeRequirements"][number] }];
    if (type === "knowledge.update" && targetId("knowledgeId", "knowledge_id")) return [{ type, knowledgeId: targetId("knowledgeId", "knowledge_id"), changes } as CanonicalMutation];
    if (type === "knowledge.remove" && targetId("knowledgeId", "knowledge_id")) return [{ type, knowledgeId: targetId("knowledgeId", "knowledge_id") }];
    if (type === "domain-evidence.add" && addedRecord("evidence")) return [{ type, evidence: addedRecord("evidence") as Record<string, unknown> }];
    if (type === "domain-evidence.update" && targetId("evidenceId", "evidence_id")) return [{ type, evidenceId: targetId("evidenceId", "evidence_id"), changes }];
    if (type === "domain-evidence.remove" && targetId("evidenceId", "evidence_id")) return [{ type, evidenceId: targetId("evidenceId", "evidence_id") }];
    if (type === "risk-branch.add" && addedRecord("branch")) return [{ type, branch: addedRecord("branch") as SkillIR["riskBranches"][number] }];
    if (type === "risk-branch.update" && targetId("branchId", "branch_id")) return [{ type, branchId: targetId("branchId", "branch_id"), changes } as CanonicalMutation];
    if (type === "risk-branch.remove" && targetId("branchId", "branch_id")) return [{ type, branchId: targetId("branchId", "branch_id") }];
    if (type === "eval-source.add" && addedRecord("testCase")) return [{ type, testCase: addedRecord("testCase") as Record<string, unknown> }];
    if (type === "eval-source.update" && targetId("caseId", "case_id")) return [{ type, caseId: targetId("caseId", "case_id"), changes }];
    if (type === "eval-source.remove" && targetId("caseId", "case_id")) return [{ type, caseId: targetId("caseId", "case_id") }];
    return [];
  });
}

function replaceById<T extends object>(items: T[], idKey: keyof T, id: string, changes: Partial<T>) {
  if (!items.some((item) => String(item[idKey]) === id)) throw new Error(`Canonical mutation target does not exist: ${id}`);
  return items.map((item) => String(item[idKey]) === id ? { ...item, ...changes, [idKey]: item[idKey] } : item);
}

function reconcileDerivedContracts(ir: SkillIR) {
  const next = reconcileSkillIRUserEvidence(structuredClone(ir));
  next.capabilityDelta = normalizeCapabilityDelta(next.capabilityDelta);
  const taskIdsByCapability = new Map<string, string[]>();
  next.tasks.forEach((task) => task.capabilityIds.forEach((capabilityId) => {
    taskIdsByCapability.set(capabilityId, [...(taskIdsByCapability.get(capabilityId) || []), task.id]);
  }));

  const activeCapabilityIds = new Set(next.capabilities
    .filter((capability) => capability.kind !== "eval" && capability.necessity.decision !== "exclude")
    .map((capability) => capability.id));
  const retainedWorkflow = normalizeWorkflowDagSteps(next.runtimeContract.workflow).flatMap((step) => {
    const capabilityIds = step.capabilityIds.filter((id) => activeCapabilityIds.has(id));
    return capabilityIds.length ? [{ ...step, capabilityIds }] : [];
  });
  next.runtimeContract.workflow = closeWorkflowDagTerminals(
    bindWorkflowCapabilities(retainedWorkflow, next.capabilities.filter((capability) => activeCapabilityIds.has(capability.id))),
    ["$request", "$source", ...next.inputs.map((item) => `input:${item.id}`)],
  );
  next.knowledgeAssessment = normalizeKnowledgeAssessment(
    next.knowledgeAssessment,
    Array.isArray(next.domainEvidence) ? next.domainEvidence : [],
    Boolean(next.capabilityDelta?.skillMustTeach?.length),
    next.capabilityDelta?.skillMustTeach?.map((gap) => gap.id) || [],
  );
  next.runtimeContract.completionChecks = [...new Set([
    ...next.outputs.flatMap((output) => output.validation),
    ...next.tasks.flatMap((task) => task.successIndicators),
  ].filter(Boolean))];

  const constraintById = new Map(next.constraints.map((constraint) => [constraint.id, constraint]));
  next.requirements.forEach((requirement) => {
    const id = `constraint-${requirement.id}`;
    constraintById.set(id, {
      id,
      ...requirementEvidence(requirement),
      statement: requirement.statement,
      type: requirement.ruleType,
      provenance: requirement.provenance,
      confidence: requirement.confidence,
      failureCost: requirement.failureCost,
      hard: requirement.hard,
      appliesTo: requirement.mappedCapabilityIds,
    });
  });
  next.constraints = [...constraintById.values()].filter((constraint) => {
    if (!constraint.id.startsWith("constraint-")) return true;
    const requirementId = constraint.id.slice("constraint-".length);
    return next.requirements.some((requirement) => requirement.id === requirementId);
  });

  next.resourcePlan.resources = next.capabilities
    .filter((capability): capability is SkillIRCapability & { kind: Exclude<SkillIRCapability["kind"], "llm" | "eval"> } => capability.kind !== "llm" && capability.kind !== "eval")
    .map((capability) => ({
      capabilityId: capability.id,
      kind: capability.kind,
      path: capability.implementation.path,
      decision: capability.necessity.decision,
      reason: capability.necessity.reason,
      consumerTaskIds: taskIdsByCapability.get(capability.id) || [],
    }));
  next.traceability = next.requirements.flatMap((requirement) => requirement.mappedCapabilityIds.flatMap((capabilityId) => {
    const capability = next.capabilities.find((item) => item.id === capabilityId);
    if (!capability) return [];
    return [{
      requirementId: requirement.id,
      capabilityId,
      implementationPath: capability.implementation.path,
      evalCaseIds: capability.evalCaseIds,
    }];
  }));
  return next;
}

export function applySkillIRMutations(ir: SkillIR, mutations: CanonicalMutation[]) {
  let next = structuredClone(ir);
  const changedTargets: string[] = [];
  for (const mutation of mutations) {
    if (mutation.type === "requirement.update" || mutation.type === "requirement.remove") {
      const existing = ir.requirements.find((item) => item.id === mutation.requirementId);
      if (existing && requirementEvidence(existing).polarity === "negative") {
        const evidence = requirementEvidence(existing);
        const changes = mutation.type === "requirement.update" ? mutation.changes : {};
        const protectedFields = ["source", "provenance", "evidenceKind", "polarity", "originalQuote", "interpretation", "statement", "hard", "modality"] as const;
        if (mutation.type === "requirement.remove" || protectedFields.some((key) => key in changes
          && changes[key] !== ({ ...existing, ...evidence })[key])) {
          throw new Error(`[USER_EVIDENCE_IMMUTABLE] ${existing.id}: 自动优化不能删除、改写或反转用户反例；请修改对应执行行为`);
        }
      }
    }
    changedTargets.push(mutation.type);
    if (mutation.type === "identity.update") next.identity = { ...next.identity, ...mutation.changes, skillName: next.identity.skillName };
    else if (mutation.type === "requirement.add") next.requirements = [...next.requirements, mutation.requirement];
    else if (mutation.type === "requirement.update") next.requirements = replaceById(next.requirements, "id", mutation.requirementId, mutation.changes);
    else if (mutation.type === "requirement.remove") next.requirements = next.requirements.filter((item) => item.id !== mutation.requirementId);
    else if (mutation.type === "task.add") next.tasks = [...next.tasks, mutation.task];
    else if (mutation.type === "task.update") next.tasks = replaceById(next.tasks, "id", mutation.taskId, mutation.changes);
    else if (mutation.type === "task.remove") next.tasks = next.tasks.filter((item) => item.id !== mutation.taskId);
    else if (mutation.type === "capability.add") next.capabilities = [...next.capabilities, mutation.capability];
    else if (mutation.type === "capability.update") {
      let existing = next.capabilities.find((item) => item.id === mutation.capabilityId);
      const bindRuntimeInput = existing?.kind === "reference" && mutation.changes.kind === "builtin-tool";
      if (bindRuntimeInput && existing) {
        const input = next.inputs.find((item) => hasRuntimeInputBinding(mutation.changes.input || "", item.id));
        if (!input) throw new Error(`RUNTIME_INPUT_BINDING_REQUIRED: ${existing.id} 改为宿主读取时，input 必须引用一个现有 input:<id>，不能只改 kind 来绕过缺文件检查`);
        next = reconcileRuntimeInputResources(next, {}, { [existing.id]: input.id });
        existing = next.capabilities.find((item) => item.id === mutation.capabilityId);
        if (existing?.kind === "reference") throw new Error(`RUNTIME_INPUT_BINDING_INVALID: ${existing.id} 未建立有效的运行时文件绑定；保留原资源契约`);
      }
      const changes = { ...mutation.changes,
        ...(mutation.changes.implementation && existing
          ? { implementation: { ...existing.implementation, ...mutation.changes.implementation } } : {}),
        ...(bindRuntimeInput && existing ? { implementation: existing.implementation, input: existing.input,
          fallback: existing.fallback, necessity: existing.necessity } : {}),
      };
      next.capabilities = replaceById(next.capabilities, "id", mutation.capabilityId, changes);
      const oldPath = existing?.implementation.path;
      const newPath = changes.implementation?.path;
      // A resource move must update its actual readers, not just the manifest.
      // Preserve user evidence and other owners' instructions verbatim.
      if (existing?.kind === "reference" && oldPath?.startsWith("references/")
        && newPath?.startsWith("references/") && oldPath !== newPath) {
        const move = (value: string) => value.split(oldPath).join(newPath);
        next.capabilities = next.capabilities.map((item) => item.id !== existing.id ? item : {
          ...item, input: move(item.input), output: move(item.output), purpose: move(item.purpose),
          activationCondition: move(item.activationCondition), routingCondition: move(item.routingCondition), fallback: move(item.fallback),
        });
        next.runtimeContract.workflow = next.runtimeContract.workflow.map((step) => !step.capabilityIds.includes(existing.id) ? step : {
          ...step, when: move(step.when), input: move(step.input), action: move(step.action), output: move(step.output), fallback: move(step.fallback),
        });
        next.knowledgeRequirements = next.knowledgeRequirements.map((item) => item.capabilityId !== existing.id ? item : {
          ...item, path: item.path === oldPath ? newPath : item.path, route: move(item.route),
        });
      }
    }
    else if (mutation.type === "capability.remove") next.capabilities = next.capabilities.filter((item) => item.id !== mutation.capabilityId);
    else if (mutation.type === "input.add") next.inputs = [...next.inputs, mutation.input];
    else if (mutation.type === "input.update") next.inputs = replaceById(next.inputs, "id", mutation.inputId, mutation.changes);
    else if (mutation.type === "input.remove") next.inputs = next.inputs.filter((item) => item.id !== mutation.inputId);
    else if (mutation.type === "output.add") next.outputs = [...next.outputs, mutation.output];
    else if (mutation.type === "output.update") next.outputs = replaceById(next.outputs, "id", mutation.outputId, mutation.changes);
    else if (mutation.type === "output.remove") next.outputs = next.outputs.filter((item) => item.id !== mutation.outputId);
    else if (mutation.type === "state.update") next.stateRequirement = { ...next.stateRequirement, ...mutation.changes };
    else if (mutation.type === "constraint.add") next.constraints = [...next.constraints, mutation.constraint];
    else if (mutation.type === "constraint.update") next.constraints = replaceById(next.constraints, "id", mutation.constraintId, mutation.changes);
    else if (mutation.type === "constraint.remove") next.constraints = next.constraints.filter((item) => item.id !== mutation.constraintId);
    else if (mutation.type === "knowledge.add") next.knowledgeRequirements = [...next.knowledgeRequirements, mutation.knowledge];
    else if (mutation.type === "knowledge.update") next.knowledgeRequirements = replaceById(next.knowledgeRequirements, "id", mutation.knowledgeId, mutation.changes);
    else if (mutation.type === "knowledge.remove") next.knowledgeRequirements = next.knowledgeRequirements.filter((item) => item.id !== mutation.knowledgeId);
    else if (mutation.type === "domain-evidence.add") next.domainEvidence = [...next.domainEvidence, mutation.evidence];
    else if (mutation.type === "domain-evidence.update") next.domainEvidence = replaceById(next.domainEvidence.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)), "id", mutation.evidenceId, mutation.changes);
    else if (mutation.type === "domain-evidence.remove") next.domainEvidence = next.domainEvidence.filter((item) => !(item && typeof item === "object" && !Array.isArray(item) && String((item as Record<string, unknown>).id || "") === mutation.evidenceId));
    else if (mutation.type === "risk-branch.add") next.riskBranches = [...next.riskBranches, mutation.branch];
    else if (mutation.type === "risk-branch.update") next.riskBranches = replaceById(next.riskBranches, "id", mutation.branchId, mutation.changes);
    else if (mutation.type === "risk-branch.remove") next.riskBranches = next.riskBranches.filter((item) => item.id !== mutation.branchId);
    else if (mutation.type === "eval-source.add") next.evaluationPlan.cases = [...next.evaluationPlan.cases, mutation.testCase];
    else if (mutation.type === "eval-source.update") next.evaluationPlan.cases = replaceById(next.evaluationPlan.cases, "id", mutation.caseId, mutation.changes);
    else if (mutation.type === "eval-source.remove") next.evaluationPlan.cases = next.evaluationPlan.cases.filter((item) => String(item.id) !== mutation.caseId);
  }
  next = reconcileDerivedContracts(next);
  next = bindSkillIREvals(next, projectEvalBank(next));
  return { ir: next, changedTargets: [...new Set(changedTargets)] };
}

export function validateCanonicalSkillIR(ir: SkillIR) {
  const issues: string[] = auditUserEvidencePolarity(ir);
  const unique = (values: string[], label: string) => {
    const seen = new Set<string>();
    values.forEach((value) => { if (!value || seen.has(value)) issues.push(`${label} id is empty or duplicated: ${value || "<empty>"}`); seen.add(value); });
  };
  unique(ir.requirements.map((item) => item.id), "requirement");
  unique(ir.tasks.map((item) => item.id), "task");
  unique(ir.capabilities.map((item) => item.id), "capability");
  unique(ir.inputs.map((item) => item.id), "input");
  unique(ir.outputs.map((item) => item.id), "output");
  unique(ir.riskBranches.map((item) => item.id), "risk-branch");
  const domainEvidence = ir.domainEvidence.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  unique(domainEvidence.map((item) => String(item.id || "")), "domain-evidence");
  const capabilityIds = new Set(ir.capabilities.map((item) => item.id));
  const inputIds = new Set(ir.inputs.map((item) => item.id));
  const outputIds = new Set(ir.outputs.map((item) => item.id));
  ir.requirements.forEach((item) => {
    if (!item.statement?.trim()) issues.push(`requirement ${item.id} has no statement`);
    if (item.hard && !["user_explicit", "source_grounded"].includes(item.provenance) && item.evidenceKind !== "negative_example") issues.push(`requirement ${item.id} cannot be hard with provenance ${item.provenance}`);
    item.mappedCapabilityIds.forEach((id) => { if (!capabilityIds.has(id)) issues.push(`requirement ${item.id} references missing capability ${id}`); });
  });
  ir.tasks.forEach((item) => {
    item.capabilityIds.forEach((id) => { if (!capabilityIds.has(id)) issues.push(`task ${item.id} references missing capability ${id}`); });
    [...item.requiredInputIds, ...item.optionalInputIds].forEach((id) => { if (!inputIds.has(id)) issues.push(`task ${item.id} references missing input ${id}`); });
    item.outputIds.forEach((id) => { if (!outputIds.has(id)) issues.push(`task ${item.id} references missing output ${id}`); });
  });
  ir.outputs.forEach((item) => item.producerCapabilityIds.forEach((id) => { if (!capabilityIds.has(id)) issues.push(`output ${item.id} references missing producer ${id}`); }));
  ir.inputs.forEach((item) => { if (!item.resolution?.mode || !item.missingBehavior?.trim()) issues.push(`input ${item.id} has no resolution contract`); });
  ir.riskBranches.forEach((item) => {
    if (!item.condition?.trim() || !item.action?.trim() || !item.stopOrRedirect?.trim()) issues.push(`risk-branch ${item.id} has an incomplete condition/action/fallback contract`);
  });
  domainEvidence.forEach((item) => {
    const id = String(item.id || "<empty>");
    if (!String(item.rule || item.knowledge || "").trim()) issues.push(`domain-evidence ${id} has no behavior-changing rule`);
    if (!["decision_rules", "failure_modes", "edge_cases", "verification_methods"].includes(String(item.category || ""))) issues.push(`domain-evidence ${id} has no valid required category`);
    if (!String(item.applies_when || "").trim()) issues.push(`domain-evidence ${id} has no applies_when condition`);
    const confidence = Number(item.confidence);
    if (!Number.isFinite(confidence) || confidence <= 0 || confidence > 1) issues.push(`domain-evidence ${id} has invalid confidence`);
    const evidenceType = String(item.evidence_type || "");
    const sourceUrls = Array.isArray(item.source_urls) ? item.source_urls.filter((url) => typeof url === "string" && /^https?:\/\//i.test(url)) : [];
    const evalCaseIds = Array.isArray(item.eval_case_ids) ? item.eval_case_ids.filter((caseId) => typeof caseId === "string" && Boolean(caseId.trim())) : [];
    if (evidenceType === "official_rule" && !sourceUrls.length) issues.push(`domain-evidence ${id} claims an official rule without source_urls`);
    if (sourceUrls.length && !hasVerifiedKnowledgeSupport(item)) issues.push(`domain-evidence ${id} has no valid source/gap verification for its current claim`);
    if (evidenceType === "evidence_backed_practice" && !sourceUrls.length && !evalCaseIds.length) issues.push(`domain-evidence ${id} claims evidence without source_urls or eval_case_ids`);
    if (!["official_rule", "evidence_backed_practice", "user_preference", "heuristic"].includes(evidenceType)) issues.push(`domain-evidence ${id} has invalid evidence_type`);
    if (!sourceUrls.length && !evalCaseIds.length && evidenceType !== "user_preference") issues.push(`domain-evidence ${id} has no source_urls or eval_case_ids provenance`);
  });
  const normalizedKnowledge = normalizeKnowledgeAssessment(ir.knowledgeAssessment, domainEvidence, Boolean(ir.capabilityDelta?.skillMustTeach?.length), ir.capabilityDelta?.skillMustTeach?.map((gap) => gap.id) || []);
  if (JSON.stringify(ir.knowledgeAssessment) !== JSON.stringify(normalizedKnowledge)) issues.push("knowledgeAssessment 与 Canonical Domain Evidence 覆盖情况不一致");
  const dag = compileWorkflowDag(
    normalizeWorkflowDagSteps(ir.runtimeContract?.workflow),
    ["$request", "$source", ...ir.inputs.map((item) => `input:${item.id}`)],
    {
      terminalOutputs: Object.values(WORKFLOW_TERMINALS),
      requiredTerminalOutputs: [WORKFLOW_TERMINALS.completed],
    },
  );
  issues.push(...dag.issues.map((item) => item.message));
  return { valid: issues.length === 0, issues };
}

export function semanticSkillIRDigest(value: SkillIR | Record<string, string>) {
  if ("schemaVersion" in value) return skillIRDigest(value as SkillIR);
  try { return skillIRDigest(JSON.parse((value as Record<string, string>)["evals/skill-ir.json"] || "") as SkillIR); }
  catch { return "invalid-skill-ir"; }
}

export function parseCanonicalSkillIR(files: Record<string, string>) {
  try {
    const parsed = JSON.parse(files["evals/skill-ir.json"] || "") as SkillIR;
    const capabilityDelta = normalizeCapabilityDelta(parsed.capabilityDelta || EMPTY_CAPABILITY_DELTA);
    return reconcileSkillIRUserEvidence({
      ...parsed,
      capabilityDelta,
      knowledgeAssessment: normalizeKnowledgeAssessment(
        parsed.knowledgeAssessment,
        Array.isArray(parsed.domainEvidence) ? parsed.domainEvidence : [],
        capabilityDelta.skillMustTeach.length > 0,
        capabilityDelta.skillMustTeach.map((gap) => gap.id),
      ),
      runtimeContract: { ...parsed.runtimeContract, workflow: normalizeWorkflowDagSteps(parsed.runtimeContract?.workflow) },
    });
  }
  catch { return null; }
}

export function feedbackRequirementMutations(ir: SkillIR, feedback: string[]): CanonicalMutation[] {
  const core = ir.capabilities.find((item) => item.kind === "llm") || ir.capabilities[0];
  if (!core) return [];
  const existing = new Set(ir.requirements.map((item) => item.statement.replace(/\s+/g, "").toLowerCase()));
  return feedback.flatMap((statement, index) => {
    const normalized = statement.replace(/\s+/g, "").toLowerCase();
    if (!normalized || existing.has(normalized)) return [];
    return [{
      type: "requirement.add" as const,
      requirement: {
        id: `personalization-${Date.now()}-${index + 1}`,
        statement,
        provenance: "user_explicit" as const,
        source: "personalization.demo-feedback",
        confidence: 1,
        modality: "MUST" as const,
        ruleType: "preference" as const,
        failureCost: "medium" as const,
        hard: true,
        mappedCapabilityIds: [core.id],
      },
    }];
  });
}
