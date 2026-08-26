type Statement = {
  bind(...values: unknown[]): Statement;
  run(): Promise<unknown>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
};

type Database = { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown> };
type RuntimeEnv = {
  DB?: Database;
  SKILLCANVAS_CREDENTIAL_SECRET?: string;
  SKILLCANVAS_MODEL_PRICING_JSON?: string;
};

export type ServerCredentialConfig = {
  provider: "deepseek" | "openai" | "compatible";
  model: string;
  baseUrl: string;
  apiKey: string;
  researchProvider: "disabled" | "firecrawl" | "searxng";
  researchApiKey: string;
  researchBaseUrl: string;
};

declare global {
  var __skillCanvasCredentialFallback: Map<string, string> | undefined;
  var __skillCanvasMcpConnectionFallback: Map<string, string> | undefined;
  var __skillCanvasWorkflowRunFallback: Map<string, StoredWorkflowRun> | undefined;
  var __skillCanvasWorkflowNodeFallback: Map<string, StoredWorkflowNode> | undefined;
  var __skillCanvasWorkflowCheckpointFallback: Map<string, WorkflowCheckpointRecord[]> | undefined;
  var __skillCanvasRuntimeTraceFallback: Map<string, RuntimeTraceRecord[]> | undefined;
  var __skillCanvasEphemeralVaultSecret: string | undefined;
  var __skillCanvasDatabaseReady: boolean | undefined;
  var __skillCanvasDatabaseSchemaVersion: number | undefined;
}

export type WorkflowRunStatus = "queued" | "running" | "input_required" | "approval_required" | "completed" | "failed" | "cancelled";
export type WorkflowNodeStatus = "pending" | "running" | "input_required" | "approval_required" | "completed" | "failed" | "skipped";

