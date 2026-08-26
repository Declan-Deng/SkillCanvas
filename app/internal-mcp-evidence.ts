import type { CallToolResult, Tool } from "@modelcontextprotocol/client";
import type { RetrievedKnowledgeSource } from "./knowledge-research.ts";
import { discoverMcpTools, startMcpToolCall } from "./mcp-runtime.ts";
import { listMcpConnections } from "./server-data.ts";

export type InternalMcpEvidencePhase = "knowledge-compile" | "optimization-research";

export type InternalMcpEvidenceAttempt = {
  connectionId: string;
  connectionName: string;
  toolName: string;
  query: string;
  status: "completed" | "skipped" | "input_required" | "authorization_required" | "failed";
  runId?: string;
  reason?: string;
};

export type InternalMcpEvidenceReport = {
  phase: InternalMcpEvidencePhase;
  sources: RetrievedKnowledgeSource[];
  attempts: InternalMcpEvidenceAttempt[];
  connectionsScanned: number;
  toolsDiscovered: number;
};

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  default?: unknown;
  description?: string;
};

type EvidenceTool = {
  connectionId: string;
  connectionName: string;
  serverUrl: string;
  tool: Tool;
  score: number;
};

const READ_SIGNAL = /search|query|find|lookup|retrieve|read|list|fetch|browse|document|docs|knowledge|resource|repository|code|evidence|搜索|查询|检索|查找|读取|列出|文档|知识|资料|证据/i;
const WRITE_SIGNAL = /\b(?:create|update|delete|remove|write|send|post|publish|commit|merge|upload|move|rename|execute|run|approve|cancel|invite|message|email|schedule)\b|创建|更新|删除|写入|发送|发布|提交|上传|移动|重命名|执行|批准|取消|邀请|邮件|日程/i;
const QUERY_KEYS = /^(query|q|search|searchquery|text|term|keywords?|phrase|prompt|topic|question)$/i;
const LIMIT_KEYS = /^(limit|count|pagesize|topk|maxresults?)$/i;

function clean(value: unknown, max = 8_000) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function scoreInternalEvidenceTool(tool: Pick<Tool, "name" | "description">) {
  const name = clean(tool.name, 160);
  const description = clean(tool.description, 800);
  const combined = `${name} ${description}`;
  if (WRITE_SIGNAL.test(combined)) return -100;
  let score = READ_SIGNAL.test(name) ? 8 : 0;
  if (READ_SIGNAL.test(description)) score += 4;
  if (/search|query|retrieve|lookup|搜索|查询|检索/i.test(name)) score += 4;
  if (/official|primary source|documentation|evidence|citation|官方|一手|文档|证据|引用/i.test(description)) score += 2;
  return score;
}

function schemaOf(tool: Tool): JsonSchema {
  return record(tool.inputSchema) as JsonSchema;
}

export function buildInternalEvidenceArguments(tool: Tool, query: string): Record<string, unknown> | null {
  const schema = schemaOf(tool);
  const properties = schema.properties || {};
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const result: Record<string, unknown> = {};
  let queryAssigned = false;

  for (const [key, property] of Object.entries(properties)) {
    if (QUERY_KEYS.test(key) || (!queryAssigned && /query|search|term|topic|question|关键词|查询|搜索/i.test(`${key} ${property.description || ""}`))) {
      result[key] = query;
      queryAssigned = true;
      continue;
    }
    if (LIMIT_KEYS.test(key)) {
      result[key] = 5;
      continue;
    }
    if (property.default !== undefined) continue;
    if (required.has(key) && Array.isArray(property.enum) && property.enum.length) {
      result[key] = property.enum[0];
      continue;
    }
    if (required.has(key)) return null;
  }

  if (!queryAssigned) {
    if (Object.keys(properties).length === 0) return {};
    return null;
  }
  return result;
}

