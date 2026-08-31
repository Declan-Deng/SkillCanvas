import assert from "node:assert/strict";
import test from "node:test";

test("research distinguishes service failures from empty evidence and retains partial success", async (t) => {
  let status = 402;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const { query } = JSON.parse(options.body);
    if (status !== 200 && query !== "successful source") return new Response("private upstream body", { status });
    return Response.json({ data: { web: query === "empty" ? [] : [{ title: "Evidence", url: "https://example.org/evidence", markdown: "A verified rule with its applicable condition and concrete action. ".repeat(12) }] } });
  });
  const { default: worker } = await import("../dist/server/index.js");
  async function research(queries) {
    const response = await worker.fetch(new Request("http://localhost/api/research", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "firecrawl", baseUrl: "https://research.test", apiKey: "test-only-not-a-real-credential", queries }),
    }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
    return { status: response.status, body: await response.json() };
  }
  const quota = await research(["one", "two"]);
  assert.equal(quota.status, 502);
  assert.match(quota.body.error, /2\/2.*402.*额度不足/);
  assert.doesNotMatch(quota.body.error, /private upstream|test-only/);
  status = 401;
  assert.match((await research(["one"])).body.error, /401.*授权/);
  const partial = await research(["one", "successful source"]);
  assert.equal(partial.status, 200);
  assert.equal(partial.body.sources.length, 1);
  status = 200;
  assert.match((await research(["empty"])).body.error, /没有返回.*正文证据/);
});

test("research connection test exercises the actual retrieval path with one result and no private material", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls++;
    assert.equal(String(url), "https://research-probe.test/v2/search");
    const request = JSON.parse(options.body);
    assert.equal(request.limit, 1);
    assert.equal(request.query, "Firecrawl search documentation");
    assert.deepEqual(request.scrapeOptions.formats, ["markdown"]);
    return Response.json({ data: { web: [{ title: "Documentation", url: "https://example.org/docs", markdown: "Search documentation provides searchable, attributable source excerpts. ".repeat(10) }] } });
  });
  const { default: worker } = await import("../dist/server/index.js");
  const response = await worker.fetch(new Request("http://localhost/api/research", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "test", provider: "firecrawl", baseUrl: "https://research-probe.test", apiKey: "test-only-not-real", queries: ["private user material"] }),
  }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, sourceCount: 1 });
  assert.equal(calls, 1);
});
