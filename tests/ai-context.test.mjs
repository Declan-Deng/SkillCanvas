import assert from "node:assert/strict";
import test from "node:test";

import {
  compactSkillBundleForTrial,
  compactSourceContextForTrial,
} from "../app/ai-context.ts";

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

test("trial bundle marks transport truncation instead of presenting a partial rule as a broken file", () => {
  const bundle = {
    "SKILL.md": "# Skill\n\nRead references/domain-playbook.md when the domain branch is active.",
    "references/domain-playbook.md": "# Playbook\n\n### 1. Complete rule\n" + "A".repeat(1_500) + "\n\n### 2. Another rule\n" + "B".repeat(1_500),
  };
  const compact = compactSkillBundleForTrial(bundle, 1_500);
  assert.match(compact, /COMPILER_CONTEXT_TRUNCATED/);
  assert.doesNotMatch(compact, /A{200}$/);
});
