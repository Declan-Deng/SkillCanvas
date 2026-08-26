import {
  appendRuntimeTrace,
  appendWorkflowCheckpoint,
  readRuntimeTraces,
  readWorkflowCheckpoints,
  readWorkflowNodes,
  readWorkflowRun,
  saveWorkflowNode,
  saveWorkflowRun,
  type StoredWorkflowNode,
  type StoredWorkflowRun,
  type WorkflowNodeStatus,
} from "./server-data.ts";

export type WorkflowKind = StoredWorkflowRun["kind"];

export type WorkflowNodePlan = {
  id: string;
  input?: unknown;
  maxAttempts?: number;
};

export type WorkflowSnapshot = {
  run: StoredWorkflowRun;
  nodes: StoredWorkflowNode[];
  checkpoints: Awaited<ReturnType<typeof readWorkflowCheckpoints>>;
  traces: Awaited<ReturnType<typeof readRuntimeTraces>>;
};

export type WorkflowInterruption = {
  reason: string;
  request: unknown;
  resumeToken?: string;
};

const KNOWN_PLANS: Record<Exclude<WorkflowKind, "mcp-call">, string[]> = {
  build: ["intent", "representative-task", "contract", "capability-plan", "knowledge-compile", "bundle", "freeze"],
  optimization: ["held-out-split", "baseline", "execute", "grade", "diagnose", "mutate", "regression", "commit"],
};

function now() {
  return new Date().toISOString();
}

function serializeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { message: String(error || "Unknown workflow error") };
}

function validateNodeId(value: string) {
  if (!/^[a-z0-9][a-z0-9._-]{0,95}$/i.test(value)) throw new Error(`Invalid workflow node id: ${value}`);
}

async function trace(run: StoredWorkflowRun, phase: string, status: string, detail: unknown = null) {
  await appendRuntimeTrace({
    id: crypto.randomUUID(),
    runId: run.id,
    tenantId: run.tenantId,
    kind: run.kind,
    phase,
    status,
    detail,
    createdAt: now(),
  });
}

async function checkpoint(run: StoredWorkflowRun, nodeId: string | null, state: unknown) {
  await appendWorkflowCheckpoint({
    id: crypto.randomUUID(),
    runId: run.id,
    tenantId: run.tenantId,
    nodeId,
    state,
    createdAt: now(),
  });
}

function nextPending(nodes: StoredWorkflowNode[]) {
  return nodes.find((node) => node.status === "pending") || null;
}

export function standardWorkflowPlan(kind: Exclude<WorkflowKind, "mcp-call">, input?: unknown): WorkflowNodePlan[] {
  return KNOWN_PLANS[kind].map((id) => ({ id, input, maxAttempts: id === "execute" || id === "knowledge-compile" ? 3 : 2 }));
}

