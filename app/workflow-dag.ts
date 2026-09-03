import { hostEvidenceAdapter } from "./host-evidence-adapters.ts";

export type WorkflowDagStep = {
  id: string;
  capabilityIds: string[];
  /** Optional providers available to this operation, not scheduled calls or
   * additional producers. Execution and permission are resolved at runtime. */
  availableCapabilityIds?: string[];
  when: string;
  input: string;
  action: string;
  output: string;
  fallback: string;
  requires: string[];
  produces: string[];
  mutates: string[];
  role?: "read" | "transform" | "validate" | "persist" | "deliver" | "await-input" | "await-approval";
  /** Business artifacts actually handed to the user, not arbitrary leaf tokens. */
  delivers?: string[];
  /** Produced ONLY after a real user reply resumes this checkpoint. */
  resumeProduces?: string[];
};

export type WorkflowDagIssue = {
  type: "duplicate-step" | "duplicate-producer" | "unmet-dependency" | "cycle" | "empty-production" | "missing-terminal" | "unconsumed-production" | "disconnected-step" | "invalid-terminal" | "invalid-confirmation" | "unordered-mutation";
  stepId: string;
  dependency?: string;
  message: string;
};

export type WorkflowDagCompileOptions = {
  /** Outputs that end a runtime path. Several conditional steps may produce
   * the same terminal token because only one branch executes at runtime. */
  terminalOutputs?: string[];
  /** Terminal tokens that must have at least one producer. Defaults to every
   * terminalOutputs entry for backwards compatibility. */
  requiredTerminalOutputs?: string[];
};

export const WORKFLOW_TERMINALS = {
  completed: "$output",
  inputRequired: "$input_required",
  approvalRequired: "$approval_required",
} as const;

const unique = (values: unknown, limit = 32) => Array.isArray(values)
  ? Array.from(new Set(values.map(String).map((value) => value.trim()).filter(Boolean))).slice(0, limit)
  : [];

export function normalizeWorkflowDagSteps(value: unknown): WorkflowDagStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const raw = item as Record<string, unknown>;
    const action = typeof raw.action === "string" ? raw.action.trim().slice(0, 420) : "";
    if (!action) return [];
    const rawId = typeof raw.id === "string" ? raw.id : `step-${index + 1}`;
    const id = rawId.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || `step-${index + 1}`;
    return [{
      id,
      capabilityIds: unique(raw.capabilityIds),
      ...(unique(raw.availableCapabilityIds).length ? { availableCapabilityIds: unique(raw.availableCapabilityIds) } : {}),
      when: typeof raw.when === "string" ? raw.when.trim().slice(0, 320) : "每次执行到该步骤时",
      input: typeof raw.input === "string" ? raw.input.trim().slice(0, 420) : "",
      action,
      output: typeof raw.output === "string" ? raw.output.trim().slice(0, 420) : "",
      fallback: typeof raw.fallback === "string" ? raw.fallback.trim().slice(0, 420) : "停止依赖该结果的后续步骤并说明缺口",
      requires: unique(raw.requires),
      produces: unique(raw.produces),
      mutates: unique(raw.mutates),
      ...(["read", "transform", "validate", "persist", "deliver", "await-input", "await-approval"].includes(String(raw.role)) ? { role: raw.role as WorkflowDagStep["role"] } : {}),
      delivers: unique(raw.delivers),
      resumeProduces: unique(raw.resumeProduces),
    }];
  }).slice(0, 32);
}

function pauseTerminalForStep(step: WorkflowDagStep) {
  // A fallback mentioning approval does not make a productive step a pause.
  const text = step.action;
  if (step.role === "await-approval" || /(?:等待|请求|征求).{0,12}(?:批准|审批|授权)|(?:await|request|ask for)\s+(?:user\s+)?(?:approval|authorization)/i.test(text)) {
    return WORKFLOW_TERMINALS.approvalRequired;
  }
  if (step.role === "await-input" || /(?:请求|询问|等待|请).{0,12}用户.{0,16}(?:确认|补充|提供|反馈|修改意见)|等待确认|(?:ask|wait for|request).{0,16}(?:input|clarification|confirmation|feedback)/i.test(text)) {
    return WORKFLOW_TERMINALS.inputRequired;
  }
  return undefined;
}

