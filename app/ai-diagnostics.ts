export type AiDiagnosticLevel = "info" | "warn" | "error";

export type AiDiagnosticEntry = {
  timestamp: string;
  level: AiDiagnosticLevel;
  event: string;
  requestId?: string;
  mode?: string;
  phase?: string;
  attempt?: number;
  status?: number;
  elapsedMs?: number;
  inputChars?: number;
  outputChars?: number;
  promptTokens?: number;
  completionTokens?: number;
  provider?: string;
  model?: string;
  reason?: string;
};

declare global {
  // A small process-local ring buffer for localhost diagnostics. It stores
  // metadata only: never prompts, bundle contents, API keys, or model output.
  var __skillCanvasAiDiagnostics: AiDiagnosticEntry[] | undefined;
}

function cleanText(value: unknown, limit = 240) {
  return typeof value === "string" ? value.replace(/[\r\n]+/g, " ").slice(0, limit) : undefined;
}

function cleanNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : undefined;
}

export function recordAiDiagnostic(level: AiDiagnosticLevel, input: Omit<AiDiagnosticEntry, "timestamp" | "level">) {
  const store = globalThis.__skillCanvasAiDiagnostics || (globalThis.__skillCanvasAiDiagnostics = []);
  store.push({
    timestamp: new Date().toISOString(),
    level,
    event: cleanText(input.event, 80) || "unknown",
    requestId: cleanText(input.requestId, 40),
    mode: cleanText(input.mode, 60),
    phase: cleanText(input.phase, 80),
    attempt: cleanNumber(input.attempt),
    status: cleanNumber(input.status),
    elapsedMs: cleanNumber(input.elapsedMs),
    inputChars: cleanNumber(input.inputChars),
    outputChars: cleanNumber(input.outputChars),
    promptTokens: cleanNumber(input.promptTokens),
    completionTokens: cleanNumber(input.completionTokens),
    provider: cleanText(input.provider, 40),
    model: cleanText(input.model, 120),
    reason: cleanText(input.reason),
  });
  if (store.length > 200) store.splice(0, store.length - 200);
}

export function readAiDiagnostics(limit = 80) {
  const safeLimit = Math.max(1, Math.min(200, Math.round(limit) || 80));
  return (globalThis.__skillCanvasAiDiagnostics || []).slice(-safeLimit);
}