export async function createWorkflowRun(args: {
  tenantId: string;
  kind: WorkflowKind;
  input?: unknown;
  nodes: WorkflowNodePlan[];
  runId?: string;
}) {
  if (!args.nodes.length) throw new Error("A durable workflow requires at least one node");
  const ids = new Set<string>();
  args.nodes.forEach((node) => {
    validateNodeId(node.id);
    if (ids.has(node.id)) throw new Error(`Duplicate workflow node id: ${node.id}`);
    ids.add(node.id);
  });
  const timestamp = now();
  const run: StoredWorkflowRun = {
    id: args.runId || crypto.randomUUID(),
    tenantId: args.tenantId,
    kind: args.kind,
    status: "queued",
    currentNodeId: args.nodes[0].id,
    input: args.input ?? null,
    output: null,
    error: null,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await saveWorkflowRun(run);
  await Promise.all(args.nodes.map((definition, position) => saveWorkflowNode({
    runId: run.id,
    tenantId: run.tenantId,
    nodeId: definition.id,
    position,
    status: "pending",
    attempt: 0,
    maxAttempts: Math.max(1, Math.min(10, definition.maxAttempts || 2)),
    input: definition.input ?? null,
    output: null,
    error: null,
    updatedAt: timestamp,
  })));
  await checkpoint(run, null, { event: "run-created", input: run.input, nodeIds: args.nodes.map((node) => node.id) });
  await trace(run, "workflow", "created", { nodeCount: args.nodes.length });
  return getWorkflowSnapshot(args.tenantId, run.id);
}

export async function getWorkflowSnapshot(tenantId: string, runId: string): Promise<WorkflowSnapshot> {
  const run = await readWorkflowRun(tenantId, runId);
  if (!run) throw new Error("Workflow run not found");
  const [nodes, checkpoints, traces] = await Promise.all([
    readWorkflowNodes(tenantId, runId),
    readWorkflowCheckpoints(tenantId, runId),
    readRuntimeTraces(tenantId, runId),
  ]);
  return { run, nodes, checkpoints, traces };
}

export async function claimWorkflowNode(tenantId: string, runId: string) {
  const snapshot = await getWorkflowSnapshot(tenantId, runId);
  const { run, nodes } = snapshot;
  if (["completed", "failed", "cancelled"].includes(run.status)) return snapshot;
  if (run.status === "input_required" || run.status === "approval_required") throw new Error(`Workflow is paused: ${run.status}`);
  const node = nextPending(nodes);
  if (!node) return finishWorkflow(tenantId, runId);
  const updatedNode: StoredWorkflowNode = {
    ...node,
    status: "running",
    attempt: node.attempt + 1,
    error: null,
    updatedAt: now(),
  };
  const updatedRun: StoredWorkflowRun = {
    ...run,
    status: "running",
    currentNodeId: node.nodeId,
    version: run.version + 1,
    updatedAt: now(),
  };
  await saveWorkflowNode(updatedNode);
  await saveWorkflowRun(updatedRun);
  await checkpoint(updatedRun, node.nodeId, { event: "node-claimed", attempt: updatedNode.attempt, input: updatedNode.input });
  await trace(updatedRun, node.nodeId, "running", { attempt: updatedNode.attempt });
  return getWorkflowSnapshot(tenantId, runId);
}

export async function completeWorkflowNode(tenantId: string, runId: string, nodeId: string, output: unknown) {
  const snapshot = await getWorkflowSnapshot(tenantId, runId);
  const node = snapshot.nodes.find((item) => item.nodeId === nodeId);
  if (!node) throw new Error("Workflow node not found");
  if (node.status === "completed") return snapshot;
  if (node.status !== "running") throw new Error(`Cannot complete node in ${node.status} state`);
  const updatedNode: StoredWorkflowNode = { ...node, status: "completed", output: output ?? null, error: null, updatedAt: now() };
  await saveWorkflowNode(updatedNode);
  const nodes = snapshot.nodes.map((item) => item.nodeId === nodeId ? updatedNode : item);
  const next = nextPending(nodes);
  const updatedRun: StoredWorkflowRun = {
    ...snapshot.run,
    status: next ? "queued" : "completed",
    currentNodeId: next?.nodeId || null,
    output: next ? snapshot.run.output : output ?? snapshot.run.output,
    error: null,
    version: snapshot.run.version + 1,
    updatedAt: now(),
  };
  await saveWorkflowRun(updatedRun);
  await checkpoint(updatedRun, nodeId, { event: "node-completed", output, nextNodeId: next?.nodeId || null });
  await trace(updatedRun, nodeId, "completed", { nextNodeId: next?.nodeId || null });
  if (!next) await trace(updatedRun, "workflow", "completed");
  return getWorkflowSnapshot(tenantId, runId);
}

export async function interruptWorkflowNode(
  tenantId: string,
  runId: string,
  nodeId: string,
  kind: Extract<WorkflowNodeStatus, "input_required" | "approval_required">,
  interruption: WorkflowInterruption,
) {
  const snapshot = await getWorkflowSnapshot(tenantId, runId);
  const node = snapshot.nodes.find((item) => item.nodeId === nodeId);
  if (!node || node.status !== "running") throw new Error("Only a running workflow node can be interrupted");
  const updatedNode: StoredWorkflowNode = { ...node, status: kind, output: interruption, updatedAt: now() };
  const updatedRun: StoredWorkflowRun = {
    ...snapshot.run,
    status: kind,
    currentNodeId: nodeId,
    version: snapshot.run.version + 1,
    updatedAt: now(),
  };
  await saveWorkflowNode(updatedNode);
  await saveWorkflowRun(updatedRun);
  await checkpoint(updatedRun, nodeId, { event: kind, interruption });
  await trace(updatedRun, nodeId, kind, interruption);
  return getWorkflowSnapshot(tenantId, runId);
}

export async function resumeWorkflowNode(tenantId: string, runId: string, nodeId: string, resumeInput: unknown) {
  const snapshot = await getWorkflowSnapshot(tenantId, runId);
  const node = snapshot.nodes.find((item) => item.nodeId === nodeId);
  if (!node || !["input_required", "approval_required"].includes(node.status)) throw new Error("Workflow node is not awaiting input");
  const updatedNode: StoredWorkflowNode = {
    ...node,
    status: "pending",
    input: { priorInput: node.input, resumeInput, interruption: node.output },
    output: null,
    updatedAt: now(),
  };
  const updatedRun: StoredWorkflowRun = {
    ...snapshot.run,
    status: "queued",
    currentNodeId: nodeId,
    version: snapshot.run.version + 1,
    updatedAt: now(),
  };
  await saveWorkflowNode(updatedNode);
  await saveWorkflowRun(updatedRun);
  await checkpoint(updatedRun, nodeId, { event: "node-resumed", resumeInput });
  await trace(updatedRun, nodeId, "resumed");
  return getWorkflowSnapshot(tenantId, runId);
}

export async function failWorkflowNode(tenantId: string, runId: string, nodeId: string, error: unknown) {
  const snapshot = await getWorkflowSnapshot(tenantId, runId);
  const node = snapshot.nodes.find((item) => item.nodeId === nodeId);
  if (!node || node.status !== "running") throw new Error("Only a running workflow node can fail");
  const retryable = node.attempt < node.maxAttempts;
  const errorValue = serializeError(error);
  const updatedNode: StoredWorkflowNode = {
    ...node,
    status: retryable ? "pending" : "failed",
    error: errorValue,
    updatedAt: now(),
  };
  const updatedRun: StoredWorkflowRun = {
    ...snapshot.run,
    status: retryable ? "queued" : "failed",
    currentNodeId: nodeId,
    error: errorValue,
    version: snapshot.run.version + 1,
    updatedAt: now(),
  };
  await saveWorkflowNode(updatedNode);
  await saveWorkflowRun(updatedRun);
  await checkpoint(updatedRun, nodeId, { event: retryable ? "node-retry-scheduled" : "node-failed", attempt: node.attempt, error: errorValue });
  await trace(updatedRun, nodeId, retryable ? "retrying" : "failed", { attempt: node.attempt, error: errorValue });
  return getWorkflowSnapshot(tenantId, runId);
}

export async function finishWorkflow(tenantId: string, runId: string, output: unknown = null) {
  const snapshot = await getWorkflowSnapshot(tenantId, runId);
  if (snapshot.nodes.some((node) => !["completed", "skipped"].includes(node.status))) throw new Error("Workflow still contains unfinished nodes");
  const updatedRun: StoredWorkflowRun = {
    ...snapshot.run,
    status: "completed",
    currentNodeId: null,
    output,
    error: null,
    version: snapshot.run.version + 1,
    updatedAt: now(),
  };
  await saveWorkflowRun(updatedRun);
  await checkpoint(updatedRun, null, { event: "run-completed", output });
  await trace(updatedRun, "workflow", "completed");
  return getWorkflowSnapshot(tenantId, runId);
}
