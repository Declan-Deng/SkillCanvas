import { normalizeWorkflowDagSteps, WORKFLOW_TERMINALS, type WorkflowDagStep } from "./workflow-dag";

export type WorkflowStepDraft = Pick<WorkflowDagStep, "when" | "action" | "output" | "fallback">;

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));
const businessTokens = (step: WorkflowDagStep) => step.produces.filter((token) => !Object.values(WORKFLOW_TERMINALS).includes(token as never));

function nextStepId(steps: WorkflowDagStep[]) {
  const used = new Set(steps.map((step) => step.id));
  let index = 1;
  while (used.has(`custom-step-${index}`)) index += 1;
  return `custom-step-${index}`;
}

export function workflowStepDraft(step: WorkflowDagStep): WorkflowStepDraft {
  return { when: step.when, action: step.action, output: step.output, fallback: step.fallback };
}

export function updateWorkflowStep(steps: WorkflowDagStep[], stepId: string, draft: WorkflowStepDraft) {
  if (!draft.action.trim()) throw new Error("步骤内容不能为空");
  return normalizeWorkflowDagSteps(steps.map((step) => step.id !== stepId ? step : {
    ...step,
    when: draft.when.trim() || "执行到该步骤时",
    action: draft.action.trim(),
    output: draft.output.trim() || "产生可供下一步使用的结果",
    fallback: draft.fallback.trim() || "停止依赖该结果的后续步骤并说明缺口",
  }));
}

/** Insert a serial operation at a visual boundary while preserving the DAG's
 * existing roots and terminal. The new operation owns one explicit bridge
 * token, so downstream projections cannot silently skip it. */
export function insertWorkflowStep(steps: WorkflowDagStep[], atIndex: number) {
  const current = normalizeWorkflowDagSteps(steps);
  const index = Math.max(0, Math.min(atIndex, current.length));
  const previous = current[index - 1];
  const next = current[index];
  const id = nextStepId(current);
  const token = `workflow:${id}:result`;
  const previousTokens = previous ? businessTokens(previous) : [];
  const bridgeDependencies = previous && next
    ? next.requires.filter((dependency) => previousTokens.includes(dependency))
    : previous ? previousTokens : next?.requires || ["$request"];
  const requires = unique(bridgeDependencies.length ? bridgeDependencies : previousTokens.length ? previousTokens : next?.requires || ["$request"]);
  const appendAsDelivery = !next;

  const inserted: WorkflowDagStep = {
    id,
    capabilityIds: [...(previous?.capabilityIds || next?.capabilityIds || [])],
    ...((previous?.availableCapabilityIds || next?.availableCapabilityIds)?.length
      ? { availableCapabilityIds: [...(previous?.availableCapabilityIds || next?.availableCapabilityIds || [])] }
      : {}),
    role: appendAsDelivery ? "deliver" : "transform",
    when: "执行到该步骤时",
    input: requires.join("、"),
    action: "定义并执行新的工作步骤",
    output: "产生可供下一步使用的结果",
    fallback: "无法完成时说明缺口，并停止依赖该结果的后续步骤",
    requires,
    produces: appendAsDelivery ? [token, WORKFLOW_TERMINALS.completed] : [token],
    mutates: [],
    delivers: appendAsDelivery ? unique(previousTokens.length ? previousTokens : [token]) : [],
    resumeProduces: [],
  };

  const rewired = current.map((step, stepIndex) => {
    if (stepIndex === index - 1 && appendAsDelivery) {
      return {
        ...step,
        role: step.role === "deliver" ? "transform" as const : step.role,
        produces: step.produces.filter((value) => value !== WORKFLOW_TERMINALS.completed),
        delivers: [],
      };
    }
    if (stepIndex !== index) return step;
    const bridged = new Set(bridgeDependencies);
    return {
      ...step,
      requires: unique([...step.requires.filter((dependency) => !bridged.has(dependency)), token]),
      input: step.input,
    };
  });
  rewired.splice(index, 0, inserted);
  return { steps: normalizeWorkflowDagSteps(rewired), stepId: id };
}

export function removeWorkflowStep(steps: WorkflowDagStep[], stepId: string) {
  const current = normalizeWorkflowDagSteps(steps);
  if (current.length <= 1) throw new Error("工作流至少需要保留一个步骤");
  const index = current.findIndex((step) => step.id === stepId);
  if (index < 0) return current;
  const removed = current[index];
  const removedTokens = new Set(removed.produces);
  const replacementDependencies = removed.requires.filter((token) => !Object.values(WORKFLOW_TERMINALS).includes(token as never));
  const wasTerminal = removed.produces.includes(WORKFLOW_TERMINALS.completed) || removed.role === "deliver";

  const next = current.filter((step) => step.id !== stepId).map((step) => {
    if (!step.requires.some((dependency) => removedTokens.has(dependency))) return step;
    return {
      ...step,
      requires: unique(step.requires.flatMap((dependency) => removedTokens.has(dependency) ? replacementDependencies : [dependency])),
    };
  });

  if (wasTerminal) {
    const promoteIndex = Math.max(0, index - 1);
    const promoted = next[promoteIndex];
    if (promoted) {
      const deliverables = businessTokens(promoted);
      next[promoteIndex] = {
        ...promoted,
        role: "deliver",
        produces: unique([...promoted.produces, WORKFLOW_TERMINALS.completed]),
        delivers: unique(deliverables.length ? deliverables : promoted.requires),
      };
    }
  }
  return normalizeWorkflowDagSteps(next);
}
