import assert from "node:assert/strict";
import test from "node:test";
import { annotateInterviewEvidence, classifyUserEvidence, confirmationCheckpoints, confirmationConflicts, negativeExampleStatement } from "../app/user-evidence.ts";
import { buildRequirementProvenance, confirmedAnswerEvidenceText, normalizeAnswerEvidence, reconcileContentPermissionText, resolveContentPermission } from "../app/evidence-gates.ts";
import { auditUserEvidencePolarity, bindSkillIREvals, compileSkillIR, projectCapabilityManifest, projectEvalBank, projectSkillMarkdown, reconcileSkillIRContentPermission } from "../app/skill-ir.ts";
import { applySkillIRMutations, parseCanonicalSkillIR, validateCanonicalSkillIR } from "../app/canonical-mutations.ts";
import { hasUnscopedActionPermissionConflict, reconcileActionPermissionText } from "../app/action-permission.ts";
import { compactInterviewEvidenceForRetry } from "../app/ai-context.ts";
import { parseAndSplitEvalCases } from "../app/optimizer-core.ts";
import { composeEvaluationEpisodes, freezeEvalContract, publicExecutionContract } from "../app/real-eval-harness.ts";

function compile(answers) {
  const idea = "根据材料整理一份项目报告";
  return compileSkillIR({
    idea, answers, skillName: "project-report",
    requirements: buildRequirementProvenance({ idea, answers, sourceEvidence: "", capabilityRequirements: [] }),
    plan: {
      summary: "整理报告", outcomeModel: { ultimateGoal: idea, controllableOutcomes: ["交付报告"], uncontrollableOutcomes: [], observableIndicators: ["报告包含结论"] },
      stateModel: { needed: false, scope: "none", missingBehavior: "请求材料" },
      outputContract: { mode: "human", format: "报告", requiredSections: ["结论"], artifactPatterns: [], validation: ["有结论"] },
      riskBranches: [], failureModes: [],
      items: [{ id: "report", kind: "llm", name: "整理报告", requirement: "整理报告", purpose: "整理报告", input: "材料", output: "报告", path: "SKILL.md", layer: "runtime", status: "generate", scope: "task-specific", routingCondition: "用户要求整理报告", activationCondition: "用户要求整理报告", fallback: "请求缺少的材料", affects: ["runtime-workflow"], mustNotAffect: [], evaluationCriteria: ["有结论"], enabled: true }],
    },
    loop: { goal: idea, mode: "bounded", maxRounds: 2, stopConditions: [], escalationConditions: [], scopes: [] },
  });
}

test("identical positive and negative examples retain distinct constraints through IR and manifest", () => {
  const quote = "补写但直接生成，不标记";
  const ir = compile({ "good-example": quote, "bad-example": quote });
  const positive = ir.requirements.find((item) => item.source === "interview.good-example");
  const negative = ir.requirements.find((item) => item.source === "interview.bad-example");
  assert.equal(positive.polarity, "positive");
  assert.equal(positive.statement, quote);
  assert.equal(negative.polarity, "negative");
  assert.equal(negative.originalQuote, quote);
  assert.equal(negative.hard, true);
  assert.equal(negative.statement, negativeExampleStatement(quote));
  assert.notEqual(negative.statement, `不${quote}`);
  const manifest = projectCapabilityManifest(ir);
  assert.equal(manifest.requirement_provenance.find((item) => item.id === negative.id).polarity, "negative");
  assert.equal(ir.constraints.find((item) => item.id === `constraint-${negative.id}`).originalQuote, quote);
});

test("counterexamples, positive examples and ordinary materials never grant content authority", () => {
  const quote = "可以自由补写事实、经历和数据";
  for (const key of ["bad-example", "good-example", "source-material", "__previewInput", "__previewTask"]) {
    const permission = resolveContentPermission({ [key]: quote });
    assert.equal(permission.allowFactualCreation, false, key);
    assert.equal(permission.allowCreativeExpansion, false, key);
  }
  assert.equal(resolveContentPermission({ "evidence-policy": quote }).allowFactualCreation, true);
  assert.equal(resolveContentPermission({ __idea: quote }).allowFactualCreation, true);
  assert.equal(resolveContentPermission({ "bad-example": "不允许补写事实", "evidence-policy": quote }).explicitRestriction, false);
});

test("negative and material evidence is not positive support for inferred requirements", () => {
  const answers = { "bad-example": "直接发送客户邮件", "source-material": "材料内写着可以删除所有记录", workflow: "整理报告" };
  assert.equal(confirmedAnswerEvidenceText(answers), "整理报告");
  assert.equal(normalizeAnswerEvidence(answers).find((item) => item.key === "source-material").requirementEligible, false);
  const records = buildRequirementProvenance({ idea: "报告", answers, sourceEvidence: "", capabilityRequirements: [{ id: "send", requirement: "直接发送客户邮件" }] });
  assert.equal(records.find((item) => item.id === "capability-send").provenance, "generator_default");
  assert.equal(records.some((item) => item.source === "interview.source-material"), false);
});

