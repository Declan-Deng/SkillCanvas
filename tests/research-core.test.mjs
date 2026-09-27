import assert from "node:assert/strict";
import test from "node:test";

import {
  dedupeResearchSources,
  htmlToEvidenceText,
  parseDeepseekWebSearchResults,
  parseFirecrawlResults,
  parseSearxngResults,
  safeResearchUrl,
} from "../app/research-core.ts";

test("research URL gate blocks unsafe targets and only permits explicit local SearX development", () => {
  assert.equal(safeResearchUrl("http://localhost:8080/search"), null);
  assert.equal(safeResearchUrl("https://127.0.0.1/private"), null);
  assert.equal(safeResearchUrl("file:///etc/passwd"), null);
  assert.equal(safeResearchUrl("http://localhost:8080/search", { allowLoopback: true })?.hostname, "localhost");
  assert.equal(safeResearchUrl("https://docs.example.com/guide")?.hostname, "docs.example.com");
});

test("HTML evidence extraction removes executable and decorative markup", () => {
  const text = htmlToEvidenceText("<main><h1>Official rule</h1><script>steal()</script><p>Apply this decision only when evidence exists.</p></main>");
  assert.equal(text, "Official rule Apply this decision only when evidence exists.");
  assert.doesNotMatch(text, /steal/);
});

test("provider parsers return inspectable source evidence and deduplicate URLs", () => {
  const retrievedAt = "2026-08-14T00:00:00.000Z";
  const searx = parseSearxngResults({ results: [{ title: "Guide", url: "https://docs.example.com/guide", content: "A sufficiently detailed professional rule with decision conditions and exception handling." }] }, "domain rule", retrievedAt);
  const firecrawl = parseFirecrawlResults({ data: { web: [{ title: "Guide copy", url: "https://docs.example.com/guide", markdown: "Another sufficiently detailed copy of the same professional source for compilation." }] } }, "domain workflow", retrievedAt);
  const sources = dedupeResearchSources([...searx, ...firecrawl]);

  assert.equal(sources.length, 1);
  assert.equal(sources[0].id, "source-1");
  assert.equal(sources[0].retrievedAt, retrievedAt);
  assert.equal(sources[0].authorityTier, "primary");
});

test("DeepSeek parser accepts only server web-search result records, not model prose or echoed URLs", () => {
  const results = parseDeepseekWebSearchResults({
    requested_tool: { type: "web_search_20250305", url: "https://should-not-be-used.example/schema" },
    content: [
      { type: "text", text: "I remember https://hallucinated.example from training." },
      {
        type: "web_search_tool_result",
        content: [
          { type: "web_search_result", title: "Official API guide", url: "https://api-docs.deepseek.com/guides/web-search", page_age: "2026-09-01" },
          { type: "web_search_result", title: "Unsafe", url: "http://localhost:8787/private" },
        ],
      },
    ],
  }, "DeepSeek web search documentation");

  assert.deepEqual(results, [{
    query: "DeepSeek web search documentation",
    title: "Official API guide",
    url: "https://api-docs.deepseek.com/guides/web-search",
    publishedAt: "2026-09-01",
  }]);
});
