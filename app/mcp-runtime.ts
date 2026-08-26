import {
  Client,
  StreamableHTTPClientTransport,
  UnauthorizedError,
  isInputRequiredResult,
  type CallToolResult,
  type InputRequiredResult,
  type InputResponses,
  type Tool,
} from "@modelcontextprotocol/client";
import { readMcpConnection, type StoredMcpConnection } from "./server-data.ts";
import {
  claimWorkflowNode,
  completeWorkflowNode,
  createWorkflowRun,
  failWorkflowNode,
  getWorkflowSnapshot,
  interruptWorkflowNode,
  resumeWorkflowNode,
  type WorkflowSnapshot,
} from "./workflow-runtime.ts";

type McpCallParams = {
  name: string;
  arguments?: Record<string, unknown>;
  inputResponses?: InputResponses;
  requestState?: string;
};

type McpRunInput = {
  connectionId: string;
  toolName: string;
  arguments: Record<string, unknown>;
};

export type McpCallOutcome = {
  status: "completed" | "input_required" | "authorization_required" | "failed";
  runId: string;
  result?: CallToolResult;
  inputRequired?: InputRequiredResult;
  error?: string;
  workflow: WorkflowSnapshot;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "MCP request failed");
}

export function assertMcpServerUrl(value: string) {
  const url = new URL(value);
  if (url.username || url.password || url.hash) throw new Error("MCP URL cannot contain credentials or a fragment");
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) throw new Error("MCP Server must use HTTPS; HTTP is allowed only for loopback development");
  return url;
}

function newClient(connection: StoredMcpConnection) {
  const transport = new StreamableHTTPClientTransport(assertMcpServerUrl(connection.serverUrl), {
    authProvider: connection.bearerToken ? { token: async () => connection.bearerToken } : undefined,
  });
  const client = new Client({ name: "skillcanvas-runtime", version: "0.1.0" }, {
    capabilities: { elicitation: { form: {} } },
    versionNegotiation: { mode: "auto", probe: { timeoutMs: 8_000, maxRetries: 0 } },
    inputRequired: { autoFulfill: false, maxRounds: 8 },
  });
  return { client, transport };
}

async function connect(connection: StoredMcpConnection) {
  const session = newClient(connection);
  await session.client.connect(session.transport);
  return session;
}

async function close(session: Awaited<ReturnType<typeof connect>> | null) {
  if (!session) return;
  try { await session.client.close(); } catch { /* connection may already be closed */ }
}

function findTool(tools: Tool[], toolName: string) {
  const tool = tools.find((item) => item.name === toolName);
  if (!tool) throw new Error(`MCP Tool not found: ${toolName}`);
  return tool;
}

function verifyToolResult(result: CallToolResult) {
  if (result.isError) throw new Error("MCP Tool returned a tool-level error");
  const hasContent = Array.isArray(result.content) && result.content.length > 0;
  const hasStructured = result.structuredContent !== undefined;
  if (!hasContent && !hasStructured) throw new Error("MCP Tool returned no verifiable content");
  return {
    valid: true,
    contentBlocks: Array.isArray(result.content) ? result.content.length : 0,
    hasStructuredContent: hasStructured,
  };
}

async function connectionFor(tenantId: string, connectionId: string) {
  const connection = await readMcpConnection(tenantId, connectionId);
  if (!connection) throw new Error("MCP connection not found");
  return connection;
}

async function failCurrent(snapshot: WorkflowSnapshot, nodeId: string, error: unknown): Promise<McpCallOutcome> {
  const workflow = await failWorkflowNode(snapshot.run.tenantId, snapshot.run.id, nodeId, error);
  return { status: workflow.run.status === "failed" ? "failed" : "failed", runId: workflow.run.id, error: errorMessage(error), workflow };
}

async function advanceCompletedRun(args: {
  tenantId: string;
  runId: string;
  result: CallToolResult;
}) {
  let snapshot = await claimWorkflowNode(args.tenantId, args.runId);
  if (snapshot.run.currentNodeId !== "verify") throw new Error("MCP workflow lost its verify checkpoint");
  const verification = verifyToolResult(args.result);
  snapshot = await completeWorkflowNode(args.tenantId, args.runId, "verify", verification);
  snapshot = await claimWorkflowNode(args.tenantId, args.runId);
  if (snapshot.run.currentNodeId !== "trace") throw new Error("MCP workflow lost its trace checkpoint");
  snapshot = await completeWorkflowNode(args.tenantId, args.runId, "trace", {
    event: "mcp-call-completed",
    verification,
  });
  return snapshot;
}

export async function discoverMcpTools(tenantId: string, connectionId: string) {
  const connection = await connectionFor(tenantId, connectionId);
  let session: Awaited<ReturnType<typeof connect>> | null = null;
  try {
    session = await connect(connection);
    const listed = await session.client.listTools();
    return { tools: listed.tools, serverUrl: connection.serverUrl };
  } finally {
    await close(session);
  }
}

