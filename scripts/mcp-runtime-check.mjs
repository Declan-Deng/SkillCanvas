import assert from "node:assert/strict";

const baseUrl = (process.env.SKILLCANVAS_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const jsonHeaders = { "content-type": "application/json" };
let sessionCookie = "";

async function request(path, init = {}) {
  const headers = new Headers(init.headers || {});
  if (sessionCookie) headers.set("cookie", sessionCookie);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) sessionCookie = setCookie.split(";", 1)[0];
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method || "GET"} ${path} failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
}

const registered = await request("/api/mcp", {
  method: "POST",
  headers: jsonHeaders,
  body: JSON.stringify({ action: "register", name: "SkillCanvas conformance", serverUrl: `${baseUrl}/api/mcp/conformance` }),
});
assert.ok(registered.connection?.id, "connection id should be returned");

const connectionId = registered.connection.id;
try {
  const discovery = await request("/api/mcp", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ action: "discover", connectionId }),
  });
  assert.ok(discovery.tools.some((tool) => tool.name === "confirm-and-echo"), "conformance tool should be discoverable");
  assert.ok(discovery.tools.some((tool) => tool.name === "search-evidence"), "read-only evidence tool should be discoverable");

  const evidence = await request("/api/mcp", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      action: "collect-evidence",
      phase: "knowledge-compile",
      queries: ["HTTP conditional request decision rules"],
      maxCalls: 1,
    }),
  });
  assert.equal(evidence.phase, "knowledge-compile");
  assert.equal(evidence.sources?.length, 1, "internal Evidence Router should return one attributable source");
  assert.equal(evidence.sources?.[0]?.origin, "mcp");
  assert.equal(evidence.sources?.[0]?.mcpTrace?.toolName, "search-evidence");
  assert.ok(evidence.sources?.[0]?.mcpTrace?.runId, "MCP evidence should retain its durable workflow trace");

  const started = await request("/api/mcp", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ action: "call", connectionId, toolName: "confirm-and-echo", arguments: { message: "SkillCanvas MRTR works" } }),
  });
  assert.equal(started.status, "input_required");
  assert.ok(started.runId);
  assert.equal(started.inputRequired?.requestState, "skillcanvas-conformance-round-1");

  const resumed = await request("/api/mcp", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      action: "resume",
      runId: started.runId,
      inputResponses: { confirmation: { action: "accept", content: { approved: true } } },
    }),
  });
  assert.equal(resumed.status, "completed");
  assert.deepEqual(resumed.result?.structuredContent, { echoed: "SkillCanvas MRTR works", approved: true });
  assert.equal(resumed.workflow?.run?.status, "completed");
  assert.ok(resumed.workflow?.checkpoints?.length >= 10, "durable checkpoints should capture the round trip");
  assert.ok(resumed.workflow?.traces?.some((trace) => trace.status === "input_required"));
  assert.ok(resumed.workflow?.traces?.some((trace) => trace.status === "resumed"));
  console.log(JSON.stringify({
    ok: true,
    runId: started.runId,
    checkpoints: resumed.workflow.checkpoints.length,
    traces: resumed.workflow.traces.length,
  }, null, 2));
} finally {
  await request(`/api/mcp?connectionId=${encodeURIComponent(connectionId)}`, { method: "DELETE" }).catch(() => null);
}