const isTerminal = (token: string) => Object.values(WORKFLOW_TERMINALS).some((value) => value === token);
// Reserved reply tokens describe a runtime event, never a planner inference.
export const isUserReplyToken = (token: string) => /^\$(?:(?:user|human)[_-])?(?:feedback|confirmed|confirmation|approval|approved|authorization)$/i.test(token);
const businessOutputs = (step: WorkflowDagStep) => step.produces.filter((token) => !isTerminal(token));

function explicitDelivery(step: WorkflowDagStep) {
  if (step.role) return step.role === "deliver" || step.role === "persist";
  return /(?:交付|输出|生成|完成).{0,14}(?:最终|完整|可交付|可直接使用|用户请求|核心任务)|(?:deliver|return|save|export)\s+(?:the\s+)?(?:final|completed)/i.test(`${step.action} ${step.output}`);
}

/** Preserve every business token. Only explicit delivery and user checkpoints
 * can close a path; a disconnected helper remains a diagnosable graph error. */
export function closeWorkflowDagTerminals(steps: WorkflowDagStep[], _initialInputs: string[] = ["$request", "$source"]) {
  return steps.map((step): WorkflowDagStep => {
    const pause = pauseTerminalForStep(step);
    if (pause) {
      // A presentation followed by its own explicit checkpoint is not a
      // second independent pause. Only the checkpoint owns the real reply.
      const products = businessOutputs(step).filter((token) => !isUserReplyToken(token));
      const hasReplyOwner = !(step.resumeProduces?.length) && !step.produces.some(isUserReplyToken)
        && products.length > 0 && steps.some((other) => other.id !== step.id
          && other.role === (pause === WORKFLOW_TERMINALS.approvalRequired ? "await-approval" : "await-input")
          && Boolean(other.resumeProduces?.length) && other.requires.some((token) => products.includes(token)));
      if (hasReplyOwner) return { ...step, role: "transform", produces: products, delivers: [], resumeProduces: [] };
      const resumeProduces = unique([...(step.resumeProduces || []), ...step.produces.filter(isUserReplyToken)]);
      return { ...step, role: pause === WORKFLOW_TERMINALS.approvalRequired ? "await-approval" : "await-input", resumeProduces,
        delivers: businessOutputs(step).filter((token) => !isUserReplyToken(token)),
        produces: unique([...step.produces.filter((token) => !isTerminal(token) && !isUserReplyToken(token)), pause]) };
    }
    if (!explicitDelivery(step)) return { ...step };
    // Saving an intermediate file is not completion when that exact file
    // still has to be validated and handed off by a downstream delivery.
    const downstreamValidation = steps.some((other) => other.id !== step.id && other.role === "validate" && other.requires.some((token) => step.produces.includes(token)));
    if (step.role === "persist" && downstreamValidation) return { ...step, produces: step.produces.filter((token) => token !== WORKFLOW_TERMINALS.completed), delivers: [] };
    const delivers = step.delivers?.length ? step.delivers : businessOutputs(step);
    return { ...step, role: step.role || "deliver", delivers, produces: unique([...step.produces, WORKFLOW_TERMINALS.completed]) };
  });
}

