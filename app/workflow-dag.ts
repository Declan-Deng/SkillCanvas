export type WorkflowDagStep = {
  id: string;
  capabilityIds: string[];
  when: string;
  input: string;
  action: string;
  output: string;
  fallback: string;
  requires: string[];
  produces: string[];
  mutates: string[];
};

export type WorkflowDagIssue = {
  type: "duplicate-step" | "duplicate-producer" | "unmet-dependency" | "cycle" | "empty-production";
  stepId: string;
  dependency?: string;
  message: string;
};

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
      capabilityIds: unique(raw.capabilityIds, 12),
      when: typeof raw.when === "string" ? raw.when.trim().slice(0, 320) : "每次执行到该步骤时",
      input: typeof raw.input === "string" ? raw.input.trim().slice(0, 420) : "",
      action,
      output: typeof raw.output === "string" ? raw.output.trim().slice(0, 420) : "",
      fallback: typeof raw.fallback === "string" ? raw.fallback.trim().slice(0, 420) : "停止依赖该结果的后续步骤并说明缺口",
      requires: unique(raw.requires),
      produces: unique(raw.produces),
      mutates: unique(raw.mutates),
    }];
  }).slice(0, 32);
}

/** Compile a real DAG. Dependencies may be satisfied only by declared initial
 * inputs or by another step's produces[]. Array order has no authority. */
export function compileWorkflowDag(steps: WorkflowDagStep[], initialInputs: string[] = []) {
  const issues: WorkflowDagIssue[] = [];
  const byId = new Map<string, WorkflowDagStep>();
  const producerByToken = new Map<string, string>();
  for (const step of steps) {
    if (byId.has(step.id)) issues.push({ type: "duplicate-step", stepId: step.id, message: `Workflow step id 重复：${step.id}` });
    byId.set(step.id, step);
    if (!step.produces.length) issues.push({ type: "empty-production", stepId: step.id, message: `Workflow step ${step.id} 没有声明 produces[]` });
    for (const token of step.produces) {
      const existing = producerByToken.get(token);
      if (existing && existing !== step.id) issues.push({ type: "duplicate-producer", stepId: step.id, dependency: token, message: `${token} 同时由 ${existing} 与 ${step.id} 产生` });
      else producerByToken.set(token, step.id);
    }
  }
  const initial = new Set(initialInputs);
  const indegree = new Map(steps.map((step) => [step.id, 0]));
  const outgoing = new Map(steps.map((step) => [step.id, new Set<string>()]));
  for (const step of steps) {
    for (const dependency of step.requires) {
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
  return { valid: issues.length === 0, ordered, issues };
}

export function assertWorkflowDag(steps: WorkflowDagStep[], initialInputs: string[] = []) {
  const result = compileWorkflowDag(steps, initialInputs);
  if (!result.valid) throw new Error(`WORKFLOW_DAG_INVALID: ${result.issues.map((issue) => issue.message).join("；")}`);
  return result.ordered;
}