export async function startMcpToolCall(args: {
  tenantId: string;
  connectionId: string;
  toolName: string;
  arguments?: Record<string, unknown>;
  maxTotalTimeout?: number;
}): Promise<McpCallOutcome> {
  const input: McpRunInput = { connectionId: args.connectionId, toolName: args.toolName, arguments: args.arguments || {} };
  let workflow = await createWorkflowRun({
    tenantId: args.tenantId,
    kind: "mcp-call",
    input,
    nodes: [
      { id: "discover", maxAttempts: 2 },
      { id: "authorize", maxAttempts: 2 },
      { id: "call", maxAttempts: 3 },
      { id: "verify", maxAttempts: 2 },
      { id: "trace", maxAttempts: 1 },
    ],
  });
  const connection = await connectionFor(args.tenantId, args.connectionId);
  let session: Awaited<ReturnType<typeof connect>> | null = null;
  try {
    workflow = await claimWorkflowNode(args.tenantId, workflow.run.id);
    session = await connect(connection);
    const listed = await session.client.listTools();
    const tool = findTool(listed.tools, args.toolName);
    workflow = await completeWorkflowNode(args.tenantId, workflow.run.id, "discover", {
      serverUrl: connection.serverUrl,
      availableTools: listed.tools.map((item) => item.name),
      selectedTool: tool.name,
    });

    workflow = await claimWorkflowNode(args.tenantId, workflow.run.id);
    workflow = await completeWorkflowNode(args.tenantId, workflow.run.id, "authorize", {
      mode: connection.bearerToken ? "bearer" : "anonymous",
      authorized: true,
    });

    workflow = await claimWorkflowNode(args.tenantId, workflow.run.id);
    const result = await session.client.callTool({ name: args.toolName, arguments: args.arguments || {} }, {
      allowInputRequired: true,
      maxTotalTimeout: Math.max(5_000, Math.min(args.maxTotalTimeout || 90_000, 90_000)),
      toolDefinition: tool,
    }) as CallToolResult | InputRequiredResult;
    if (isInputRequiredResult(result)) {
      workflow = await interruptWorkflowNode(args.tenantId, workflow.run.id, "call", "input_required", {
        reason: "MCP Tool requires additional client input",
        request: { inputRequests: result.inputRequests || {}, requestState: result.requestState || null },
        resumeToken: result.requestState,
      });
      return { status: "input_required", runId: workflow.run.id, inputRequired: result, workflow };
    }
    workflow = await completeWorkflowNode(args.tenantId, workflow.run.id, "call", result);
    workflow = await advanceCompletedRun({ tenantId: args.tenantId, runId: workflow.run.id, result });
    return { status: "completed", runId: workflow.run.id, result, workflow };
  } catch (error) {
    const active = await getWorkflowSnapshot(args.tenantId, workflow.run.id);
    const activeNode = active.nodes.find((node) => node.status === "running");
    if (error instanceof UnauthorizedError) {
      if (activeNode) {
        workflow = await interruptWorkflowNode(args.tenantId, active.run.id, activeNode.nodeId, "approval_required", {
          reason: "MCP Server requires authorization",
          request: { connectionId: args.connectionId, serverUrl: connection.serverUrl },
        });
      }
      return { status: "authorization_required", runId: workflow.run.id, error: errorMessage(error), workflow };
    }
    if (activeNode) return failCurrent(active, activeNode.nodeId, error);
    return { status: "failed", runId: active.run.id, error: errorMessage(error), workflow: active };
  } finally {
    await close(session);
  }
}

export async function resumeMcpToolCall(args: {
  tenantId: string;
  runId: string;
  inputResponses: InputResponses;
}): Promise<McpCallOutcome> {
  let workflow = await getWorkflowSnapshot(args.tenantId, args.runId);
  const runInput = workflow.run.input as McpRunInput;
  if (!runInput?.connectionId || !runInput.toolName) throw new Error("MCP workflow is missing its canonical call input");
  const callNode = workflow.nodes.find((node) => node.nodeId === "call");
  if (!callNode || callNode.status !== "input_required") throw new Error("MCP call is not waiting for input");
  const interruption = callNode.output as { request?: { requestState?: string } } | null;
  const requestState = interruption?.request?.requestState;
  workflow = await resumeWorkflowNode(args.tenantId, args.runId, "call", { inputResponses: args.inputResponses, requestState });
  workflow = await claimWorkflowNode(args.tenantId, args.runId);

  const connection = await connectionFor(args.tenantId, runInput.connectionId);
  let session: Awaited<ReturnType<typeof connect>> | null = null;
  try {
    session = await connect(connection);
    const listed = await session.client.listTools();
    const tool = findTool(listed.tools, runInput.toolName);
    const params: McpCallParams = {
      name: runInput.toolName,
      arguments: runInput.arguments,
      inputResponses: args.inputResponses,
      requestState,
    };
    const result = await session.client.callTool(params, {
      allowInputRequired: true,
      maxTotalTimeout: 90_000,
      toolDefinition: tool,
    }) as CallToolResult | InputRequiredResult;
    if (isInputRequiredResult(result)) {
      workflow = await interruptWorkflowNode(args.tenantId, args.runId, "call", "input_required", {
        reason: "MCP Tool requires another round of client input",
        request: { inputRequests: result.inputRequests || {}, requestState: result.requestState || null },
        resumeToken: result.requestState,
      });
      return { status: "input_required", runId: args.runId, inputRequired: result, workflow };
    }
    workflow = await completeWorkflowNode(args.tenantId, args.runId, "call", result);
    workflow = await advanceCompletedRun({ tenantId: args.tenantId, runId: args.runId, result });
    return { status: "completed", runId: args.runId, result, workflow };
  } catch (error) {
    const active = await getWorkflowSnapshot(args.tenantId, args.runId);
    const activeNode = active.nodes.find((node) => node.status === "running");
    if (activeNode) return failCurrent(active, activeNode.nodeId, error);
    return { status: "failed", runId: args.runId, error: errorMessage(error), workflow: active };
  } finally {
    await close(session);
  }
}
