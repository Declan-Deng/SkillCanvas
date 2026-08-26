import {
  deleteMcpConnection,
  listMcpConnections,
  readMcpConnection,
  saveMcpConnection,
  tenantContext,
} from "../../server-data";
import { assertMcpServerUrl, discoverMcpTools, resumeMcpToolCall, startMcpToolCall } from "../../mcp-runtime";
import { collectInternalMcpEvidence, type InternalMcpEvidencePhase } from "../../internal-mcp-evidence";
import { getWorkflowSnapshot } from "../../workflow-runtime";
import type { InputResponses } from "@modelcontextprotocol/client";

export const runtime = "edge";

function jsonResponse(request: Request, value: unknown, status = 200) {
  const { setCookie } = tenantContext(request);
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  if (setCookie) headers.set("set-cookie", setCookie);
  return new Response(JSON.stringify(value), { status, headers });
}

function errorResponse(request: Request, error: unknown, status = 400) {
  return jsonResponse(request, { error: error instanceof Error ? error.message : String(error || "MCP request failed") }, status);
}

function string(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function GET(request: Request) {
  try {
    const { tenantId } = tenantContext(request);
    const url = new URL(request.url);
    const runId = url.searchParams.get("runId");
    if (runId) return jsonResponse(request, await getWorkflowSnapshot(tenantId, runId));
    return jsonResponse(request, { connections: await listMcpConnections(tenantId) });
  } catch (error) {
    return errorResponse(request, error);
  }
}

export async function POST(request: Request) {
  try {
    const { tenantId } = tenantContext(request);
    const body = await request.json() as Record<string, unknown>;
    const action = string(body.action);

    if (action === "register") {
      const serverUrl = assertMcpServerUrl(string(body.serverUrl)).toString();
      const requestedId = string(body.connectionId);
      const existing = requestedId ? await readMcpConnection(tenantId, requestedId) : null;
      const timestamp = new Date().toISOString();
      const connection = {
        id: existing?.id || crypto.randomUUID(),
        tenantId,
        name: string(body.name).slice(0, 100) || existing?.name || new URL(serverUrl).hostname,
        serverUrl,
        bearerToken: string(body.bearerToken) || existing?.bearerToken || "",
        createdAt: existing?.createdAt || timestamp,
        updatedAt: timestamp,
      };
      await saveMcpConnection(connection);
      return jsonResponse(request, { connection: { id: connection.id, name: connection.name, serverUrl, configured: Boolean(connection.bearerToken), updatedAt: timestamp } }, 201);
    }

    if (action === "collect-evidence") {
      const phase = string(body.phase) as InternalMcpEvidencePhase;
      if (phase !== "knowledge-compile" && phase !== "optimization-research") throw new Error("Unsupported internal MCP evidence phase");
      const queries = Array.isArray(body.queries) ? body.queries.map(string).filter(Boolean).slice(0, 4) : [];
      if (!queries.length) throw new Error("At least one evidence query is required");
      const maxCalls = Number.isFinite(Number(body.maxCalls)) ? Number(body.maxCalls) : 3;
      return jsonResponse(request, await collectInternalMcpEvidence({ tenantId, phase, queries, maxCalls }));
    }

    const connectionId = string(body.connectionId);
    if (action === "discover") {
      if (!connectionId) throw new Error("connectionId is required");
      return jsonResponse(request, await discoverMcpTools(tenantId, connectionId));
    }
    if (action === "call") {
      if (!connectionId) throw new Error("connectionId is required");
      const toolName = string(body.toolName);
      if (!toolName) throw new Error("toolName is required");
      const outcome = await startMcpToolCall({ tenantId, connectionId, toolName, arguments: object(body.arguments) });
      return jsonResponse(request, outcome, outcome.status === "completed" ? 200 : outcome.status === "failed" ? 502 : 202);
    }
    if (action === "resume") {
      const runId = string(body.runId);
      if (!runId) throw new Error("runId is required");
      const inputResponses = object(body.inputResponses) as InputResponses;
      if (!Object.keys(inputResponses).length) throw new Error("inputResponses are required");
      const outcome = await resumeMcpToolCall({ tenantId, runId, inputResponses });
      return jsonResponse(request, outcome, outcome.status === "completed" ? 200 : outcome.status === "failed" ? 502 : 202);
    }
    throw new Error("Unsupported MCP action");
  } catch (error) {
    return errorResponse(request, error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { tenantId } = tenantContext(request);
    const connectionId = new URL(request.url).searchParams.get("connectionId") || "";
    if (!connectionId) throw new Error("connectionId is required");
    await deleteMcpConnection(tenantId, connectionId);
    return jsonResponse(request, { deleted: true });
  } catch (error) {
    return errorResponse(request, error);
  }
}
