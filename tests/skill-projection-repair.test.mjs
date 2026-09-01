import assert from "node:assert/strict";
import test from "node:test";
import {
  auditSkillIRFiles, bindSkillIREvals, compileSkillIR, ensureSkillIREvalCoverage,
  normalizeKnowledgeAssessment, projectCapabilityManifest, projectDomainPlaybook,
  projectOutputReference, projectSkillIRFiles, projectToolContracts, skillIRDigest,
} from "../app/skill-ir.ts";
import { isSkillIRProjectionIssue, rebuildSkillIRProjections } from "../app/skill-projection-repair.ts";
import { knowledgeClaimFingerprint, knowledgeSupportChecks } from "../app/knowledge-evidence.ts";
import { validateImplementationFiles, COMPILER_OWNED_SEMANTIC_PATHS } from "../app/canonical-mutations.ts";
import { capabilities, workflow } from "./fixtures/blueprint.mjs";
import { capabilityCatalog } from "./fixtures/capability-catalog.mjs";

function fixture(selected = []) {
  const plan = structuredClone(capabilities.capabilityPlan);
  plan.items.push(...selected.map((item) => ({ ...item, enabled: true, scope: "conditional", affects: ["tool-routing"] })));
  plan.workflowSteps = structuredClone(workflow.workflowSteps);
  plan.workflowSteps[0].requires = ["$source"];
  plan.workflowSteps[0].availableCapabilityIds = selected.map((item) => item.id);
  const ir = compileSkillIR({ skillName: "compare-products", idea: "比较竞品选品、价格和营销策略", answers: {}, plan, loop: workflow.loopPlan, requirements: [] });
  // A synthetic verified advisory source, not copied user data or a live
  // research result. Including it exercises the fifth reported drift path.
  const evidence = {
    id: "comparable-prices", category: "decision_rules", knowledge: "Compare equivalent units.",
    decision: "Select comparable prices", rule: "Compare equivalent units.", applies_when: "Comparing offers",
    exception: "none", gap_ids: ["comparison-basis"], source_urls: ["https://example.com/fixture"],
    source_support: [{ url: "https://example.com/fixture", quote: "Compare equivalent units." }],
    evidence_type: "heuristic", confidence: 0.6, application_mode: "advisory", hard_constraint_allowed: false,
  };
  evidence.verification = {
    fingerprint: knowledgeClaimFingerprint(evidence), sourceSupported: true, deltaRelevant: true, categoryValid: true,
    notGeneric: true, notUserPolicy: true, verifiedGapIds: evidence.gap_ids, reason: "Synthetic test receipt",
    supportChecks: knowledgeSupportChecks(evidence).map(({ id }) => ({ id, sourceIndexes: [0], reason: "Synthetic test receipt" })),
  };
  ir.domainEvidence = [evidence];
  ir.knowledgeAssessment = normalizeKnowledgeAssessment(ir.knowledgeAssessment, ir.domainEvidence);
  const seed = JSON.stringify({ evals: [{
    id: "provided-comparison", eval_family: "capability", category: "core_capability", should_trigger: true,
    capability_ids: ir.capabilities.filter((item) => item.kind !== "eval").map((item) => item.id),
    prompt: "请根据这些已提供的商品材料比较价格：商品甲售价一百元、包含两双；商品乙售价六十元、包含一双。先统一计价单位，再列出结论与材料限制，不虚构外部检索结果。",
    context: { fixture_status: "provided" }, graders: ["core_capability"], runnable: true,
    expected: { behaviors: ["Compare equivalent units"], must_not: ["Invent external retrieval"], artifacts: [] },
  }] });
  return bindSkillIREvals(ir, ensureSkillIREvalCoverage(ir, seed));
}

const driftIssues = (files) => auditSkillIRFiles(files).filter((evidence) => isSkillIRProjectionIssue({ evidence }));

test("canonical hash matches JSON persistence without hiding meaningful contract changes", () => {
  const ir = fixture();
  const original = skillIRDigest(ir);
  const optional = structuredClone(ir);
  optional.capabilities[0].connection = undefined;
  optional.identity.unused = undefined;
  assert.equal(skillIRDigest(optional), skillIRDigest(JSON.parse(JSON.stringify(optional))));
  const sparse = { ...optional, testMetadata: [undefined, , null, NaN, Infinity] };
  assert.equal(skillIRDigest(sparse), skillIRDigest(JSON.parse(JSON.stringify(sparse))));
  const changed = structuredClone(ir);
  changed.identity.intent += "另外改变任务范围";
  assert.notEqual(skillIRDigest(changed), original);
  assert.notEqual(skillIRDigest({ ...ir, extra: null }), skillIRDigest({ ...ir, extra: undefined }));
  assert.equal(skillIRDigest(Object.fromEntries(Object.entries(ir).reverse())), original);
});

test("every catalog capability and the full selection survive serialization and reprojection", () => {
  for (const selected of [...capabilityCatalog.map((item) => [item]), capabilityCatalog]) {
    const ir = fixture(selected);
    for (const capability of ir.capabilities) {
      if (capability.kind !== "mcp") capability.connection = undefined;
    }
    const original = structuredClone(ir);
    const files = projectSkillIRFiles(ir);
    assert.deepEqual(driftIssues(files), [], selected.map((item) => item.id).join(", "));
    const restored = JSON.parse(files["evals/skill-ir.json"]);
    assert.equal(skillIRDigest(ir), skillIRDigest(restored));
    assert.deepEqual(restored.capabilities.map((item) => item.id), ir.capabilities.map((item) => item.id));
    assert.deepEqual(rebuildSkillIRProjections(files).changedPaths, []);
    assert.deepEqual(ir, original, "projection must not mutate caller data");
  }
});

