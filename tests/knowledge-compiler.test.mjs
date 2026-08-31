import test from "node:test";
import assert from "node:assert/strict";
import { compileKnowledgeBatches, knowledgeAttemptTimeout, knowledgeClientTimeout, retainKnowledgeFailure } from "../app/knowledge-compiler.ts";
import { EMPTY_KNOWLEDGE_PACK, normalizeKnowledgePlan, normalizeRetrievedSources } from "../app/knowledge-research.ts";

test("knowledge deadlines cover both attempts without lengthening either attempt", () => {
  for (const provider of ["deepseek", "openai", "compatible"]) {
    assert.ok(knowledgeClientTimeout(provider) > knowledgeAttemptTimeout(provider, 1) + knowledgeAttemptTimeout(provider, 2));
  }
  assert.equal(knowledgeAttemptTimeout("deepseek", 1), 42000);
  assert.equal(knowledgeClientTimeout("deepseek"), 96000);
});

test("knowledge uses two bounded category batches without dropping evidence or contract", async () => {
  const payload = { answers: { permission: "preserve" }, researchSources: [{ excerpt: "x".repeat(42000) }] };
  const calls = [], completed = [];
  const result = await compileKnowledgeBatches({ payload,
    call: async (request) => { calls.push(request); return { atoms: [] }; },
    onBatch: async (batch) => completed.push(batch.categories),
  });
  assert.deepEqual(completed, [["decision_rules", "failure_modes"], ["edge_cases", "verification_methods"]]);
  assert.ok(calls.every((call) => call.researchSources === payload.researchSources && call.answers === payload.answers));
  assert.deepEqual(result.failures, []);
});

test("only a truncated batch splits; a completed category pair is never replayed", async () => {
  const checkpoint = { completed: {}, split: [] }, calls = [];
  let recover = false;
  const run = () => compileKnowledgeBatches({ payload: {}, checkpoint,
    call: async ({ knowledgeBatch: { categories } }) => {
      calls.push(categories.join("+"));
      if (categories.includes("edge_cases") && (categories.length > 1 || !recover)) throw Object.assign(new Error("length"), { code: "AI_OUTPUT_TRUNCATED" });
      return { atoms: [] };
    }, onBatch: async () => {},
  });
  const first = await run();
  assert.equal(first.failures.length, 1);
  assert.deepEqual(calls, ["decision_rules+failure_modes", "edge_cases+verification_methods", "edge_cases", "verification_methods"]);
  recover = true;
  await run();
  assert.deepEqual(calls.slice(4), ["edge_cases"]);
});

test("missing atoms isn't accepted as successful empty knowledge; unrelated errors don't cause replay", async () => {
  let calls = 0;
  const result = await compileKnowledgeBatches({ payload: {},
    call: async () => { calls++; if (calls === 1) return {}; throw new Error("quota exhausted"); }, onBatch: async () => assert.fail("not a completed batch"),
  });
  assert.equal(calls, 4);
  assert.equal(result.failures.length, 3);
});

test("compilation failure preserves retrieved sources and verified rules, not false sufficiency", () => {
  const plan = normalizeKnowledgePlan({ required: true, domain: "document extraction", knowledgeGaps: ["cite"], queries: ["citations"] });
  const sources = normalizeRetrievedSources([{ url: "https://example.com/reference", title: "Reference", excerpt: "Source text with document page attribution and verification rules." }]);
  const failed = retainKnowledgeFailure(plan, sources, "model timeout");
  assert.equal(failed.sources.length, 1);
  assert.equal(failed.atoms.length, 0);
  assert.equal(failed.sufficiency, "insufficient");
  assert.match(failed.summary, /已读取 1 个来源/);
  const retained = { ...EMPTY_KNOWLEDGE_PACK, plan, sources, atoms: [{ id: "already-verified" }] };
  const partial = retainKnowledgeFailure(plan, sources, "second batch failed", retained);
  assert.deepEqual(partial.atoms, retained.atoms);
  assert.equal(partial.status, "partial");
});
