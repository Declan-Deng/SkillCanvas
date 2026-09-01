import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { interviewCompletionGate } from "../app/interview-completion.ts";

const complete = () => {
  const rounds = Array.from({ length: 4 }, (_, r) => ({ questions: Array.from({ length: 4 }, (_, q) => ({ id: `${r}-${q}` })) }));
  return { rounds, origins: ["ai", "ai", "ai", "ai"], answers: Object.fromEntries(rounds.flatMap((round) => round.questions.map((q) => [q.id, "已选择"]))),
    currentRoundIndex: 3, highestRoundReached: 3, expectedQuestionCounts: [4, 4, 4, 4] };
};
test("only the fully completed last round can generate; model confidence cannot authorize early finish", () => {
  for (let index = 0; index < 3; index++) assert.equal(interviewCompletionGate({ ...complete(), currentRoundIndex: index, canFinish: true }).ready, false);
  assert.equal(interviewCompletionGate(complete()).ready, true);
});
test("any unanswered question or ungenerated round blocks blueprint, including restored/direct retry paths", () => {
  for (let r = 0; r < 4; r++) {
    const missing = complete(); delete missing.answers[`${r}-0`];
    assert.equal(interviewCompletionGate(missing).ready, false);
    assert.equal(interviewCompletionGate(missing).incompleteRound, r);
    const placeholder = complete(); placeholder.origins[r] = "default";
    assert.equal(interviewCompletionGate(placeholder).ready, false);
    const partial = complete(); partial.rounds[r].questions.pop();
    assert.equal(interviewCompletionGate(partial).ready, false);
  }
  assert.equal(interviewCompletionGate({ ...complete(), highestRoundReached: 1 }).ready, false);
  const repeated = complete(); repeated.rounds[2].questions[1].id = repeated.rounds[2].questions[0].id;
  assert.equal(interviewCompletionGate(repeated).ready, false, "duplicate IDs cannot make one answer fill multiple questions");
});
test("the generation handler, retry and UI share the four-round gate; extra material appears only in the final round", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /canFinishInterviewEarly|allowAdaptiveFinish|buildBlueprint\(true\)|理解已足够，生成需求蓝图|继续补充下一轮/);
  const handler = page.slice(page.indexOf("async function buildBlueprint()"), page.indexOf("async function buildBlueprint()") + 1200);
  assert.ok(handler.indexOf("if (!interviewCompletion.ready)") < handler.indexOf("beginBusy("));
  assert.ok(handler.indexOf("if (!interviewCompletion.ready)") < handler.indexOf("await runBlueprintPlanning("));
  assert.match(page, /retryAction === "build-blueprint"\) void buildBlueprint\(\)/);
  assert.match(page, /\{isFinalInterviewRound && <div className=\{`understanding-evidence/);
  assert.match(page, /disabled=\{busy \|\| materialsLoading \|\| !interviewReady \|\| \(isFinalInterviewRound && !interviewCompletion.ready\)\}/);
});
