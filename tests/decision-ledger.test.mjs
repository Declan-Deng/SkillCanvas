import assert from "node:assert/strict";
import test from "node:test";

import {
  DECISION_LEDGER_PATH,
  appendDecisionLedgerEntry,
  createDecisionLedgerEntry,
  decisionLedgerFeedback,
  parseDecisionLedger,
} from "../app/decision-ledger.ts";

function entry(overrides = {}) {
  return createDecisionLedgerEntry({
    id: "candidate-1",
    source: "generation-loop",
    outcome: "rolled-back",
    baselineRevision: "bundle-a",
    candidateRevision: "bundle-b",
    contractDigest: "contract-123",
    policy: { id: "generation-goal-gate", version: "2.7", mode: "bounded-patch" },
    evaluation: {
      runIds: ["run-1"],
      caseIds: ["case-1"],
      baselineScore: 72,
      candidateScore: 68,
      delta: -4,
      regressions: ["触发回退"],
    },
    textualGradient: {
      summary: "候选缩小了有效触发范围",
      criticalProblems: [{
        id: "trigger-regression",
        critique: "隐式请求不再触发",
        direction: "恢复意图级触发，同时保留负例边界",
        caseIds: ["case-1"],
        affectedCapabilities: ["core-trigger"],
      }],
      preserve: ["保留已经通过的负例边界"],
    },
    failedCases: [{
      caseId: "case-1",
      family: "trigger",
      capabilityIds: ["core-trigger"],
      failureSummary: "隐式触发失败",
      observedEvidence: "输出没有进入任务流程",
      inputPrompt: "帮我把这个结果调整得更适合投递",
    }],
    decision: {
      reasons: ["候选分数下降"],
      changedFiles: ["SKILL.md"],
      rollbackReason: "触发回退",
    },
    consumedDecisionIds: [],
    ...overrides,
  });
}

test("decision ledger keeps the full textual gradient and rollback evidence inside the bundle", () => {
  const first = entry();
  const files = appendDecisionLedgerEntry({ "SKILL.md": "# Skill\n" }, first);
  const ledger = parseDecisionLedger(files[DECISION_LEDGER_PATH]);

  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].evidenceDigest, first.evidenceDigest);
  assert.equal(ledger.entries[0].textualGradient.criticalProblems[0].direction, "恢复意图级触发，同时保留负例边界");
  assert.equal(ledger.entries[0].failedCases[0].inputPrompt, "帮我把这个结果调整得更适合投递");
  assert.equal(ledger.entries[0].decision.rollbackReason, "触发回退");
});

test("optimizer feedback is reconstructed from the decision ledger with traceable decision ids", () => {
  const rolledBack = entry();
  const accepted = entry({ id: "candidate-2", outcome: "accepted", decision: { reasons: ["提升 6 分"], changedFiles: ["SKILL.md"], rollbackReason: "" } });
  let files = appendDecisionLedgerEntry({}, rolledBack);
  files = appendDecisionLedgerEntry(files, accepted);

  const feedback = decisionLedgerFeedback(files, { source: "generation-loop" });
  assert.equal(feedback.length, 1);
  assert.equal(feedback[0].decisionId, "candidate-1");
  assert.equal(feedback[0].textualFeedback.summary, "候选缩小了有效触发范围");
  assert.equal(feedback[0].evidenceDigest, rolledBack.evidenceDigest);
});

test("decision evidence digest is deterministic for the same timestamped record", () => {
  const createdAt = "2026-08-21T00:00:00.000Z";
  assert.equal(entry({ createdAt }).evidenceDigest, entry({ createdAt }).evidenceDigest);
});