function firstHttpUrl(value: unknown, depth = 0): string {
  if (depth > 5) return "";
  if (typeof value === "string") {
    return value.match(/https?:\/\/[^\s<>"')\]]+/i)?.[0] || "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstHttpUrl(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (value && typeof value === "object") {
    const raw = value as Record<string, unknown>;
    for (const key of ["url", "uri", "sourceUrl", "source_url", "link", "href"]) {
      const candidate = clean(raw[key], 1_200);
      if (/^https?:\/\//i.test(candidate)) return candidate;
    }
    for (const child of Object.values(raw)) {
      const found = firstHttpUrl(child, depth + 1);
      if (found) return found;
    }
  }
  return "";
}

export function extractInternalEvidenceText(result: CallToolResult) {
  const chunks: string[] = [];
  for (const block of Array.isArray(result.content) ? result.content : []) {
    const raw = record(block);
    if (raw.type === "text") chunks.push(clean(raw.text, 12_000));
    else if (raw.type === "resource") chunks.push(clean(record(raw.resource).text, 12_000));
    else if (raw.type === "resource_link") chunks.push(clean(raw.description, 4_000));
  }
  if (result.structuredContent !== undefined) {
    try { chunks.push(JSON.stringify(result.structuredContent).slice(0, 12_000)); } catch { /* ignore cyclic provider payloads */ }
  }
  return chunks.filter(Boolean).join("\n").slice(0, 16_000);
}

function sourceFromResult(args: {
  query: string;
  connection: EvidenceTool;
  runId: string;
  result: CallToolResult;
  index: number;
}): RetrievedKnowledgeSource | null {
  const excerpt = extractInternalEvidenceText(args.result);
  if (excerpt.length < 40) return null;
  const returnedUrl = firstHttpUrl(args.result);
  const fallbackUrl = new URL(args.connection.serverUrl);
  fallbackUrl.searchParams.set("skillcanvas_tool", args.connection.tool.name);
  fallbackUrl.searchParams.set("skillcanvas_query", args.query.slice(0, 120));
  return {
    id: `mcp-${args.connection.connectionId}-${args.index + 1}`,
    query: args.query,
    title: `${args.connection.connectionName} · ${args.connection.tool.title || args.connection.tool.name}`,
    url: returnedUrl || fallbackUrl.toString(),
    excerpt,
    publishedAt: "",
    retrievedAt: new Date().toISOString(),
    authorityTier: "unknown",
    authorityReason: "通过用户授权的 MCP Server 返回；具体权威性仍由返回资源与发布者决定",
    origin: "mcp",
    mcpTrace: {
      connectionId: args.connection.connectionId,
      connectionName: args.connection.connectionName,
      toolName: args.connection.tool.name,
      runId: args.runId,
    },
  };
}

export async function collectInternalMcpEvidence(args: {
  tenantId: string;
  phase: InternalMcpEvidencePhase;
  queries: string[];
  maxCalls?: number;
}): Promise<InternalMcpEvidenceReport> {
  const queries = Array.from(new Set(args.queries.map((item) => clean(item, 240)).filter(Boolean))).slice(0, 4);
  const connections = await listMcpConnections(args.tenantId);
  const attempts: InternalMcpEvidenceAttempt[] = [];
  const discovered = await Promise.all(connections.map(async (connection) => {
    try {
      const result = await discoverMcpTools(args.tenantId, String(connection.id));
      return result.tools.map((tool) => ({
        connectionId: String(connection.id),
        connectionName: String(connection.name),
        serverUrl: String(connection.serverUrl),
        tool,
        score: scoreInternalEvidenceTool(tool),
      }));
    } catch (error) {
      attempts.push({
        connectionId: String(connection.id), connectionName: String(connection.name), toolName: "discover", query: "",
        status: "failed", reason: error instanceof Error ? error.message : "MCP discovery failed",
      });
      return [];
    }
  }));
  const tools = discovered.flat().filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  const sources: RetrievedKnowledgeSource[] = [];
  const maxCalls = Math.max(1, Math.min(args.maxCalls || 3, 4));

  for (const query of queries) {
    if (sources.length >= maxCalls) break;
    const candidate = tools.find((tool) => buildInternalEvidenceArguments(tool.tool, query) !== null);
    if (!candidate) {
      attempts.push({ connectionId: "", connectionName: "", toolName: "", query, status: "skipped", reason: "没有找到安全、只读且参数可自动构造的 MCP 检索 Tool" });
      continue;
    }
    const toolArgs = buildInternalEvidenceArguments(candidate.tool, query);
    if (!toolArgs) continue;
    const outcome = await startMcpToolCall({
      tenantId: args.tenantId,
      connectionId: candidate.connectionId,
      toolName: candidate.tool.name,
      arguments: toolArgs,
      maxTotalTimeout: 25_000,
    });
    attempts.push({
      connectionId: candidate.connectionId,
      connectionName: candidate.connectionName,
      toolName: candidate.tool.name,
      query,
      status: outcome.status,
      runId: outcome.runId,
      reason: outcome.error,
    });
    if (outcome.status !== "completed" || !outcome.result) continue;
    const source = sourceFromResult({ query, connection: candidate, runId: outcome.runId, result: outcome.result, index: sources.length });
    if (source) sources.push(source);
  }

  return {
    phase: args.phase,
    sources,
    attempts,
    connectionsScanned: connections.length,
    toolsDiscovered: discovered.flat().length,
  };
}
