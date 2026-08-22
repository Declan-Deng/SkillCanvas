import { readAiDiagnostics, recordAiDiagnostic } from "../../ai-diagnostics";
import { persistDiagnostic, readPersistentDiagnostics, readUsageSummary, tenantContext } from "../../server-data";
import { checkRequestRate } from "../../request-guard";

const ALLOWED_EVENTS = new Set([
  "repair_gate_checked",
  "repair_gate_stalled",
  "repair_gate_finished",
  "personalization_feedback_checked",
  "generation_loop_started",
  "generation_loop_phase",
  "generation_loop_candidate",
  "generation_loop_finished",
  "generation_loop_failed",
  "ai_client_timeout",
  "ai_client_network_error",
]);

function cleanStrings(value: unknown, limit = 20) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .slice(0, limit)
    .map((item) => item.replace(/[\r\n]+/g, " ").slice(0, 300));
}

function cleanNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

export async function POST(request: Request) {
  const tenant = tenantContext(request);
  const rate = checkRequestRate(`${tenant.tenantId}:client-log`, 120);
  if (!rate.allowed) return Response.json({ error: "日志写入过于频繁" }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "日志内容不是有效 JSON" }, { status: 400 });
  }

  const event = typeof body.event === "string" ? body.event : "";
  if (!ALLOWED_EVENTS.has(event)) return Response.json({ error: "不支持的日志事件" }, { status: 400 });

  const entry = {
    event: `client_${event}`,
    round: cleanNumber(body.round),
    attempt: cleanNumber(body.attempt),
    feedbackCount: cleanNumber(body.feedbackCount),
    uncoveredCount: cleanNumber(body.uncoveredCount),
    beforeCount: cleanNumber(body.beforeCount),
    afterCount: cleanNumber(body.afterCount),
    accepted: body.accepted === true,
    resolved: cleanStrings(body.resolved),
    introduced: cleanStrings(body.introduced),
    blockers: cleanStrings(body.blockers),
    updatedPaths: cleanStrings(body.updatedPaths),
    reason: typeof body.reason === "string" ? body.reason.replace(/[\r\n]+/g, " ").slice(0, 300) : "",
  };
  const diagnosticMode = event.startsWith("ai_client")
    ? (typeof body.mode === "string" ? body.mode.replace(/[\r\n]+/g, " ").slice(0, 60) : "ai-client")
    : event.startsWith("generation_loop")
    ? "generation-loop"
    : event.startsWith("repair_gate")
      ? "repair-gate"
      : "personalization";
  const diagnosticReason = [
    entry.reason,
    entry.blockers.length ? `blockers: ${entry.blockers.join("；")}` : "",
  ].filter(Boolean).join(" | ").slice(0, 1_200);
  recordAiDiagnostic(event === "generation_loop_failed" || event.startsWith("ai_client") ? "error" : "info", {
    event: entry.event,
    mode: diagnosticMode,
    phase: typeof body.phase === "string" ? body.phase : undefined,
    attempt: entry.round,
    elapsedMs: cleanNumber(body.elapsedMs),
    reason: diagnosticReason || undefined,
  });
  await persistDiagnostic(tenant.tenantId, {
    timestamp: new Date().toISOString(),
    level: event === "generation_loop_failed" || event.startsWith("ai_client") ? "error" : "info",
    event: entry.event,
    mode: diagnosticMode,
    phase: typeof body.phase === "string" ? body.phase : undefined,
    attempt: entry.round,
    elapsedMs: cleanNumber(body.elapsedMs),
    reason: diagnosticReason || undefined,
  }).catch(() => undefined);
  console.info(JSON.stringify(entry));
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return new Response("Not found", { status: 404 });
  const limit = Number(url.searchParams.get("limit") || 80);
  const tenant = tenantContext(request);
  const persistent = await readPersistentDiagnostics(tenant.tenantId, limit).catch(() => []);
  const usage = await readUsageSummary(tenant.tenantId).catch(() => ({ requests: 0, promptTokens: 0, completionTokens: 0, estimatedCostUsd: null, pricedRequests: 0 }));
  return Response.json({ entries: persistent.length ? persistent : readAiDiagnostics(limit), persistence: persistent.length ? "d1" : "process-fallback", usage }, { headers: { "Cache-Control": "no-store" } });
}
