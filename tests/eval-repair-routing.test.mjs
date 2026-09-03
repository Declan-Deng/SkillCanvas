import assert from "node:assert/strict";
import test from "node:test";

import { isCompilerOwnedEvalCoverageIssue, issuesAreCompilerOwnedEvalCoverage } from "../app/eval-repair-routing.ts";

test("the two blockers from the all-capability run are repaired by the eval compiler together", () => {
  const issues = [
    { type: "LEGACY_CONTRACT_BLOCKER", evidence: "评测未同时覆盖触发边界、领域核心能力和真实失败模式" },
    { type: "CAPABILITY_WITHOUT_EVAL", evidence: "能力 host-shell-code 没有聚焦评测。" },
  ];
  assert.equal(issuesAreCompilerOwnedEvalCoverage(issues), true);
  assert.equal(issues.every(isCompilerOwnedEvalCoverageIssue), true);
});

test("semantic task defects are never hidden behind deterministic eval repair", () => {
  const issues = [
    { type: "CAPABILITY_WITHOUT_EVAL", evidence: "能力 host-shell-code 没有聚焦评测。" },
    { type: "LEGACY_CONTRACT_BLOCKER", evidence: "触发描述承诺了工作流没有实现的任务：竞品价格研究" },
  ];
  assert.equal(issuesAreCompilerOwnedEvalCoverage(issues), false);
});
