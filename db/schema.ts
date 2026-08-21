import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const credentialVault = sqliteTable("skillcanvas_credential_vault", {
  tenantId: text("tenant_id").primaryKey(),
  encryptedPayload: text("encrypted_payload").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const diagnosticEvents = sqliteTable("skillcanvas_diagnostic_events", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  timestamp: text("timestamp").notNull(),
  level: text("level").notNull(),
  event: text("event").notNull(),
  requestId: text("request_id"),
  mode: text("mode"),
  phase: text("phase"),
  attempt: integer("attempt"),
  status: integer("status"),
  elapsedMs: integer("elapsed_ms"),
  inputChars: integer("input_chars"),
  outputChars: integer("output_chars"),
  estimatedTokens: integer("estimated_tokens"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  provider: text("provider"),
  model: text("model"),
  estimatedCostMicrousd: integer("estimated_cost_microusd"),
  reason: text("reason"),
}, (table) => [index("idx_skillcanvas_diagnostics_tenant_time").on(table.tenantId, table.timestamp)]);
