import assert from "node:assert/strict";
import test from "node:test";
import { applyKnowledgeVerification, knowledgeVerificationCandidates, knowledgeVerificationContext, normalizeKnowledgePack, normalizeKnowledgePlan, normalizeRetrievedSources, mergeKnowledgePacks, renderKnowledgeEvalContract, restoreKnowledgePack, knowledgePackIsPublishable, knowledgePackNeedsExpansion } from "../app/knowledge-research.ts";
import { assessKnowledgeEvidence, hasVerifiedKnowledgeSupport } from "../app/knowledge-evidence.ts";
import { deriveDomainEvidence } from "../app/evidence-gates.ts";
import { normalizeKnowledgeAssessment, projectDomainPlaybook } from "../app/skill-ir.ts";

const categories = ["decision_rules", "failure_modes", "edge_cases", "verification_methods"];
const quote = "For partial failures, retry only the failed records and compare their checksums; never resend already acknowledged records.";
const sources = normalizeRetrievedSources([{ url: "https://docs.example.com/retries", title: "Retry protocol", excerpt: quote }]);
const plan = normalizeKnowledgePlan({ required: true, domain: "batch transfer", knowledgeGaps: ["partial failure retry"], queries: ["retry protocol"], capabilityDeltaGapIds: ["retry-scope"] });
const atom = {
  id: "retry", title: "Retry scope", dimension: "partial failure retry", knowledge: "Retry only failed records and compare checksums.",
  decision: "Which records must be retried", gapIds: ["retry-scope"], category: "decision_rules",
  appliesWhen: "A batch has partially failed after some records were acknowledged",
  action: "Compare record acknowledgements, retry only failed records and verify their checksums.",
  exception: "Already acknowledged records must not be resent.", type: "official_rule", confidence: 0.96,
  sourceUrls: [sources[0].url], sourceSupport: [{ url: sources[0].url, quote }],
};
const compile = (atoms = [atom], overrides = {}) => normalizeKnowledgePack({ plan, sources, raw: { atoms }, ...overrides });
const review = (pack, overrides = {}) => applyKnowledgeVerification(pack, { verdicts: knowledgeVerificationCandidates(pack).map((item) => ({
  id: item.id, fingerprint: item.fingerprint, sourceSupported: true, deltaRelevant: true, categoryValid: true,
  notGeneric: true, notUserPolicy: true, verifiedGapIds: item.gapIds, reason: "fixture semantic verdict",
  supportChecks: item.supportChecks.map((check) => ({ id: check.id, sourceIndexes: [0], reason: "fixture clause support" })), ...overrides,
})) });

test("URLs without located supporting excerpts or valid gap bindings are rejected", () => {
  for (const change of [{ gapIds: [] }, { gapIds: ["invented-gap"] }, { sourceSupport: [] }, { sourceSupport: [{ url: sources[0].url, quote: "The source guarantees zero data loss in all cases." }] }]) {
    const pack = compile([{ ...atom, ...change }]);
    assert.equal(pack.atoms.length, 0);
    assert.equal(pack.sufficiency, "insufficient");
  }
});

test("located quote alone is not proof of entailment and model self-certification is ignored", () => {
  const pending = compile();
  assert.equal(pending.atoms.length, 1);
  assert.equal(pending.sufficiency, "insufficient");
  assert.equal(knowledgePackIsPublishable(pending), false);
  const reviewed = review(pending);
  assert.equal(knowledgePackIsPublishable(reviewed), true);
  assert.equal(compile(reviewed.atoms).atoms[0].verification, undefined);
  const unsupported = review(compile([{ ...atom, action: "Compare record acknowledgements, then retry every record and claim guaranteed zero data loss." }]), { sourceSupported: false, reason: "quote does not entail the action" });
  assert.equal(unsupported.atoms.length, 0);
  assert.match(unsupported.rejected.join(" "), /does not entail/);
});