type RoutableCapability = { id: string; kind: string; name?: string; input: string; output: string; requirement?: string; purpose?: string; activationCondition?: string; routingCondition?: string; fallback: string; affects?: string[]; optional?: boolean; scope?: string };
const label = (text: string) => text.replace(/[\s`*_，,；;：:。.!！]/g, "").toLowerCase();

function ownerMatchScore(step: WorkflowDagStep, capability: RoutableCapability) {
  const stepText = `${step.id} ${step.action} ${step.input} ${step.output}`.toLowerCase();
  const capabilityText = `${capability.id} ${capability.name || ""} ${capability.requirement || ""} ${capability.purpose || ""} ${capability.input} ${capability.output}`.toLowerCase();
  const words = capabilityText.match(/[a-z0-9]{3,}|[\u4e00-\u9fff]{2,8}/g) || [];
  return words.reduce((score, word) => score + (stepText.includes(word) ? Math.min(8, word.length) : 0), 0);
}

/** A model may omit an owner or name one that a later necessity gate removes.
 * Rebind the operation from real graph neighbours and enabled semantic
 * capabilities. Ambiguous ties keep all matching semantic owners instead of
 * inventing a capability id or deleting the operation. */
export function bindOwnerlessWorkflowSteps(steps: WorkflowDagStep[], capabilities: RoutableCapability[]) {
  const enabledIds = new Set(capabilities.map((item) => item.id));
  const semantic = capabilities.filter((item) => item.kind === "llm");
  if (!semantic.length) return steps;
  return steps.map((step) => {
    const existing = step.capabilityIds.filter((id) => enabledIds.has(id));
    if (existing.length) return { ...step, capabilityIds: existing };
    const connected = steps.filter((other) => other.id !== step.id && (
      other.produces.some((token) => step.requires.includes(token))
      || step.produces.some((token) => other.requires.includes(token))
    ));
    const neighbourIds = new Set(connected.flatMap((other) => other.capabilityIds));
    const neighbourOwners = semantic.filter((item) => neighbourIds.has(item.id));
    const pool = neighbourOwners.length ? neighbourOwners : semantic;
    const scored = pool.map((item) => ({ item, score: ownerMatchScore(step, item) }));
    const best = Math.max(...scored.map((item) => item.score));
    const selected = best > 0 ? scored.filter((item) => item.score === best).map((item) => item.item) : pool;
    return { ...step, capabilityIds: selected.map((item) => item.id) };
  });
}

export function isOptionalToolAvailability(capability: RoutableCapability) {
  return ["builtin-tool", "mcp"].includes(capability.kind)
    && capability.optional !== false && capability.scope !== "global"
    && Boolean(capability.optional || ["conditional", "optional"].includes(capability.scope || ""))
    && !capability.affects?.some((effect) => /artifact-output|file-output/.test(effect));
}

export function workflowCapabilityRouteIssues(steps: WorkflowDagStep[], capabilities: RoutableCapability[]) {
  return steps.flatMap((step) => (step.availableCapabilityIds || []).flatMap((id) => {
    const capability = capabilities.find((item) => item.id === id);
    return !capability || !isOptionalToolAvailability(capability)
      || !["read", "transform"].includes(step.role || "transform") || step.mutates.length
      || !step.capabilityIds.some((owner) => capabilities.some((item) => item.id === owner && item.kind === "llm"))
      ? [`Workflow step ${step.id} 的可选能力 ${id} 无效；必需操作、产物写入与确认不能降级为能力可用性声明`] : [];
  }));
}

export function isReadOnlyHostEvidence(capability: RoutableCapability) {
  // The spreadsheet interface includes file export. Only its explicitly
  // scoped analysis facet may be embedded; never treat the whole tool as read-only.
  if (capability.id === "host-spreadsheet-analysis") return false;
  const operation = `${capability.id} ${capability.requirement} ${capability.purpose}`;
  return capability.kind === "builtin-tool"
    && /read|search|读取|解析|搜索|检索|查询|核对来源/i.test(operation)
    && !/write|save|delete|send|publish|编辑|写入|保存|删除|发送|发布/i.test(operation)
    && !capability.affects?.some((effect) => /artifact-output|file-output/.test(effect));
}

/** Bind missing runtime steps using declared data, never array position.
 * Ambiguity is intentionally left as an unmet dependency for targeted repair. */
export function bindWorkflowCapabilities(existing: WorkflowDagStep[], capabilities: RoutableCapability[]) {
  const steps = existing.map((step) => ({ ...step, requires: [...step.requires], produces: [...step.produces], delivers: [...(step.delivers || [])] }));
  const needsBinding = new Set<string>();
  for (const step of steps) {
    const owners = capabilities.filter((item) => step.capabilityIds.includes(item.id));
    if (!step.role && owners.length && owners.every((item) => item.kind === "reference" || item.kind === "asset")) step.role = "read";
    if (!step.role && owners.some((item) => /artifact-output|file-output/.test((item.affects || []).join(" ")))) step.role = "persist";
    if (step.role === "persist" && step.requires.every((token) => token === "$request" || token === "$source" || token.startsWith("unbound:"))) {
      step.requires = [];
      needsBinding.add(step.id);
    }
  }
  const routed = new Set(steps.flatMap((step) => [...step.capabilityIds, ...(step.availableCapabilityIds || [])]));
  const missing = capabilities.filter((item) => !routed.has(item.id));
  for (const item of missing) {
    if (item.kind === "reference" && item.affects?.includes("runtime-workflow")) {
      const consumers = steps.filter((step) => step.capabilityIds.some((id) => capabilities.some((capability) => capability.id === id && capability.kind === "llm")) && !pauseTerminalForStep(step));
      if (consumers.length) {
        // Reference reading is part of its consumer's operation, not a
        // disconnected pseudo-task that can independently complete the job.
        consumers.forEach((step) => { step.capabilityIds = unique([...step.capabilityIds, item.id]); });
        continue;
      }
    }
    const persist = /artifact-output|file-output/.test((item.affects || []).join(" "))
      || (!isOptionalToolAvailability(item) && /(?:保存|写入|导出|save|write|export).{0,24}(?:文件|file|artifact|pdf|docx|csv)/i.test(`${item.requirement} ${item.output}`));
    const step: WorkflowDagStep = {
      id: `step-capability-${item.id}`, capabilityIds: [item.id], when: item.activationCondition || item.routingCondition || "执行相关任务时",
      input: item.input, action: item.purpose || item.requirement || item.id, output: item.output, fallback: item.fallback,
      requires: [], produces: [`capability:${item.id}:output`], mutates: [],
      role: persist ? "persist" : item.kind === "reference" ? "read" : "transform",
    };
    steps.push({ ...step, delivers: [] });
    needsBinding.add(step.id);
  }
  for (const step of steps.filter((entry) => needsBinding.has(entry.id))) {
    const matches = steps.filter((other) => other !== step && (
      (label(other.output).length > 2 && label(step.input).includes(label(other.output)))
      || businessOutputs(other).some((token) => step.input.includes(token))));
    let parents = matches;
    if (!parents.length && step.role === "persist") {
      const deliveries = steps.filter((other) => other !== step && other.role !== "persist" && (explicitDelivery(other) || (!other.role && other.produces.includes("$output"))));
      if (deliveries.length === 1) parents = deliveries;
    }
    for (const parent of parents) {
      if (!businessOutputs(parent).length) parent.produces.push(`step:${parent.id}:result`);
      step.requires.push(...businessOutputs(parent));
      if (step.role === "persist" && (explicitDelivery(parent) || parent.produces.includes("$output"))) {
        parent.produces = parent.produces.filter((token) => token !== "$output");
        parent.role = "transform";
        parent.delivers = [];
      }
    }
    if (!step.requires.length) {
      const runtimeCapabilities = capabilities.filter((item) => item.kind !== "reference" && item.kind !== "eval");
      const soleCore = runtimeCapabilities.length === 1 && runtimeCapabilities[0].kind === "llm";
      const rawInput = /\$request|用户(?:输入|材料|请求|提供|上传)|当前(?:任务|请求)|原始|user input|raw input/i.test(step.input);
      step.requires = rawInput || (soleCore && step.role !== "persist") ? ["$request"] : [`unbound:${step.id}:input`];
      if (soleCore && step.role === "transform") step.role = "deliver";
    }
  }
  // Exact token references are lossless bindings, unlike guessing from prose.
  for (const step of steps) for (const other of steps) {
    if (step === other) continue;
    for (const token of businessOutputs(other)) {
      if (step.input.split(/[\s,，;；`]+/).includes(token) && !step.requires.includes(token)) step.requires.push(token);
    }
  }
  const folded = new Set<string>();
  for (const helper of steps) {
    if (!helper.id.startsWith("step-capability-") || helper.mutates.length || !["read", "transform"].includes(helper.role || "transform")) continue;
    const capability = capabilities.find((item) => helper.capabilityIds.length === 1 && item.id === helper.capabilityIds[0]);
    // An optional, read-only evidence lookup belongs inside the content
    // operation that can use it. Do not force an unused synthetic query/result
    // into the global DAG. Required searches and externally-writing tools keep
    // their own explicit producers/consumers and remain subject to validation.
    const adapter = capability && hostEvidenceAdapter(capability);
    const optionalSearch = capability && isReadOnlyHostEvidence(capability)
      && /搜索|检索|来源核验|查询|核对来源|search|source verification/i.test(`${capability.id} ${capability.requirement} ${capability.purpose}`);
    const wireName = capability?.id.replace(/^host-/, "").replace(/-/g, "_");
    const syntheticProducts = new Set([`capability:${capability?.id}:output`, ...["output", "results"].flatMap((suffix) => [`${wireName}_${suffix}`, `$${wireName}_${suffix}`])]);
    if (!capability || helper.id !== `step-capability-${capability.id}` || !isOptionalToolAvailability(capability)
      || helper.delivers?.length || helper.resumeProduces?.length
      || helper.produces.some((token) => !syntheticProducts.has(token) || isTerminal(token) || isUserReplyToken(token))
      || helper.requires.some((token) => isTerminal(token) || isUserReplyToken(token))
      || steps.some((step) => step !== helper && helper.produces.some((token) => [...step.requires, ...step.mutates, ...(step.delivers || [])].includes(token)))) continue;
    // Walk real edges to delivery (including validation and approval), not
    // array position or only the node immediately before the final output.
    const reachesEnd = new Set(steps.filter((step) => explicitDelivery(step) || pauseTerminalForStep(step)).map((step) => step.id));
    let changed = true;
    while (changed) {
      changed = false;
      for (const step of steps) if (!reachesEnd.has(step.id) && steps.some((consumer) => reachesEnd.has(consumer.id) && consumer.requires.some((token) => step.produces.includes(token)))) {
        reachesEnd.add(step.id); changed = true;
      }
    }
    const consumers = steps.filter((step) => step !== helper && !step.id.startsWith("step-capability-")
      && step.role !== "persist" && step.role !== "validate" && !pauseTerminalForStep(step)
      && step.capabilityIds.some((id) => capabilities.some((item) => item.id === id && item.kind === "llm"))
      && (step.role !== "deliver" || step.delivers?.some((token) => step.produces.includes(token)))
      // A helper reading an intermediate artifact can only be absorbed by an
      // operation that already consumes that exact artifact. Never discard a
      // query/data dependency or guess a new edge from a later producer.
      && helper.requires.every((token) => ["$request", "$source"].includes(token) || token.startsWith("unbound:") || step.requires.includes(token))
      && businessOutputs(step).length > 0 && step.requires.length > 0 && reachesEnd.has(step.id));
    const canEmbedEvidence = Boolean(adapter || optionalSearch);
    const targets = canEmbedEvidence ? consumers : consumers.filter((step) => ["read", "transform"].includes(step.role || "transform") && !step.mutates.length);
    if (!targets.length) continue;
    // The runtime projection binds each adapter's actual arguments and result
    // use to the owning operation. No fake global *_output token or completed
    // marker is created. Conditions make these available adapters, not an
    // instruction to invoke every selected tool on every task.
    targets.forEach((step) => {
      if (canEmbedEvidence) step.capabilityIds = unique([...step.capabilityIds, capability.id]);
      else step.availableCapabilityIds = unique([...(step.availableCapabilityIds || []), capability.id]);
      step.requires = unique([...step.requires, ...helper.requires.filter((token) => !token.startsWith("unbound:"))]);
    });
    folded.add(helper.id);
  }
  return bindOwnerlessWorkflowSteps(steps.filter((step) => !folded.has(step.id)), capabilities);
}