test("the five logged projection blockers are rebuilt without changing IR, sources, fixtures or authored files", () => {
  const ir = fixture([capabilityCatalog[0]]);
  const original = projectSkillIRFiles(ir, {
    "references/source-evidence.md": "User-supplied original evidence",
    "references/custom.md": "Authored reference; do not overwrite",
    "scripts/analyse.py": "print('checked')",
    "assets/template.csv": "product,price\n",
  });
  assert.match(original["references/domain-playbook.md"], /Canonical source:/);
  const legacy = structuredClone(original);
  const digest = skillIRDigest(ir);
  for (const path of ["evals/capability-manifest.json", "integrations/tool-contracts.json", "references/output-contract.md", "references/domain-playbook.md"]) {
    legacy[path] = legacy[path].replaceAll(digest, "fnv1a-old-memory");
  }
  assert.equal(driftIssues(legacy).length, 5);
  const repaired = rebuildSkillIRProjections(legacy);
  assert.equal(repaired.changedPaths.length, 4);
  assert.deepEqual(driftIssues(repaired.files), []);
  assert.deepEqual(repaired.files, original);
  assert.equal(repaired.files["evals/skill-ir.json"], legacy["evals/skill-ir.json"]);
  assert.equal(repaired.files["evals/evals.json"], legacy["evals/evals.json"]);
  assert.deepEqual(rebuildSkillIRProjections(repaired.files).changedPaths, []);
});

test("round-tripped JSON produces identical standalone digest-bearing projections", () => {
  const ir = fixture([capabilityCatalog[0]]);
  ir.capabilities[0].connection = undefined;
  const restored = JSON.parse(JSON.stringify(ir));
  for (const projector of [projectCapabilityManifest, projectToolContracts, projectOutputReference, projectDomainPlaybook]) {
    assert.equal(JSON.stringify(projector(ir)), JSON.stringify(projector(restored)));
  }
});

test("reprojection does not repair away genuine DAG or knowledge defects", () => {
  const ir = fixture();
  ir.runtimeContract.workflow[0].requires.push("$missing_real_input");
  ir.domainEvidence[0].rule = "Unsupported new action";
  const files = projectSkillIRFiles(ir);
  files["references/output-contract.md"] += "\nStale";
  const repaired = rebuildSkillIRProjections(files);
  assert.deepEqual(driftIssues(repaired.files), []);
  const remaining = auditSkillIRFiles(repaired.files);
  assert.ok(remaining.some((issue) => issue.includes("$missing_real_input")));
  assert.ok(remaining.some((issue) => issue.includes("KNOWLEDGE_EVIDENCE_UNVERIFIED")));
  assert.equal(repaired.files["evals/skill-ir.json"], files["evals/skill-ir.json"]);
});

test("malformed or unknown canonical IR is never replaced with guessed defaults", () => {
  for (const serialized of ["{", "null", "{}", '{"schemaVersion":"99","compiler":"skillcanvas"}']) {
    const files = { "evals/skill-ir.json": serialized, "SKILL.md": "Keep original" };
    const original = structuredClone(files);
    assert.throws(() => rebuildSkillIRProjections(files));
    assert.deepEqual(files, original);
  }
});

test("all compiler-managed artifacts remain protected from model implementation edits", () => {
  const ir = fixture();
  for (const path of COMPILER_OWNED_SEMANTIC_PATHS) {
    assert.throws(() => validateImplementationFiles(ir, { [path]: "Pretend repair" }), /编译器管理的文件.*canonicalMutations/);
  }
  assert.equal(isSkillIRProjectionIssue({ evidence: "[KNOWLEDGE_EVIDENCE_UNVERIFIED] Missing support" }), false);
});

test("validation API reports the five stale projections and clears them after local rebuilding", async () => {
  const { default: worker } = await import("../dist/server/index.js");
  const ir = fixture([capabilityCatalog.find((item) => item.id === "host-web-search")]);
  const files = projectSkillIRFiles(ir, {
    "evals/graders.json": JSON.stringify({ graders: [] }),
    "evals/result.schema.json": JSON.stringify({ type: "object" }),
    "evals/run_evals.py": '# skillcanvas-owned-eval-runner:v1\nimport argparse\ndef main():\n    argparse.ArgumentParser().parse_args()\nif __name__ == "__main__":\n    main()\n',
    "evals/artifact_checker.py": "# skillcanvas-owned-artifact-checker:v1\ndef inspect_bundle(root):\n    return {}\n",
  });
  const digest = skillIRDigest(ir);
  for (const path of ["evals/capability-manifest.json", "integrations/tool-contracts.json", "references/output-contract.md", "references/domain-playbook.md"]) {
    files[path] = files[path].replaceAll(digest, "fnv1a-old-memory");
  }
  const validate = async (bundle) => {
    // Opt in to checking the running local app with this synthetic fixture;
    // the default suite exercises the built worker without a running server.
    const liveUrl = process.env.SKILLCANVAS_VALIDATION_TEST_URL;
    const request = new Request(new URL("/api/validate-bundle", liveUrl || "http://localhost"), {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: bundle }),
    });
    const response = liveUrl ? await fetch(request, { signal: AbortSignal.timeout(30_000) })
      : await worker.fetch(request, { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(response.status, 200);
    return response.json();
  };
  const before = await validate(files);
  assert.equal(before.executionReady, true, JSON.stringify(before.issues));
  assert.equal(before.contractReady, false);
  assert.equal(before.issues.filter((issue) => isSkillIRProjectionIssue({ evidence: issue.message })).length, 5);
  const after = await validate(rebuildSkillIRProjections(files).files);
  assert.equal(after.executionReady, true, JSON.stringify(after.issues));
  assert.equal(after.contractReady, true, JSON.stringify(after.issues));
});
