import assert from "node:assert/strict";
import test from "node:test";

import {
  compactInterviewEvidenceForRetry,
  compactSkillBundleForOptimization,
  compactSkillBundleForTrial,
  compactSourceContextForTrial,
} from "../app/ai-context.ts";

test("optimizer context routes only issue-relevant implementation files", () => {
  const bundle = {
    "SKILL.md": "# Skill\n\nRead references/requirements.md when active.",
    "references/requirements.md": "# Requirements\nKeep the contract.",
    "references/domain-playbook.md": "# Domain rules\nUse the verified branch.",
    "scripts/affected.py": "print('affected')",
    "scripts/unrelated.py": "print('unrelated secret')",
    "evals/evals.json": JSON.stringify({ large: "x".repeat(20_000) }),
  };
  const compact = compactSkillBundleForOptimization(bundle, {
    issues: [{ files: ["scripts/affected.py"], evidence: "runtime failure" }],
  }, 4_000);
  assert.match(compact, /## SKILL\.md/);
  assert.match(compact, /## scripts\/affected\.py/);
  assert.match(compact, /## references\/requirements\.md/);
  assert.doesNotMatch(compact, /unrelated secret|evals\/evals\.json/);
  assert.ok(compact.length <= 4_000);
});

test("trial bundle uses progressive disclosure and stays inside its budget", () => {
  const bundle = {
    "SKILL.md": "# Skill\n\nRead references/requirements.md and scripts/run.py when needed.",
    "references/requirements.md": "# Requirements\n" + "R".repeat(4_000),
    "scripts/run.py": "print('used')",
    "references/unlinked-private-history.md": "must not be sent",
    "evals/evals.json": "{\"large\":\"" + "x".repeat(10_000) + "\"}",
  };
  const compact = compactSkillBundleForTrial(bundle, 2_400);
  assert.ok(compact.length <= 2_400);
  assert.match(compact, /## SKILL\.md/);
  assert.match(compact, /## references\/requirements\.md/);
  assert.match(compact, /## scripts\/run\.py/);
  assert.doesNotMatch(compact, /unlinked-private-history|must not be sent|evals\/evals\.json/);
});

test("trial source compaction retains evidence from multiple sections", () => {
  const source = ["# Source analysis\n" + "A".repeat(5_000), "# Ideal output\n" + "B".repeat(5_000), "# Constraints\n" + "C".repeat(5_000)].join("\n\n");
  const compact = compactSourceContextForTrial(source, 3_000);
  assert.ok(compact.length <= 3_000);
  assert.match(compact, /# Source analysis/);
  assert.match(compact, /# Ideal output/);
  assert.match(compact, /# Constraints/);
});

test("blueprint retry compaction keeps every confirmed interview decision", () => {
  const evidence = Array.from({ length: 16 }, (_, index) => ({
    dimension: `dimension-${index + 1}`,
    question: `Question ${index + 1} ${"Q".repeat(500)}`,
    answer: `CONFIRMED-${index + 1} ${"A".repeat(500)}`,
  }));
  const compact = compactInterviewEvidenceForRetry(evidence, 8_000);
  assert.ok(compact.length <= 8_000);
  evidence.forEach((_, index) => assert.match(compact, new RegExp(`CONFIRMED-${index + 1}(?:\\D|$)`)));
});

test("single-section retry compaction keeps leading and trailing evidence", () => {
  const source = `LEADING_FACT\n${"x".repeat(9_000)}\nTRAILING_FACT`;
  const compact = compactSourceContextForTrial(source, 2_000);
  assert.match(compact, /LEADING_FACT/);
  assert.match(compact, /TRAILING_FACT/);
  assert.match(compact, /CONTEXT_MIDDLE_OMITTED/);
});

test("trial bundle marks transport truncation instead of presenting a partial rule as a broken file", () => {
  const bundle = {
    "SKILL.md": "# Skill\n\nRead references/domain-playbook.md when the domain branch is active.",
    "references/domain-playbook.md": "# Playbook\n\n### 1. Complete rule\n" + "A".repeat(1_500) + "\n\n### 2. Another rule\n" + "B".repeat(1_500),
  };
  const compact = compactSkillBundleForTrial(bundle, 1_500);
  assert.match(compact, /COMPILER_CONTEXT_TRUNCATED/);
  assert.doesNotMatch(compact, /A{200}$/);
});
