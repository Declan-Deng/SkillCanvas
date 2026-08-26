import { tenantContext } from "../../server-data";
import {
  claimWorkflowNode,
  completeWorkflowNode,
  createWorkflowRun,
  failWorkflowNode,
  getWorkflowSnapshot,
  interruptWorkflowNode,
  resumeWorkflowNode,
  standardWorkflowPlan,
  type WorkflowKind,
  type WorkflowNodePlan,
} from "../../workflow-runtime";

export const runtime = "edge";

function response(request: Request, value: unknown, status = 200) {
  const { setCookie } = tenantContext(request);
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  if (setCookie) headers.set("set-cookie", setCookie);
  return new Response(JSON.stringify(value), { status, headers });
}

function badRequest(request: Request, error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : String(error || "Workflow request failed");
  return response(request, { error: message }, status);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  try {
    const { tenantId } = tenantContext(request);
    const runId = new URL(request.url).searchParams.get("runId") || "";
    if (!runId) return badRequest(request, "runId is required");
    return response(request, await getWorkflowSnapshot(tenantId, runId));
  } catch (error) {
    return badRequest(request, error, error instanceof Error && error.message.includes("not found") ? 404 : 400);
  }
}

export async function POST(request: Request) {
  try {
    const { tenantId } = tenantContext(request);
    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action);
    const runId = text(body.runId);
    const nodeId = text(body.nodeId);

    if (action === "start") {
      const kind = text(body.kind) as WorkflowKind;
      if (!(["build", "optimization", "mcp-call"] as string[]).includes(kind)) throw new Error("Unsupported workflow kind");
      let nodes: WorkflowNodePlan[];
      if (kind === "mcp-call") {
        const supplied = Array.isArray(body.nodes) ? body.nodes : [];
        if (!supplied.length || supplied.length > 20) throw new Error("mcp-call workflows require 1-20 nodes");
        nodes = supplied.map((item) => {
          const value = item as Record<string, unknown>;
          return { id: text(value.id), input: value.input, maxAttempts: Math.min(5, Math.max(1, Number(value.maxAttempts) || 2)) };
        });
      } else {
        nodes = standardWorkflowPlan(kind, body.input);
      }
      return response(request, await createWorkflowRun({ tenantId, kind, input: body.input, nodes }), 201);
    }

    if (!runId) throw new Error("runId is required");
    if (action === "claim") return response(request, await claimWorkflowNode(tenantId, runId));
    if (!nodeId) throw new Error("nodeId is required");
    if (action === "complete") return response(request, await completeWorkflowNode(tenantId, runId, nodeId, body.output));
    if (action === "fail") return response(request, await failWorkflowNode(tenantId, runId, nodeId, body.error));
    if (action === "resume") return response(request, await resumeWorkflowNode(tenantId, runId, nodeId, body.input));
    if (action === "interrupt") {
      const kind = text(body.kind);
      if (kind !== "input_required" && kind !== "approval_required") throw new Error("Invalid interruption kind");
      return response(request, await interruptWorkflowNode(tenantId, runId, nodeId, kind, {
        reason: text(body.reason) || kind,
        request: body.request,
        resumeToken: text(body.resumeToken) || undefined,
      }));
    }
    throw new Error("Unsupported workflow action");
  } catch (error) {
    return badRequest(request, error);
  }
}

