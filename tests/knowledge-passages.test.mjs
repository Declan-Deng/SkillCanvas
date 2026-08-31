import assert from "node:assert/strict";
import test from "node:test";
import { sourcePassages, selectKnowledgeQueries } from "../app/knowledge-passages.ts";
import { buildKnowledgeEvidencePayload, normalizeKnowledgePack, normalizeKnowledgePlan, normalizeRetrievedSources, applyKnowledgeVerification, knowledgeVerificationCandidates } from "../app/knowledge-research.ts";
import { dedupeResearchSources } from "../app/research-core.ts";

const url = "https://docs.example.com/import";
const quote = "For partial failures, retry only the failed records and compare their checksums; do not resend acknowledged records.";
const sources = normalizeRetrievedSources([{ url, query: "partial failures retry checksum", excerpt: quote }]);
const plan = normalizeKnowledgePlan({ required: true, knowledgeGaps: ["partial retry"], queries: ["retry"], capabilityDeltaGapIds: ["retry"] });
const atom = {
  id: "retry", title: "Partial retry", dimension: "partial retry", category: "decision_rules", type: "decision_rule", confidence: 0.9,
  gapIds: ["retry"], decision: "Which records to retry", knowledge: "Retry failed records, not acknowledged records.",
  appliesWhen: "A batch partially fails", action: "Compare checksums and retry only failed records.", exception: "来源未说明例外",
  sourceSupport: [{ url, passageId: sourcePassages(sources[0])[0].id }],
};

test("compiler restores exact quote from an offered source passage; the model cannot certify it", () => {
  const evidencePayload = buildKnowledgeEvidencePayload(sources);
  const pack = normalizeKnowledgePack({ raw: { atoms: [atom] }, plan, sources, evidencePayload });
  assert.equal(pack.atoms.length, 1);
  assert.deepEqual(pack.atoms[0].sourceSupport, [{ url, quote }]);
  assert.equal(pack.atoms[0].verification, undefined);
  const candidates = knowledgeVerificationCandidates(pack);
  const unsupported = applyKnowledgeVerification(pack, { verdicts: candidates.map((candidate) => ({ ...candidate, sourceSupported: false, reason: "The passage does not entail this rule" })) });
  assert.equal(unsupported.atoms.length, 0, "passage selection never bypasses semantic verification");
});

test("unknown, unoffered, wrong-URL and rewritten passage references are rejected", () => {
  const evidencePayload = buildKnowledgeEvidencePayload(sources);
  for (const support of [
    { url, passageId: "invented" },
    { url: "https://other.example.com", passageId: atom.sourceSupport[0].passageId },
    { ...atom.sourceSupport[0], quote: "The source promises zero failure in all cases." },
  ]) assert.equal(normalizeKnowledgePack({ raw: { atoms: [{ ...atom, sourceSupport: [support] }] }, plan, sources, evidencePayload }).atoms.length, 0);
  assert.equal(normalizeKnowledgePack({ raw: { atoms: [atom] }, plan, sources, evidencePayload: [] }).atoms.length, 0);
});

test("relevant late passages beat a long navigation prefix and remain verbatim", () => {
  const source = { ...sources[0], excerpt: `${"Navigation privacy contact subscription. ".repeat(190)} ${quote}` };
  const payload = buildKnowledgeEvidencePayload([source], 8000);
  assert.ok(payload[0].passages.some((passage) => passage.text.includes(quote)));
  assert.ok(payload[0].passages.every((passage) => source.excerpt.replace(/\s+/g, " ").includes(passage.text)));
  assert.ok(JSON.stringify(payload).length <= 8000);
  assert.deepEqual(sourcePassages(source), sourcePassages(source), "passage identity is deterministic");
});

test("follow-up evidence survives the source cap and is actually sent to compilation", () => {
  const old = Array.from({ length: 18 }, (_, i) => ({ ...sources[0], url: `https://docs.example.com/old-${i}`, query: "old query", excerpt: "Long unrelated navigation content. ".repeat(300) }));
  const fresh = { ...sources[0], url: "https://example.com/new", query: "partial retry", authorityTier: "reputable_secondary" };
  const combined = dedupeResearchSources([fresh, ...old], 18, [fresh.url, old[0].url]);
  assert.ok(combined.some((source) => source.url === fresh.url));
  assert.ok(combined.some((source) => source.url === old[0].url), "keep a previously cited source");
  assert.ok(buildKnowledgeEvidencePayload(combined, 10000, { preferredUrls: [fresh.url] }).some((source) => source.url === fresh.url));
});

test("preferred publishers guide half the queries without removing open discovery", () => {
  const queries = selectKnowledgeQueries(["decisions", "failures", "edge cases", "verification"], ["docs.vendor.com", "standards.org"]);
  assert.match(queries[0], /site:docs.vendor.com/);
  assert.equal(queries[1], "failures");
  assert.match(queries[2], /site:standards.org/);
  assert.equal(queries[3], "verification");
  assert.equal(selectKnowledgeQueries(["query"], ["bad.example OR arbitrary query"])[0], "query");
});

test("a concrete file-parsing failure is not rejected as a user presentation preference", () => {
  const source = normalizeRetrievedSources([{ url, excerpt: "当文件包含双栏格式时，文本提取可能交错；先将双栏转换为单栏再提取，比较阅读顺序是否与原文一致。" }]);
  const candidate = { ...atom, knowledge: "双栏文件格式可能使文本提取顺序交错。", appliesWhen: "双栏文件", action: "先转换为单栏再提取，比较阅读顺序与原文是否一致。", sourceSupport: [{ url, quote: source[0].excerpt }] };
  const pack = normalizeKnowledgePack({ raw: { atoms: [candidate] }, plan, sources: source });
  assert.equal(pack.atoms.length, 1, JSON.stringify(pack.rejected));
  assert.equal(pack.atoms[0].verification, undefined, "still requires independent semantic validation");
});

test("learning and support documentation are classified before calibrating confidence", () => {
  for (const sourceUrl of ["https://learn.vendor.example/en/actions-reference/import", "https://help.vendor.example/import"])
    assert.equal(normalizeRetrievedSources([{ url: sourceUrl, excerpt: quote }])[0].authorityTier, "primary");
});