test("a verifier's own admission of unsupported inference vetoes its positive vote", () => {
  for (const reason of [
    "来源支持部分动作，但未明确提及这个检查，不过作为扩展是合理的。",
    "动作中的附加检查是合理延伸。",
    "The quote does not explicitly mention this action, but it is a reasonable extension.",
  ]) {
    assert.equal(review(compile(), { reason }).atoms.length, 0, reason);
    const pending = compile();
    const checks = knowledgeVerificationCandidates(pending)[0].supportChecks;
    assert.equal(review(pending, { supportChecks: checks.map((check) => ({ id: check.id, sourceIndexes: [0], reason })) }).atoms.length, 0);
  }
  assert.equal(review(compile(), { reason: "The cited source directly supports the complete action." }).atoms.length, 1);
});

test("excluded advice and user policy are rejected, including semantic paraphrases", () => {
  const excluded = { ...plan, excludedGenericKnowledge: ["Retry only failed records and compare checksums."] };
  assert.equal(compile([atom], { plan: excluded }).atoms.length, 0);
  assert.equal(compile([{ ...atom, origin: "user_policy" }]).atoms.length, 0);
  assert.equal(review(compile(), { notGeneric: false }).atoms.length, 0);
  assert.equal(review(compile(), { notUserPolicy: false }).atoms.length, 0);
  assert.equal(review(compile(), { verifiedGapIds: [] }).atoms.length, 0);
});

test("distinct exceptions remain distinct branches instead of being concatenated", () => {
  const pack = compile([atom, { ...atom, id: "paraphrase", knowledge: "Alternative explanation of the same retry method.", exception: "Stop retrying after the service rejects authorization." }]);
  assert.equal(pack.atoms.length, 2);
  assert.match(pack.atoms[0].exception, /Already acknowledged/);
  assert.match(pack.atoms[1].exception, /rejects authorization/);
  const merged = mergeKnowledgePacks(review(compile()), pack);
  assert.equal(merged.atoms.length, 2);
  assert.equal(hasVerifiedKnowledgeSupport(merged.atoms[0]), true, "a new duplicate must not invalidate accepted evidence");
  assert.equal(hasVerifiedKnowledgeSupport(merged.atoms[1]), false, "a different exception needs its own review");
  assert.equal(merged.evidenceCoverage.verifiedRuleCount, 1);
});

test("a general citation cannot certify unchecked action clauses or invented excerpt indexes", () => {
  const pending = compile([{ ...atom, action: `${atom.action}; Require the user's custom column and label.` }]);
  const candidate = knowledgeVerificationCandidates(pending)[0];
  const receipts = candidate.supportChecks.map((check) => ({ id: check.id, sourceIndexes: [0], reason: "fixture" }));
  for (const supportChecks of [undefined, [], receipts.slice(0, -1), receipts.map((item) => ({ ...item, sourceIndexes: [99] })), [...receipts, receipts[0]]]) {
    assert.equal(review(pending, { supportChecks }).atoms.length, 0);
  }
  assert.equal(review(pending, { sourceSupported: false, reason: "custom column not in source" }).atoms.length, 0);
});

test("semantic yes votes cannot launder invented labels, tools or numerical thresholds into source rules", () => {
  for (const action of [
    '标记为“无法读取”，然后继续处理。',
    'Return "APPROVED" for each missing record.',
    "Use OCR and retry after 15 seconds.",
  ]) assert.equal(compile([{ ...atom, action }]).atoms.length, 0, action);
  const unsupported = { ...review(compile()).atoms[0], action: '标记为“新标签”，然后继续处理。' };
  assert.equal(hasVerifiedKnowledgeSupport(unsupported), false);
  const cited = normalizeRetrievedSources([{ url: sources[0].url, title: "Protocol", excerpt: `${quote} Mark missing records as "UNKNOWN" and retry after 15 seconds.` }]);
  assert.equal(compile([{ ...atom, action: 'Compare acknowledgements; mark records as "UNKNOWN" and retry after 15 seconds.', sourceSupport: [{ url: sources[0].url, quote: cited[0].excerpt }] }], { sources: cited }).atoms.length, 1);
});

