import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const workflowRuns = sqliteTable("skillcanvas_workflow_runs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  currentNodeId: text("current_node_id"),
  inputJson: text("input_json"),
  outputJson: text("output_json"),
  errorJson: text("error_json"),
  version: integer("version").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("idx_skillcanvas_workflow_runs_tenant_time").on(table.tenantId, table.updatedAt)]);

export const workflowNodes = sqliteTable("skillcanvas_workflow_nodes", {
  runId: text("run_id").notNull(),
  tenantId: text("tenant_id").notNull(),
  nodeId: text("node_id").notNull(),
  position: integer("position").notNull(),
  status: text("status").notNull(),
  attempt: integer("attempt").notNull(),
  maxAttempts: integer("max_attempts").notNull(),
  inputJson: text("input_json"),
  outputJson: text("output_json"),
  errorJson: text("error_json"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.runId, table.nodeId] }),
  index("idx_skillcanvas_workflow_nodes_run_position").on(table.tenantId, table.runId, table.position),
]);

export const workflowCheckpoints = sqliteTable("skillcanvas_workflow_checkpoints", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  tenantId: text("tenant_id").notNull(),
  nodeId: text("node_id"),
  stateJson: text("state_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_skillcanvas_workflow_checkpoints_run_time").on(table.tenantId, table.runId, table.createdAt)]);

export const runtimeTraces = sqliteTable("skillcanvas_runtime_traces", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  tenantId: text("tenant_id").notNull(),
  kind: text("kind").notNull(),
  phase: text("phase").notNull(),
  status: text("status").notNull(),
  detailJson: text("detail_json"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_skillcanvas_runtime_traces_run_time").on(table.tenantId, table.runId, table.createdAt)]);

export const mcpConnections = sqliteTable("skillcanvas_mcp_connections", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  serverUrl: text("server_url").notNull(),
  encryptedAuth: text("encrypted_auth").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("idx_skillcanvas_mcp_connections_tenant").on(table.tenantId, table.updatedAt)]);