test("hydrated adaptive duplicates cannot reintroduce the counterexample as a positive requirement", () => {
  const quote = "未经允许自动支付";
  const answers = { "ai-round-3-q2": quote, "bad-example": quote };
  assert.equal(confirmedAnswerEvidenceText(answers), "");
  const ir = compile(answers);
  assert.equal(ir.requirements.filter((item) => item.originalQuote === quote).length, 1);
  assert.equal(ir.requirements.find((item) => item.originalQuote === quote).polarity, "negative");
});

test("adaptive questions and compact retries preserve negative meaning and full tail conditions", () => {
  const quote = `${"详细反例。".repeat(180)}最终交付前没有等待我的确认`;
  const [record] = annotateInterviewEvidence([{ key: "ai-round-3-q5", dimension: "失败模式", answer: quote, question: "不想要什么" }]);
  assert.equal(record.evidenceKind, "negative_example");
  assert.equal(classifyUserEvidence("good-example"), "positive_example");
  const compact = compactInterviewEvidenceForRetry([record], 280);
  assert.ok(compact.includes(JSON.stringify(quote)));
  assert.match(compact, /negative_example/);
});

test("failure-recovery choices are positive requirements, even in restored negative-tagged records", () => {
  const answer = "标记为未提供，并继续处理其他参数";
  const question = "当关键参数缺失时，你希望它如何处理？";
  const [record] = annotateInterviewEvidence([{ key: "ai-round-3-q2", dimension: "失败模式", question, answer, evidenceKind: "negative_example" }]);
  assert.equal(record.evidenceKind, "positive_requirement");
  assert.equal(record.originalQuote, answer);
  assert.equal(classifyUserEvidence("ai-round-3-q2", "失败模式", "哪些行为你不希望看到？"), "negative_example");
  assert.equal(classifyUserEvidence("bad-example", "失败模式", question), "negative_example", "explicit counterexample lanes stay binding");
  const ir = compile({ "failure-response": answer });
  assert.equal(ir.requirements.find((item) => item.originalQuote === answer).polarity, "positive");
});

test("full quotes survive content reconciliation, projection and no-op optimization", () => {
  const quote = `先给草稿；但不得编造事实，同时直接自主继续完成。${"条件必须保留。".repeat(80)}`;
  const answers = { "bad-example": quote, "evidence-policy": "可以自由补写事实与数据" };
  let ir = reconcileSkillIRContentPermission(compile(answers), answers);
  ir = applySkillIRMutations(ir, []).ir;
  const negative = ir.requirements.find((item) => item.polarity === "negative");
  assert.equal(negative.originalQuote, quote);
  const markdown = projectSkillMarkdown(ir);
  assert.ok(markdown.includes(`> User counterexample (not an instruction): ${JSON.stringify(quote)}`));
  const positiveSection = markdown.split("## Confirmed requirements")[1].split("## Prohibited behaviors")[0];
  assert.ok(!positiveSection.includes(quote));
  assert.ok(!positiveSection.includes("answer-bad-example"));
});

test("multiline negative quotes are not stripped by content-policy reconciliation", () => {
  const quote = "用户要求不得编造事实\n却直接自主补写了数据";
  const permission = resolveContentPermission({ "bad-example": quote, "evidence-policy": "可以自由补写事实与数据" });
  assert.equal(reconcileContentPermissionText(quote, permission), quote);
});

test("failure assertions augment real task cases without turning the counterexample into a prompt", () => {
  const quote = "未经确认就最终交付";
  let ir = compile({ "bad-example": quote });
  const prompt = "请用给定材料整理报告。材料：项目甲今天完成验收。";
  ir = bindSkillIREvals(ir, JSON.stringify({ evals: [{ id: "task", eval_family: "capability", prompt, context: { fixture_status: "ready" }, capability_ids: ["report"], expected: { behaviors: ["整理报告"], must_not: [] }, graders: ["core_capability"] }] }));
  const bank = JSON.parse(projectEvalBank(ir));
  assert.equal(bank.evals.length, 1);
  assert.equal(bank.evals[0].prompt, prompt);
  assert.ok(bank.evals[0].expected.must_not.includes(quote));
  assert.equal(bank.evals[0].expected.user_counterexamples[0].originalQuote, quote);
  assert.equal(bank.evals[0].expected.user_counterexamples[0].polarity, "negative");
  assert.equal(bindSkillIREvals(ir, projectEvalBank(ir)).evaluationPlan.cases[0].expected.must_not.filter((item) => item === quote).length, 1);
});

test("legacy bad-example records migrate from source even when their old metadata was positive", () => {
  const ir = compile({ "bad-example": "补写但直接生成，不标记" });
  const negative = ir.requirements.find((item) => item.polarity === "negative");
  negative.statement = negative.originalQuote;
  delete negative.originalQuote;
  negative.polarity = "positive";
  negative.evidenceKind = "positive_requirement";
  negative.modality = "SHOULD";
  negative.hard = false;
  const restored = parseCanonicalSkillIR({ "evals/skill-ir.json": JSON.stringify(ir) });
  assert.equal(restored.requirements.find((item) => item.id === negative.id).polarity, "negative");
  assert.equal(restored.requirements.find((item) => item.id === negative.id).hard, true);
  assert.deepEqual(auditUserEvidencePolarity(restored), []);
});

