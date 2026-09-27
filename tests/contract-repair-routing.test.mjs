import assert from "node:assert/strict";
import test from "node:test";

import { compilerOwnedContractIssues, contractRepairOwner } from "../app/contract-repair-routing.ts";

test("compiler-owned contract defects never route to model semantic repair", () => {
  const cases = [
    [{ evidence: "[SKILL_PROJECTION_DRIFT] SKILL.md 不是确定性投影" }, "compiler-projection"],
    [{ evidence: "[KNOWLEDGE_REQUIREMENT_BYPASSED] external gap 被标记为 not-required" }, "compiler-knowledge"],
    [{ type: "CAPABILITY_WITHOUT_EVAL", evidence: "能力没有聚焦评测" }, "compiler-eval"],
    [{ type: "DESCRIPTION_SCOPE", evidence: "触发描述承诺了未实现任务" }, "model-semantic"],
  ];
  for (const [issue, owner] of cases) assert.equal(contractRepairOwner(issue), owner);
  assert.equal(compilerOwnedContractIssues(cases.map(([issue]) => issue)).length, 3);
});
