export type DurableWorkflowKind = "build" | "optimization";

type WorkflowNode = { nodeId: string; status: string };
type WorkflowSnapshot = {
  run: { id: string; status: string; currentNodeId: string | null };
  nodes: WorkflowNode[];
};

async function workflowRequest(body: Record<string, unknown>) {
  const response = await fetch("/api/workflows", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as WorkflowSnapshot & { error?: string };
  if (!response.ok) throw new Error(data.error || `Workflow request failed (${response.status})`);
  return data;
}

/**
 * A thin browser worker adapter for the server-owned durable state machine.
 * Workflow order, retries, interruptions and checkpoints remain server-side;
 * this object only reports the result of a UI node handler. A persistence
 * outage must not erase an otherwise valid generated Skill, so callers may
 * safely receive `null` and continue with their existing local recovery path.
 */
export class DurableWorkflowJournal {
  private snapshot: WorkflowSnapshot;

  private constructor(snapshot: WorkflowSnapshot) {
    this.snapshot = snapshot;
  }

  static async start(kind: DurableWorkflowKind, input: Record<string, unknown>) {
    try {
      return new DurableWorkflowJournal(await workflowRequest({ action: "start", kind, input }));
    } catch {
      return null;
    }
  }

  get runId() {
    return this.snapshot.run.id;
  }

  async complete(nodeId: string, output: unknown) {
    try {
      const existing = this.snapshot.nodes.find((node) => node.nodeId === nodeId);
      if (existing?.status === "completed") return true;
      this.snapshot = await workflowRequest({ action: "claim", runId: this.runId });
      if (this.snapshot.run.currentNodeId !== nodeId) return false;
      this.snapshot = await workflowRequest({ action: "complete", runId: this.runId, nodeId, output });
      return true;
    } catch {
      return false;
    }
  }

  async fail(error: unknown) {
    try {
      const currentNodeId = this.snapshot.run.currentNodeId;
      if (!currentNodeId) return false;
      const current = this.snapshot.nodes.find((node) => node.nodeId === currentNodeId);
      if (current?.status === "pending") this.snapshot = await workflowRequest({ action: "claim", runId: this.runId });
      this.snapshot = await workflowRequest({
        action: "fail",
        runId: this.runId,
        nodeId: currentNodeId,
        error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error || "Workflow node failed") },
      });
      return true;
    } catch {
      return false;
    }
  }
}