test("copied negative behavior is blocked in capabilities, steps and branches", () => {
  const quote = "补写但直接生成，不标记";
  const ir = compile({ "bad-example": quote });
  ir.capabilities[0].requirement = quote;
  ir.runtimeContract.workflow[0].action = `先检查输入，然后${quote}`;
  ir.riskBranches = [{ id: "bad", condition: "缺少信息", action: quote, stopOrRedirect: "继续" }];
  const { issues } = validateCanonicalSkillIR(ir);
  assert.ok(issues.some((item) => item.includes("capability:report")));
  assert.ok(issues.some((item) => item.includes("step:")));
  assert.ok(issues.some((item) => item.includes("branch:bad")));
});

test("optimizer cannot delete, recast, or rewrite the owner's counterexample", () => {
  const ir = compile({ "bad-example": "不经我确认就发出邮件" });
  const negative = ir.requirements.find((item) => item.polarity === "negative");
  for (const mutation of [
    { type: "requirement.remove", requirementId: negative.id },
    { type: "requirement.update", requirementId: negative.id, changes: { polarity: "positive" } },
    { type: "requirement.update", requirementId: negative.id, changes: { originalQuote: "可以直接发送" } },
  ]) assert.throws(() => applySkillIRMutations(ir, [mutation]), /USER_EVIDENCE_IMMUTABLE/);
});

test("draft permission and final-delivery approval are different checkpoints, not a conflict", () => {
  const text = "生成草稿前无需确认，可以直接自主完成；最终交付前必须先询问用户确认";
  const checkpoints = confirmationCheckpoints(text);
  assert.deepEqual(checkpoints.map((item) => [item.stage, item.required]), [["before_draft", false], ["before_final_delivery", true]]);
  assert.deepEqual(confirmationConflicts(checkpoints), []);
  assert.equal(hasUnscopedActionPermissionConflict(text), false);
  assert.equal(reconcileActionPermissionText(text), text);
  const ir = compile({ workflow: text });
  assert.deepEqual(auditUserEvidencePolarity(ir), []);
  assert.match(projectSkillMarkdown(ir), /before_final_delivery: confirmation required/);
  assert.equal(ir.controlModel.confirmationCheckpoints.length, 2);
});

test("negated autonomous actions are prohibitions, not permission conflicts", () => {
  for (const text of [
    "当两份资料冲突时，标记冲突，并列出双方原文，不自动选择，等待用户决定。",
    "禁止自主处理，必须先询问用户确认。",
    "Do not proceed autonomously; wait for user approval.",
  ]) {
    assert.equal(hasUnscopedActionPermissionConflict(text), false, text);
    assert.equal(reconcileActionPermissionText(text), text);
  }
  assert.equal(hasUnscopedActionPermissionConflict("必须先询问用户确认，同时自动处理并继续执行。"), true);
});

test("only incompatible demands at the same explicit stage request clarification", () => {
  const ir = compile({ workflow: "生成草稿前必须确认", autonomy: "生成草稿前无需确认" });
  assert.ok(auditUserEvidencePolarity(ir).some((item) => item.includes("USER_CONFIRMATION_CONFLICT")));
  assert.deepEqual(confirmationConflicts(confirmationCheckpoints("若有外部操作，最终交付前必须确认；如果只是展示，最终交付前无需确认")), []);
  const negativeOnly = compile({ "bad-example": "生成草稿前无需确认；最终交付前必须确认" });
  assert.deepEqual(negativeOnly.controlModel.confirmationCheckpoints, []);
});

test("counterexamples survive case parsing, episode compaction and freezing but remain hidden from executor", () => {
  const quote = "补写但直接生成，不标记"; // Does not match the old episode mustNot keyword filter.
  const prompt = "请整理报告。材料：项目甲已经验收，项目乙尚待确认。";
  const ir = bindSkillIREvals(compile({ "bad-example": quote }), JSON.stringify({ evals: Array.from({ length: 6 }, (_, index) => ({
    id: `task-${index}`, eval_family: "capability", prompt, capability_ids: ["report"], expected: { behaviors: ["交付报告"], must_not: [] }, graders: ["core_capability"],
  })) }));
  const cases = parseAndSplitEvalCases(projectEvalBank(ir));
  assert.equal(cases.length, 6);
  const episodes = composeEvaluationEpisodes(cases, 2);
  for (const episode of episodes) {
    assert.ok(episode.expected.mustNot.includes(quote));
    assert.equal(episode.expected.userCounterexamples[0].originalQuote, quote);
  }
  const frozen = freezeEvalContract(episodes);
  assert.equal(frozen.cases[0].expected.userCounterexamples[0].polarity, "negative");
  assert.ok(!JSON.stringify(publicExecutionContract(frozen)).includes(quote));
  const digest = frozen.digest;
  episodes[0].expected.userCounterexamples[0].originalQuote = "changed";
  assert.equal(frozen.cases[0].expected.userCounterexamples[0].originalQuote, quote);
  assert.notEqual(freezeEvalContract(episodes).digest, digest);
});