/** Compile a real DAG. Dependencies may be satisfied only by declared initial
 * inputs or by another step's produces[]. Array order has no authority. */
export function compileWorkflowDag(steps: WorkflowDagStep[], initialInputs: string[] = [], options: WorkflowDagCompileOptions = {}) {
  const issues: WorkflowDagIssue[] = [];
  const terminalOutputs = unique(options.terminalOutputs);
  const terminalOutputSet = new Set(terminalOutputs);
  const requiredTerminalOutputs = unique(options.requiredTerminalOutputs?.length ? options.requiredTerminalOutputs : terminalOutputs);
  const byId = new Map<string, WorkflowDagStep>();
  const producerByToken = new Map<string, string>();
  const producersByToken = new Map<string, Set<string>>();
    for (const step of steps) {
    if (byId.has(step.id)) issues.push({ type: "duplicate-step", stepId: step.id, message: `Workflow step id 重复：${step.id}` });
    byId.set(step.id, step);
    if (!step.produces.length) issues.push({ type: "empty-production", stepId: step.id, message: `Workflow step ${step.id} 没有声明 produces[]` });
    const pause = pauseTerminalForStep(step);
    if (step.produces.includes("$output") && (pause || (step.role && !["deliver", "persist"].includes(step.role)))) {
      issues.push({ type: "invalid-terminal", stepId: step.id, message: `Workflow step ${step.id} 不是交付步骤，不能产生 $output` });
    }
    for (const token of step.delivers || []) {
      if (isTerminal(token)) issues.push({ type: "invalid-terminal", stepId: step.id, dependency: token, message: `Workflow step ${step.id} 把终态 ${token} 当作交付产物；delivers[] 必须列出真实业务内容或实际保存的文件令牌，不能只交付完成标记` });
      if (!step.produces.includes(token) && !step.requires.includes(token)) issues.push({ type: "unmet-dependency", stepId: step.id, dependency: token, message: `Workflow step ${step.id} 声明交付 ${token}，但没有产生或读取该产物` });
    }
    if (step.produces.some(isUserReplyToken) || (step.resumeProduces?.length && !pause) || step.resumeProduces?.some(isTerminal)) {
      issues.push({ type: "invalid-confirmation", stepId: step.id, message: `Workflow step ${step.id} 必须等待真实用户回复，不能直接产生确认状态` });
    }
    if (step.role === "persist" && !step.requires.some((token) => !["$request", "$source"].includes(token) && !isTerminal(token) && !token.startsWith("unbound:"))) {
      issues.push({ type: "unmet-dependency", stepId: step.id, message: `Workflow step ${step.id} 保存操作缺少待保存的业务产物依赖` });
    }
    for (const token of [...step.produces, ...(step.resumeProduces || [])]) {
      // A declared user input may arrive in the original request OR through an
      // explicit missing-input checkpoint. It is still supplied by the user,
      // not generated by the workflow. Keep it an external root so the normal
      // input-present branch does not depend on the optional waiting branch.
      const resumesDeclaredInput = step.role === "await-input" && token.startsWith("input:") && initialInputs.includes(token)
        && !step.produces.includes(token) && step.resumeProduces?.includes(token);
      if (resumesDeclaredInput) continue;
      if (initialInputs.includes(token) && !isUserReplyToken(token)) issues.push({ type: "duplicate-producer", stepId: step.id, dependency: token, message: `${token} 是运行时输入，不能由 ${step.id} 再次产生` });
      const producers = producersByToken.get(token) || new Set<string>();
      producers.add(step.id);
      producersByToken.set(token, producers);
      const existing = producerByToken.get(token);
      if (existing && existing !== step.id && !terminalOutputSet.has(token)) issues.push({ type: "duplicate-producer", stepId: step.id, dependency: token, message: `${token} 同时由 ${existing} 与 ${step.id} 产生` });
      else producerByToken.set(token, step.id);
    }
  }
  // Confirmation is event-owned even if an older caller still supplies it.
  const initial = new Set(initialInputs.filter((token) => !isUserReplyToken(token)));
  const indegree = new Map(steps.map((step) => [step.id, 0]));
  const outgoing = new Map(steps.map((step) => [step.id, new Set<string>()]));
  for (const step of steps) {
    for (const token of step.input.match(/\$[a-zA-Z_][a-zA-Z0-9_.:-]*/g) || []) {
      if (!step.requires.some((dependency) => dependency === token || token.startsWith(`${dependency}.`))) issues.push({ type: "unmet-dependency", stepId: step.id, dependency: token, message: `Workflow step ${step.id} 读取 ${token}，但 requires[] 未声明该输入` });
    }
    for (const target of step.mutates) {
      if (!step.requires.includes(target)) issues.push({ type: "unmet-dependency", stepId: step.id, dependency: target, message: `Workflow step ${step.id} 修改 ${target} 前必须在 requires[] 声明当前状态` });
    }
    for (const dependency of step.requires) {
      if (isTerminal(dependency)) {
        issues.push({ type: "invalid-terminal", stepId: step.id, dependency, message: `Workflow step ${step.id} 把终态 ${dependency} 当作业务数据；请依赖实际产物令牌` });
        continue;
      }
      if (initial.has(dependency)) continue;
      const producer = producerByToken.get(dependency);
      if (!producer) {
        issues.push({ type: "unmet-dependency", stepId: step.id, dependency, message: `Workflow step ${step.id} 依赖未满足：${dependency}` });
        continue;
      }
      if (producer === step.id) {
        issues.push({ type: "cycle", stepId: step.id, dependency, message: `Workflow step ${step.id} 不能依赖自己产生的 ${dependency}` });
        continue;
      }
      if (!outgoing.get(producer)?.has(step.id)) {
        outgoing.get(producer)?.add(step.id);
        indegree.set(step.id, (indegree.get(step.id) || 0) + 1);
      }
    }
  }
  const queue = steps.filter((step) => (indegree.get(step.id) || 0) === 0).map((step) => step.id).sort();
  const ordered: WorkflowDagStep[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    const step = byId.get(id);
    if (step) ordered.push(step);
    for (const target of outgoing.get(id) || []) {
      indegree.set(target, (indegree.get(target) || 0) - 1);
      if ((indegree.get(target) || 0) === 0) queue.push(target);
    }
    queue.sort();
  }
  if (ordered.length !== steps.length) {
    const cyclic = steps.filter((step) => !ordered.some((item) => item.id === step.id)).map((step) => step.id);
    cyclic.forEach((stepId) => issues.push({ type: "cycle", stepId, message: `Workflow DAG 存在循环依赖：${cyclic.join(" → ")}` }));
  }
  const precedes = (from: string, to: string, seen = new Set<string>()): boolean => {
    if (seen.has(from)) return false;
    seen.add(from);
    return [...(outgoing.get(from) || [])].some((next) => next === to || precedes(next, to, seen));
  };
  for (const writer of steps) for (const token of writer.mutates) {
    for (const other of steps) {
      if (other.id === writer.id || (!other.requires.includes(token) && !other.mutates.includes(token))) continue;
      if (!precedes(writer.id, other.id) && !precedes(other.id, writer.id)) issues.push({
        type: "unordered-mutation", stepId: writer.id, dependency: token,
        message: `${writer.id} 与 ${other.id} 对 ${token} 存在未排序的读写/写写冲突；请用产生的版本或完成令牌声明先后依赖`,
      });
    }
  }
  if (terminalOutputs.length) {
    const terminalProducers = new Set<string>();
    terminalOutputs.forEach((token) => {
      const producers = producersByToken.get(token) || new Set<string>();
      if (requiredTerminalOutputs.includes(token) && !producers.size) issues.push({ type: "missing-terminal", stepId: "<workflow>", dependency: token, message: `Workflow DAG 没有产生终态输出：${token}` });
      producers.forEach((producer) => terminalProducers.add(producer));
    });
    const consumed = new Set(steps.flatMap((step) => step.requires));
    steps.forEach((step) => step.produces.forEach((token) => {
      const delivered = step.delivers?.includes(token) && ((step.produces.includes("$output") && explicitDelivery(step)) || Boolean(pauseTerminalForStep(step)));
      if (!consumed.has(token) && !terminalOutputs.includes(token) && !delivered) {
        issues.push({ type: "unconsumed-production", stepId: step.id, dependency: token, message: `Workflow step ${step.id} 产生的 ${token} 没有被消费，也不是终态输出` });
      }
    }));
    const reachesTerminal = new Set(terminalProducers);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [producer, targets] of outgoing) {
        if (!reachesTerminal.has(producer) && [...targets].some((target) => reachesTerminal.has(target))) {
          reachesTerminal.add(producer);
          changed = true;
        }
      }
    }
    steps.filter((step) => !reachesTerminal.has(step.id)).forEach((step) => {
      issues.push({ type: "disconnected-step", stepId: step.id, message: `Workflow step ${step.id} 没有通向任何终态输出` });
    });
  }
  return { valid: issues.length === 0, ordered, issues };
}

export function assertWorkflowDag(steps: WorkflowDagStep[], initialInputs: string[] = [], options: WorkflowDagCompileOptions = {}) {
  const result = compileWorkflowDag(steps, initialInputs, options);
  if (!result.valid) throw new Error(`WORKFLOW_DAG_INVALID: ${result.issues.map((issue) => issue.message).join("；")}`);
  return result.ordered;
}