export type StoredWorkflowRun = {
  id: string;
  tenantId: string;
  kind: "build" | "optimization" | "mcp-call";
  status: WorkflowRunStatus;
  currentNodeId: string | null;
  input: unknown;
  output: unknown;
  error: unknown;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type StoredWorkflowNode = {
  runId: string;
  tenantId: string;
  nodeId: string;
  position: number;
  status: WorkflowNodeStatus;
  attempt: number;
  maxAttempts: number;
  input: unknown;
  output: unknown;
  error: unknown;
  updatedAt: string;
};

export type WorkflowCheckpointRecord = {
  id: string;
  runId: string;
  tenantId: string;
  nodeId: string | null;
  state: unknown;
  createdAt: string;
};

export type RuntimeTraceRecord = {
  id: string;
  runId: string;
  tenantId: string;
  kind: string;
  phase: string;
  status: string;
  detail: unknown;
  createdAt: string;
};

export type StoredMcpConnection = {
  id: string;
  tenantId: string;
  name: string;
  serverUrl: string;
  bearerToken: string;
  createdAt: string;
  updatedAt: string;
};

const SESSION_COOKIE = "skillcanvas_session";
const requestTenantCache = new WeakMap<Request, { tenantId: string; setCookie: string }>();

function runtime() {
  return boundEnvironment;
}

let boundEnvironment: RuntimeEnv = {};
try {
  const workerRuntime = await import("cloudflare:workers");
  boundEnvironment = workerRuntime.env as unknown as RuntimeEnv;
} catch {
  // Node-based bundle tests and non-Workers tooling use the encrypted
  // process-local fallback. Cloudflare/Vinext resolves this module normally.
}

function cookieValue(request: Request, key: string) {
  const raw = request.headers.get("cookie") || "";
  return raw.split(";").map((item) => item.trim().split("=")).find(([name]) => name === key)?.[1] || "";
}

export function tenantContext(request: Request) {
  const cached = requestTenantCache.get(request);
  if (cached) return cached;
  const platformUser = request.headers.get("oai-authenticated-user-id")?.trim();
  if (platformUser) {
    const value = { tenantId: `oai:${platformUser.slice(0, 180)}`, setCookie: "" };
    requestTenantCache.set(request, value);
    return value;
  }
  const existing = cookieValue(request, SESSION_COOKIE);
  if (/^[a-f0-9-]{20,80}$/i.test(existing)) {
    const value = { tenantId: `local:${existing}`, setCookie: "" };
    requestTenantCache.set(request, value);
    return value;
  }
  const session = crypto.randomUUID();
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const value = { tenantId: `local:${session}`, setCookie: `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${secure}` };
  requestTenantCache.set(request, value);
  return value;
}

async function ensureTables(db: Database) {
  const schemaVersion = 2;
  if ((globalThis.__skillCanvasDatabaseSchemaVersion || 0) >= schemaVersion) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS skillcanvas_credential_vault (tenant_id TEXT PRIMARY KEY, encrypted_payload TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS skillcanvas_diagnostic_events (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, timestamp TEXT NOT NULL, level TEXT NOT NULL, event TEXT NOT NULL, request_id TEXT, mode TEXT, phase TEXT, attempt INTEGER, status INTEGER, elapsed_ms INTEGER, input_chars INTEGER, output_chars INTEGER, estimated_tokens INTEGER, prompt_tokens INTEGER, completion_tokens INTEGER, provider TEXT, model TEXT, estimated_cost_microusd INTEGER, reason TEXT)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_skillcanvas_diagnostics_tenant_time ON skillcanvas_diagnostic_events(tenant_id, timestamp)"),
    db.prepare("CREATE TABLE IF NOT EXISTS skillcanvas_workflow_runs (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, current_node_id TEXT, input_json TEXT, output_json TEXT, error_json TEXT, version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_skillcanvas_workflow_runs_tenant_time ON skillcanvas_workflow_runs(tenant_id, updated_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS skillcanvas_workflow_nodes (run_id TEXT NOT NULL, tenant_id TEXT NOT NULL, node_id TEXT NOT NULL, position INTEGER NOT NULL, status TEXT NOT NULL, attempt INTEGER NOT NULL, max_attempts INTEGER NOT NULL, input_json TEXT, output_json TEXT, error_json TEXT, updated_at TEXT NOT NULL, PRIMARY KEY(run_id, node_id))"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_skillcanvas_workflow_nodes_run_position ON skillcanvas_workflow_nodes(tenant_id, run_id, position)"),
    db.prepare("CREATE TABLE IF NOT EXISTS skillcanvas_workflow_checkpoints (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, tenant_id TEXT NOT NULL, node_id TEXT, state_json TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_skillcanvas_workflow_checkpoints_run_time ON skillcanvas_workflow_checkpoints(tenant_id, run_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS skillcanvas_runtime_traces (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, tenant_id TEXT NOT NULL, kind TEXT NOT NULL, phase TEXT NOT NULL, status TEXT NOT NULL, detail_json TEXT, created_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_skillcanvas_runtime_traces_run_time ON skillcanvas_runtime_traces(tenant_id, run_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS skillcanvas_mcp_connections (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, server_url TEXT NOT NULL, encrypted_auth TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_skillcanvas_mcp_connections_tenant ON skillcanvas_mcp_connections(tenant_id, updated_at)"),
  ]);
  const columns = await db.prepare("PRAGMA table_info(skillcanvas_diagnostic_events)").all<{ name?: string }>();
  const present = new Set((columns.results || []).map((column) => column.name));
  const additions = [
    ["prompt_tokens", "INTEGER"],
    ["completion_tokens", "INTEGER"],
    ["provider", "TEXT"],
    ["model", "TEXT"],
    ["estimated_cost_microusd", "INTEGER"],
  ].filter(([name]) => !present.has(name));
  for (const [name, type] of additions) await db.prepare(`ALTER TABLE skillcanvas_diagnostic_events ADD COLUMN ${name} ${type}`).run();
  globalThis.__skillCanvasDatabaseReady = true;
  globalThis.__skillCanvasDatabaseSchemaVersion = schemaVersion;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const configured = runtime().SKILLCANVAS_CREDENTIAL_SECRET?.trim();
  const secret = configured || (globalThis.__skillCanvasEphemeralVaultSecret ||= crypto.randomUUID() + crypto.randomUUID());
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function seal(value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(JSON.stringify(value)));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

async function open<T = ServerCredentialConfig>(payload: string): Promise<T | null> {
  try {
    const [iv, encrypted] = payload.split(".");
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, await encryptionKey(), base64ToBytes(encrypted));
    return JSON.parse(new TextDecoder().decode(decrypted)) as T;
  } catch {
    return null;
  }
}

export async function saveServerCredentials(tenantId: string, value: ServerCredentialConfig) {
  const encrypted = await seal(value);
  const db = runtime().DB;
  if (!db) {
    (globalThis.__skillCanvasCredentialFallback ||= new Map()).set(tenantId, encrypted);
    return;
  }
  await ensureTables(db);
  await db.prepare("INSERT INTO skillcanvas_credential_vault (tenant_id, encrypted_payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(tenant_id) DO UPDATE SET encrypted_payload=excluded.encrypted_payload, updated_at=excluded.updated_at")
    .bind(tenantId, encrypted, new Date().toISOString()).run();
}

export async function readServerCredentials(tenantId: string) {
  const db = runtime().DB;
  if (!db) return open<ServerCredentialConfig>((globalThis.__skillCanvasCredentialFallback ||= new Map()).get(tenantId) || "");
  await ensureTables(db);
  const row = await db.prepare("SELECT encrypted_payload FROM skillcanvas_credential_vault WHERE tenant_id = ?").bind(tenantId).first<{ encrypted_payload?: string }>();
  return open<ServerCredentialConfig>(row?.encrypted_payload || "");
}

function mcpConnectionKey(tenantId: string, connectionId: string) {
  return `${tenantId}:${connectionId}`;
}

export async function saveMcpConnection(connection: StoredMcpConnection) {
  const encrypted = await seal(connection);
  const db = runtime().DB;
  if (!db) {
    (globalThis.__skillCanvasMcpConnectionFallback ||= new Map()).set(mcpConnectionKey(connection.tenantId, connection.id), encrypted);
    return;
  }
  await ensureTables(db);
  await db.prepare("INSERT INTO skillcanvas_mcp_connections (id, tenant_id, name, server_url, encrypted_auth, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, server_url=excluded.server_url, encrypted_auth=excluded.encrypted_auth, updated_at=excluded.updated_at WHERE skillcanvas_mcp_connections.tenant_id=excluded.tenant_id")
    .bind(connection.id, connection.tenantId, connection.name, connection.serverUrl, encrypted, connection.createdAt, connection.updatedAt).run();
}

export async function readMcpConnection(tenantId: string, connectionId: string): Promise<StoredMcpConnection | null> {
  const db = runtime().DB;
  if (!db) return open<StoredMcpConnection>((globalThis.__skillCanvasMcpConnectionFallback ||= new Map()).get(mcpConnectionKey(tenantId, connectionId)) || "");
  await ensureTables(db);
  const row = await db.prepare("SELECT id, tenant_id, name, server_url, encrypted_auth, created_at, updated_at FROM skillcanvas_mcp_connections WHERE tenant_id = ? AND id = ?")
    .bind(tenantId, connectionId).first<Record<string, unknown>>();
  if (!row) return null;
  const decrypted = await open<StoredMcpConnection>(String(row.encrypted_auth || ""));
  if (decrypted) return decrypted;
  // Anonymous connections remain usable if a local ephemeral vault key was
  // rotated between isolates. Secret-bearing connections deliberately do not:
  // production must configure SKILLCANVAS_CREDENTIAL_SECRET.
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    serverUrl: String(row.server_url),
    bearerToken: "",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listMcpConnections(tenantId: string) {
  const db = runtime().DB;
  if (!db) {
    const values = await Promise.all([...((globalThis.__skillCanvasMcpConnectionFallback ||= new Map()).entries())]
      .filter(([key]) => key.startsWith(`${tenantId}:`))
      .map(([, encrypted]) => open<StoredMcpConnection>(encrypted)));
    return values.filter(Boolean).map((connection) => ({ id: connection!.id, name: connection!.name, serverUrl: connection!.serverUrl, configured: Boolean(connection!.bearerToken), updatedAt: connection!.updatedAt }));
  }
  await ensureTables(db);
  const rows = await db.prepare("SELECT id, name, server_url as serverUrl, updated_at as updatedAt FROM skillcanvas_mcp_connections WHERE tenant_id = ? ORDER BY updated_at DESC")
    .bind(tenantId).all<Record<string, unknown>>();
  return (rows.results || []).map((row) => ({ ...row, configured: true }));
}

export async function deleteMcpConnection(tenantId: string, connectionId: string) {
  (globalThis.__skillCanvasMcpConnectionFallback ||= new Map()).delete(mcpConnectionKey(tenantId, connectionId));
  const db = runtime().DB;
  if (!db) return;
  await ensureTables(db);
  await db.prepare("DELETE FROM skillcanvas_mcp_connections WHERE tenant_id = ? AND id = ?").bind(tenantId, connectionId).run();
}

function json(value: unknown) {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

function parseJson(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function workflowKey(tenantId: string, runId: string) {
  return `${tenantId}:${runId}`;
}

function workflowNodeKey(tenantId: string, runId: string, nodeId: string) {
  return `${tenantId}:${runId}:${nodeId}`;
}

export async function saveWorkflowRun(run: StoredWorkflowRun) {
  const db = runtime().DB;
  if (!db) {
    (globalThis.__skillCanvasWorkflowRunFallback ||= new Map()).set(workflowKey(run.tenantId, run.id), structuredClone(run));
    return;
  }
  await ensureTables(db);
  await db.prepare("INSERT INTO skillcanvas_workflow_runs (id, tenant_id, kind, status, current_node_id, input_json, output_json, error_json, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, current_node_id=excluded.current_node_id, input_json=excluded.input_json, output_json=excluded.output_json, error_json=excluded.error_json, version=excluded.version, updated_at=excluded.updated_at WHERE skillcanvas_workflow_runs.tenant_id=excluded.tenant_id")
    .bind(run.id, run.tenantId, run.kind, run.status, run.currentNodeId, json(run.input), json(run.output), json(run.error), run.version, run.createdAt, run.updatedAt).run();
}

export async function readWorkflowRun(tenantId: string, runId: string): Promise<StoredWorkflowRun | null> {
  const db = runtime().DB;
  if (!db) return structuredClone((globalThis.__skillCanvasWorkflowRunFallback ||= new Map()).get(workflowKey(tenantId, runId)) || null);
  await ensureTables(db);
  const row = await db.prepare("SELECT id, tenant_id as tenantId, kind, status, current_node_id as currentNodeId, input_json as inputJson, output_json as outputJson, error_json as errorJson, version, created_at as createdAt, updated_at as updatedAt FROM skillcanvas_workflow_runs WHERE tenant_id = ? AND id = ?")
    .bind(tenantId, runId).first<Record<string, unknown>>();
  if (!row) return null;
  return { ...row, input: parseJson(row.inputJson), output: parseJson(row.outputJson), error: parseJson(row.errorJson) } as unknown as StoredWorkflowRun;
}

export async function saveWorkflowNode(node: StoredWorkflowNode) {
  const db = runtime().DB;
  if (!db) {
    (globalThis.__skillCanvasWorkflowNodeFallback ||= new Map()).set(workflowNodeKey(node.tenantId, node.runId, node.nodeId), structuredClone(node));
    return;
  }
  await ensureTables(db);
  await db.prepare("INSERT INTO skillcanvas_workflow_nodes (run_id, tenant_id, node_id, position, status, attempt, max_attempts, input_json, output_json, error_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(run_id, node_id) DO UPDATE SET position=excluded.position, status=excluded.status, attempt=excluded.attempt, max_attempts=excluded.max_attempts, input_json=excluded.input_json, output_json=excluded.output_json, error_json=excluded.error_json, updated_at=excluded.updated_at WHERE skillcanvas_workflow_nodes.tenant_id=excluded.tenant_id")
    .bind(node.runId, node.tenantId, node.nodeId, node.position, node.status, node.attempt, node.maxAttempts, json(node.input), json(node.output), json(node.error), node.updatedAt).run();
}

export async function readWorkflowNodes(tenantId: string, runId: string): Promise<StoredWorkflowNode[]> {
  const db = runtime().DB;
  if (!db) return [...(globalThis.__skillCanvasWorkflowNodeFallback ||= new Map()).values()].filter((node) => node.tenantId === tenantId && node.runId === runId).sort((a, b) => a.position - b.position).map((node) => structuredClone(node));
  await ensureTables(db);
  const rows = await db.prepare("SELECT run_id as runId, tenant_id as tenantId, node_id as nodeId, position, status, attempt, max_attempts as maxAttempts, input_json as inputJson, output_json as outputJson, error_json as errorJson, updated_at as updatedAt FROM skillcanvas_workflow_nodes WHERE tenant_id = ? AND run_id = ? ORDER BY position ASC")
    .bind(tenantId, runId).all<Record<string, unknown>>();
  return (rows.results || []).map((row) => ({ ...row, input: parseJson(row.inputJson), output: parseJson(row.outputJson), error: parseJson(row.errorJson) } as unknown as StoredWorkflowNode));
}

export async function appendWorkflowCheckpoint(checkpoint: WorkflowCheckpointRecord) {
  const db = runtime().DB;
  if (!db) {
    const key = workflowKey(checkpoint.tenantId, checkpoint.runId);
    const values = (globalThis.__skillCanvasWorkflowCheckpointFallback ||= new Map()).get(key) || [];
    values.push(structuredClone(checkpoint));
    globalThis.__skillCanvasWorkflowCheckpointFallback.set(key, values.slice(-100));
    return;
  }
  await ensureTables(db);
  await db.prepare("INSERT INTO skillcanvas_workflow_checkpoints (id, run_id, tenant_id, node_id, state_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(checkpoint.id, checkpoint.runId, checkpoint.tenantId, checkpoint.nodeId, json(checkpoint.state), checkpoint.createdAt).run();
}

export async function readWorkflowCheckpoints(tenantId: string, runId: string, limit = 50): Promise<WorkflowCheckpointRecord[]> {
  const db = runtime().DB;
  if (!db) return structuredClone(((globalThis.__skillCanvasWorkflowCheckpointFallback ||= new Map()).get(workflowKey(tenantId, runId)) || []).slice(-limit));
  await ensureTables(db);
  const rows = await db.prepare("SELECT id, run_id as runId, tenant_id as tenantId, node_id as nodeId, state_json as stateJson, created_at as createdAt FROM skillcanvas_workflow_checkpoints WHERE tenant_id = ? AND run_id = ? ORDER BY created_at DESC LIMIT ?")
    .bind(tenantId, runId, Math.max(1, Math.min(200, limit))).all<Record<string, unknown>>();
  return (rows.results || []).reverse().map((row) => ({ ...row, state: parseJson(row.stateJson) } as unknown as WorkflowCheckpointRecord));
}

export async function appendRuntimeTrace(trace: RuntimeTraceRecord) {
  const db = runtime().DB;
  if (!db) {
    const key = workflowKey(trace.tenantId, trace.runId);
    const values = (globalThis.__skillCanvasRuntimeTraceFallback ||= new Map()).get(key) || [];
    values.push(structuredClone(trace));
    globalThis.__skillCanvasRuntimeTraceFallback.set(key, values.slice(-300));
    return;
  }
  await ensureTables(db);
  await db.prepare("INSERT INTO skillcanvas_runtime_traces (id, run_id, tenant_id, kind, phase, status, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(trace.id, trace.runId, trace.tenantId, trace.kind, trace.phase, trace.status, json(trace.detail), trace.createdAt).run();
}

export async function readRuntimeTraces(tenantId: string, runId: string, limit = 100): Promise<RuntimeTraceRecord[]> {
  const db = runtime().DB;
  if (!db) return structuredClone(((globalThis.__skillCanvasRuntimeTraceFallback ||= new Map()).get(workflowKey(tenantId, runId)) || []).slice(-limit));
  await ensureTables(db);
  const rows = await db.prepare("SELECT id, run_id as runId, tenant_id as tenantId, kind, phase, status, detail_json as detailJson, created_at as createdAt FROM skillcanvas_runtime_traces WHERE tenant_id = ? AND run_id = ? ORDER BY created_at DESC LIMIT ?")
    .bind(tenantId, runId, Math.max(1, Math.min(300, limit))).all<Record<string, unknown>>();
  return (rows.results || []).reverse().map((row) => ({ ...row, detail: parseJson(row.detailJson) } as unknown as RuntimeTraceRecord));
}

export async function deleteServerCredentials(tenantId: string) {
  (globalThis.__skillCanvasCredentialFallback ||= new Map()).delete(tenantId);
  const db = runtime().DB;
  if (!db) return;
  await ensureTables(db);
  await db.prepare("DELETE FROM skillcanvas_credential_vault WHERE tenant_id = ?").bind(tenantId).run();
}

export async function persistDiagnostic(tenantId: string, entry: Record<string, unknown>) {
  const db = runtime().DB;
  if (!db) return;
  await ensureTables(db);
  const inputChars = Number(entry.inputChars) || 0;
  const outputChars = Number(entry.outputChars) || 0;
  const promptTokens = Number(entry.promptTokens) || Math.ceil(inputChars / 3.4);
  const completionTokens = Number(entry.completionTokens) || Math.ceil(outputChars / 3.4);
  const estimatedTokens = promptTokens + completionTokens;
  const provider = String(entry.provider || "").slice(0, 40);
  const model = String(entry.model || "").slice(0, 120);
  let estimatedCostMicrousd: number | null = null;
  try {
    const pricing = JSON.parse(runtime().SKILLCANVAS_MODEL_PRICING_JSON || "{}") as Record<string, { inputUsdPerMillion?: number; outputUsdPerMillion?: number }>;
    const rate = pricing[model] || pricing[`${provider}/${model}`];
    if (rate) estimatedCostMicrousd = Math.max(0, Math.round(promptTokens * Number(rate.inputUsdPerMillion || 0) + completionTokens * Number(rate.outputUsdPerMillion || 0)));
  } catch {
    estimatedCostMicrousd = null;
  }
  await db.prepare("INSERT INTO skillcanvas_diagnostic_events (id, tenant_id, timestamp, level, event, request_id, mode, phase, attempt, status, elapsed_ms, input_chars, output_chars, estimated_tokens, prompt_tokens, completion_tokens, provider, model, estimated_cost_microusd, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), tenantId, String(entry.timestamp || new Date().toISOString()), String(entry.level || "info"), String(entry.event || "unknown"), entry.requestId || null, entry.mode || null, entry.phase || null, entry.attempt || null, entry.status || null, entry.elapsedMs || null, inputChars || null, outputChars || null, estimatedTokens, promptTokens || null, completionTokens || null, provider || null, model || null, estimatedCostMicrousd, entry.reason || null).run();
  await db.prepare("DELETE FROM skillcanvas_diagnostic_events WHERE tenant_id = ? AND id NOT IN (SELECT id FROM skillcanvas_diagnostic_events WHERE tenant_id = ? ORDER BY timestamp DESC LIMIT 500)").bind(tenantId, tenantId).run();
}

export async function readPersistentDiagnostics(tenantId: string, limit = 80) {
  const db = runtime().DB;
  if (!db) return [];
  await ensureTables(db);
  const result = await db.prepare("SELECT timestamp, level, event, request_id as requestId, mode, phase, attempt, status, elapsed_ms as elapsedMs, input_chars as inputChars, output_chars as outputChars, estimated_tokens as estimatedTokens, prompt_tokens as promptTokens, completion_tokens as completionTokens, provider, model, estimated_cost_microusd as estimatedCostMicrousd, reason FROM skillcanvas_diagnostic_events WHERE tenant_id = ? ORDER BY timestamp DESC LIMIT ?")
    .bind(tenantId, Math.max(1, Math.min(200, limit))).all<Record<string, unknown>>();
  return (result.results || []).reverse();
}

export async function readUsageSummary(tenantId: string) {
  const db = runtime().DB;
  if (!db) return { requests: 0, promptTokens: 0, completionTokens: 0, estimatedCostUsd: null, pricedRequests: 0 };
  await ensureTables(db);
  const row = await db.prepare("SELECT COUNT(*) as requests, COALESCE(SUM(prompt_tokens), 0) as promptTokens, COALESCE(SUM(completion_tokens), 0) as completionTokens, COALESCE(SUM(estimated_cost_microusd), 0) as estimatedCostMicrousd, SUM(CASE WHEN estimated_cost_microusd IS NOT NULL THEN 1 ELSE 0 END) as pricedRequests FROM skillcanvas_diagnostic_events WHERE tenant_id = ? AND event = 'ai_request_succeeded'")
    .bind(tenantId).first<Record<string, unknown>>();
  const pricedRequests = Number(row?.pricedRequests) || 0;
  return {
    requests: Number(row?.requests) || 0,
    promptTokens: Number(row?.promptTokens) || 0,
    completionTokens: Number(row?.completionTokens) || 0,
    estimatedCostUsd: pricedRequests ? Math.round((Number(row?.estimatedCostMicrousd) || 0) / 10_000) / 100 : null,
    pricedRequests,
  };
}
