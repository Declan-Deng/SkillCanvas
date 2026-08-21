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
  var __skillCanvasEphemeralVaultSecret: string | undefined;
  var __skillCanvasDatabaseReady: boolean | undefined;
}

const SESSION_COOKIE = "skillcanvas_session";

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
  const platformUser = request.headers.get("oai-authenticated-user-id")?.trim();
  if (platformUser) return { tenantId: `oai:${platformUser.slice(0, 180)}`, setCookie: "" };
  const existing = cookieValue(request, SESSION_COOKIE);
  if (/^[a-f0-9-]{20,80}$/i.test(existing)) return { tenantId: `local:${existing}`, setCookie: "" };
  const session = crypto.randomUUID();
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return { tenantId: `local:${session}`, setCookie: `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${secure}` };
}

async function ensureTables(db: Database) {
  if (globalThis.__skillCanvasDatabaseReady) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS skillcanvas_credential_vault (tenant_id TEXT PRIMARY KEY, encrypted_payload TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS skillcanvas_diagnostic_events (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, timestamp TEXT NOT NULL, level TEXT NOT NULL, event TEXT NOT NULL, request_id TEXT, mode TEXT, phase TEXT, attempt INTEGER, status INTEGER, elapsed_ms INTEGER, input_chars INTEGER, output_chars INTEGER, estimated_tokens INTEGER, prompt_tokens INTEGER, completion_tokens INTEGER, provider TEXT, model TEXT, estimated_cost_microusd INTEGER, reason TEXT)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_skillcanvas_diagnostics_tenant_time ON skillcanvas_diagnostic_events(tenant_id, timestamp)"),
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

async function seal(value: ServerCredentialConfig) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(JSON.stringify(value)));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

async function open(payload: string): Promise<ServerCredentialConfig | null> {
  try {
    const [iv, encrypted] = payload.split(".");
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, await encryptionKey(), base64ToBytes(encrypted));
    return JSON.parse(new TextDecoder().decode(decrypted)) as ServerCredentialConfig;
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
  if (!db) return open((globalThis.__skillCanvasCredentialFallback ||= new Map()).get(tenantId) || "");
  await ensureTables(db);
  const row = await db.prepare("SELECT encrypted_payload FROM skillcanvas_credential_vault WHERE tenant_id = ?").bind(tenantId).first<{ encrypted_payload?: string }>();
  return open(row?.encrypted_payload || "");
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