test("semantic duplicates from previous batches cannot inflate category or gap coverage", () => {
  const prior = review(compile());
  const context = knowledgeVerificationContext(prior);
  const pending = compile([{ ...atom, id: "retry-reworded", category: "verification_methods", decision: "How to recover a partial batch", action: "Retry failed entries only; verify checksums and leave acknowledged records untouched." }]);
  const candidate = knowledgeVerificationCandidates(pending)[0];
  const verdict = { ...review(pending).atoms[0].verification, id: candidate.id,
    duplicateOf: { fingerprint: context[0].fingerprint, sameCondition: true, sameException: true } };
  const checked = applyKnowledgeVerification(pending, { verdicts: [verdict] }, prior);
  assert.equal(checked.atoms.length, 0);
  const merged = mergeKnowledgePacks(prior, checked);
  assert.equal(merged.atoms.length, 1);
  assert.deepEqual(merged.categoryCoverage.covered, ["decision_rules"]);
  assert.equal(applyKnowledgeVerification(pending, { verdicts: [{ ...verdict, duplicateOf: { ...verdict.duplicateOf, sameException: false } }] }, prior).atoms.length, 1);
  assert.equal(applyKnowledgeVerification(pending, { verdicts: [{ ...verdict, duplicateOf: { ...verdict.duplicateOf, fingerprint: "invented" } }] }, prior).atoms.length, 1);
});

test("advisory evidence covering four labels cannot claim any closed operational gaps", () => {
  const evidence = categories.map((category, index) => ({ ...review(compile([{ ...atom, id: `rule-${index}`, category, decision: `decision-${index}` }])).atoms[0], applicationMode: "advisory" }));
  const coverage = assessKnowledgeEvidence(evidence, ["retry-scope"], categories);
  assert.deepEqual(coverage.observedCategories, categories);
  assert.deepEqual(coverage.coveredCategories, []);
  assert.deepEqual(coverage.missingGapIds, ["retry-scope"]);
  assert.equal(coverage.advisoryRuleCount, 4);
  assert.equal(normalizeKnowledgeAssessment(undefined, evidence, true, ["retry-scope"]).status, "insufficient");
});

test("all categories plus all verified capability gaps determine sufficiency, not atom quota", () => {
  // Semantic category classification is mocked here; each distinct decision
  // receives its own verdict, exercising the accounting rather than an LLM.
  const pack = review(compile(categories.map((category, index) => ({ ...atom, id: `rule-${index}`, category, decision: `decision-${index}` }))));
  assert.equal(pack.sufficiency, "sufficient");
  assert.equal(knowledgePackNeedsExpansion(pack).needsExpansion, false);
  const unmet = normalizeKnowledgeAssessment(undefined, pack.atoms, true, ["retry-scope", "authorization"]);
  assert.equal(unmet.status, "insufficient");
  assert.deepEqual(unmet.missingGapIds, ["authorization"]);
});

test("verification survives canonical projection and restore but not changed rules", () => {
  const pack = review(compile());
  const evidence = deriveDomainEvidence(renderKnowledgeEvalContract(pack), "", "");
  assert.equal(hasVerifiedKnowledgeSupport(evidence[0]), true);
  const rendered = projectDomainPlaybook({ domainEvidence: evidence });
  assert.match(rendered, /Source mechanism:/);
  if (pack.atoms[0].applicationMode === "conditional") assert.match(rendered, /conditional practice/);
  assert.equal(evidence[0].hard_constraint_allowed, pack.atoms[0].applicationMode === "enforced");
  assert.deepEqual(evidence[0].gap_ids, ["retry-scope"]);
  assert.deepEqual(evidence[0].source_support, atom.sourceSupport);
  const changed = { ...evidence[0], rule: "Use an invented global threshold and retry all records." };
  assert.equal(hasVerifiedKnowledgeSupport(changed), false);
  assert.equal(restoreKnowledgePack(pack).atoms.length, 1);
  assert.equal(knowledgePackIsPublishable(restoreKnowledgePack(pack)), true);
  const stale = restoreKnowledgePack({ ...pack, atoms: [{ ...pack.atoms[0], action: "Retry all records without verification." }] });
  assert.equal(stale.sufficiency, "insufficient");
  assert.equal(knowledgePackIsPublishable(stale), false);
});

test("legacy sources without gap/excerpt provenance cannot restore as sufficient", () => {
  const legacy = restoreKnowledgePack({ ...review(compile()), atoms: [{ ...atom, sourceSupport: undefined, gapIds: undefined }], sufficiency: "sufficient" });
  assert.equal(legacy.sufficiency, "insufficient");
  assert.equal(knowledgePackIsPublishable(legacy), false);
});
