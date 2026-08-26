import assert from "node:assert/strict";
import test from "node:test";

import {
  claimWorkflowNode,
  completeWorkflowNode,
  createWorkflowRun,
  failWorkflowNode,
  getWorkflowSnapshot,
  interruptWorkflowNode,
  resumeWorkflowNode,
} from "../app/workflow-runtime.ts";

test("durable workflow checkpoints every node and resumes an input_required interruption", async () => {
  const tenantId = `test:${crypto.randomUUID()}`;
  let snapshot = await createWorkflowRun({
    tenantId,
    kind: "mcp-call",
    input: { message: "hello" },
    nodes: [{ id: "discover" }, { id: "call", maxAttempts: 3 }, { id: "verify" }],
  });
  snapshot = await claimWorkflowNode(tenantId, snapshot.run.id);
  assert.equal(snapshot.run.currentNodeId, "discover");
  snapshot = await completeWorkflowNode(tenantId, snapshot.run.id, "discover", { tools: ["echo"] });
  snapshot = await claimWorkflowNode(tenantId, snapshot.run.id);
  snapshot = await interruptWorkflowNode(tenantId, snapshot.run.id, "call", "input_required", {
    reason: "confirmation required",
    request: { inputRequests: { confirm: { method: "elicitation/create" } }, requestState: "opaque-byte-exact-state" },
    resumeToken: "opaque-byte-exact-state",
  });
  assert.equal(snapshot.run.status, "input_required");
  assert.equal(snapshot.nodes.find((node) => node.nodeId === "call")?.status, "input_required");

  snapshot = await resumeWorkflowNode(tenantId, snapshot.run.id, "call", { confirm: { action: "accept", content: { approved: true } } });
  snapshot = await claimWorkflowNode(tenantId, snapshot.run.id);
  assert.equal(snapshot.nodes.find((node) => node.nodeId === "call")?.attempt, 2);
  snapshot = await completeWorkflowNode(tenantId, snapshot.run.id, "call", { content: [{ type: "text", text: "hello" }] });
  snapshot = await claimWorkflowNode(tenantId, snapshot.run.id);
  snapshot = await completeWorkflowNode(tenantId, snapshot.run.id, "verify", { valid: true });

  assert.equal(snapshot.run.status, "completed");
  assert.ok(snapshot.checkpoints.some((entry) => entry.state?.event === "input_required"));
  assert.ok(snapshot.checkpoints.some((entry) => entry.state?.event === "node-resumed"));
  assert.ok(snapshot.traces.some((entry) => entry.status === "resumed"));
});

test("node retries from its checkpoint and becomes failed only after its retry budget is exhausted", async () => {
  const tenantId = `test:${crypto.randomUUID()}`;
  let snapshot = await createWorkflowRun({ tenantId, kind: "mcp-call", nodes: [{ id: "call", maxAttempts: 2 }] });
  snapshot = await claimWorkflowNode(tenantId, snapshot.run.id);
  snapshot = await failWorkflowNode(tenantId, snapshot.run.id, "call", new Error("temporary network error"));
  assert.equal(snapshot.run.status, "queued");
  assert.equal(snapshot.nodes[0].attempt, 1);

  snapshot = await claimWorkflowNode(tenantId, snapshot.run.id);
  snapshot = await failWorkflowNode(tenantId, snapshot.run.id, "call", new Error("temporary network error"));
  assert.equal(snapshot.run.status, "failed");
  assert.equal(snapshot.nodes[0].attempt, 2);

  const restored = await getWorkflowSnapshot(tenantId, snapshot.run.id);
  assert.equal(restored.run.status, "failed");
  assert.ok(restored.traces.some((entry) => entry.status === "retrying"));
  assert.ok(restored.traces.some((entry) => entry.status === "failed"));
});

