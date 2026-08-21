import assert from "node:assert/strict";
import test from "node:test";

import {
  completedNumericDecisionFixture,
  confirmedCorrectionEvalEvidence,
  confirmedOutputFields,
  ensureConfirmedCorrectionContract,
  ensureInformationDependencyContract,
  ensureProductiveCheckpointContract,
  ensureRuntimeKnowledgeRoutes,
  productiveCheckpointRequested,
  reconcileContractFacingFieldLabels,
  semanticIssueContradictsBundleBranchClaim,
  semanticIssueContradictsOwnMissingFieldClaim,
} from "../app/workflow-compiler.ts";

test("fragmented output-field confirmations compile into one ordered schema", () => {
  assert.deepEqual(confirmedOutputFields(
    "CSV 包含编号、需求描述、来源客户、优先级、备注；Markdown 报告包含详细说明；CSV 包含需求分类或标签",
  ), ["编号", "需求描述", "来源客户", "优先级", "备注", "需求分类/标签"]);
});

test("contract-facing aliases are reconciled without rewriting machine keys", () => {
  const source = `headers = ["编号", "分类/标签"]\nrow["category"] = value\n说明：输出分类/标签列。`;
  const reconciled = reconcileContractFacingFieldLabels(source, ["编号", "需求分类/标签"]);
  assert.match(reconciled, /"需求分类\/标签"/);
  assert.match(reconciled, /row\["category"\]/);
  assert.match(reconciled, /输出分类\/标签列/);
  assert.equal(
    reconcileContractFacingFieldLabels("CSV：需求需求分类/标签", ["需求分类/标签"]),
    "CSV：需求分类/标签",
  );
  assert.equal(reconcileContractFacingFieldLabels(reconciled, ["编号", "需求分类/标签"]), reconciled);
});

test("numeric decision fixtures cover the branch after delayed scores arrive", () => {
  const fixture = completedNumericDecisionFixture([
    "1. 客户A：需要导出。",
    "2. 客户B：需要搜索。",
    "权重为：影响 0.5，成本 0.3，风险 0.2。评分我稍后提供。",
  ].join("\n"));
  assert.match(fixture, /记录1：影响=1，成本=2，风险=3/);
  assert.match(fixture, /完成计算、排序和最终交付/);
  assert.doesNotMatch(fixture, /不是用户事实[^\n]*用户事实/);
  assert.equal(completedNumericDecisionFixture("权重为：影响 0.5，成本 0.5。评分已提供：5、3。"), "");
});

test("productive checkpoints compile only from explicit draft-first collaboration evidence", () => {
  assert.equal(productiveCheckpointRequested({ autonomy: "关键决策点询问我", boundary: "AI 先交付草稿，我确认后生成最终版" }), true);
  assert.equal(productiveCheckpointRequested({ autonomy: "关键决策点询问我", "delivery-checkpoint": "先给草稿，确认后再生成最终报告" }), true);
  assert.equal(productiveCheckpointRequested({ autonomy: "缺少信息时先询问我", boundary: "确认后再开始" }), false);
});

test("preview corrections become runtime requirements instead of disappearing after discovery", () => {
  const compiled = ensureConfirmedCorrectionContract("# Skill\n\n## Workflow\n\n1. Draft.", {
    __previewFeedback: "排序不要再使用简单高中低；CSV 要保留来源客户",
    "output-format": "CSV 字段为编号、描述、分数、来源客户",
  });
  assert.match(compiled, /## Confirmed runtime corrections/);
  assert.match(compiled, /排序不要再使用简单高中低/);
  assert.match(compiled, /CSV 要保留来源客户/);
  assert.match(compiled, /Later confirmed 交付格式/);
  assert.match(confirmedCorrectionEvalEvidence({
    __previewFeedback: "CSV 要保留来源客户",
    "output-format": "CSV 字段为编号、描述、分数、来源客户",
  }), /后续结构化确认=交付格式=CSV 字段为编号、描述、分数、来源客户/, "eval evidence should carry temporal provenance");
});

test("productive checkpoint compiler keeps reversible work moving", () => {
  const compiled = ensureProductiveCheckpointContract("# Skill\n\n## Workflow\n\n4. 在排序前暂停，向用户询问具体规则。\n- 如果未提供输入数据，仍应生成包含占位行的临时草稿。\n\n## Risk Branches\n\n- **任务明确但缺少输入文件：** 先产出包含确认表头和占位行的临时结果，再请求材料。\n\n## Runtime branches\n\n- **If 用户未提供优先级规则:** 询问用户优先级规则，暂停生成. Then 停止直到用户提供规则.\n- **If 未提供输入文件:** 请求用户提供文件或粘贴内容. Then 停止直到输入可用.", {
    autonomy: "关键决策点询问我",
    boundary: "AI 先交付草稿，我确认后生成最终版",
  });
  assert.match(compiled, /先完成并展示所有不依赖该决策的可逆部分/);
  assert.match(compiled, /## Productive checkpoint contract/);
  assert.match(compiled, /every requested output format/);
  assert.ok(compiled.indexOf("Productive checkpoint execution") < compiled.indexOf("4. 在排序前"));
  assert.match(compiled, /CSV code block/);
  assert.match(compiled, /pause the dependent finalization step/);
  assert.match(compiled, /after the core task material exists/);
  assert.match(compiled, /begins only after the core source material exists/);
  assert.doesNotMatch(compiled, /(?:缺少|未提供)输入[^\n]*(?:占位行|临时结果)/);
  assert.match(compiled, /任务明确但缺少输入文件[^\n]+只请求|任务明确但缺少输入文件[^\n]+请求用户提供/);
  assert.match(compiled, /If 用户未提供优先级规则:[^\n]+不得停止整个工作流/);
  assert.doesNotMatch(compiled, /If 用户未提供优先级规则:[^\n]+停止直到用户提供规则/);
  assert.match(compiled, /If 未提供输入文件:[^\n]+停止直到输入可用/);
});

test("ask-first workflows are not rewritten into draft-first behavior", () => {
  const source = "# Skill\n\n## Workflow\n\n1. 暂停并询问用户确认后再开始。";
  assert.equal(ensureProductiveCheckpointContract(source, { autonomy: "缺少信息时先询问我" }), source);
});

test("missing-field permission keeps provenance visible across later calculations", () => {
  const compiled = ensureInformationDependencyContract("# Skill\n\n## Workflow\n\n1. Rank the rows.", {
    "input-strategy": "根据上下文合理推断，并在备注中说明",
  });
  assert.match(compiled, /## Information dependency contract/);
  assert.match(compiled, /user-explicit, source-grounded, inferred, or unknown/);
  assert.match(compiled, /label it as inferred/);
  assert.match(compiled, /newly supplied rule does not supply the data fields/);
});

test("runtime knowledge is routed beside workflow execution rather than buried at the end", () => {
  const compiled = ensureRuntimeKnowledgeRoutes([
    "# Skill",
    "",
    "## Workflow",
    "",
    "1. Inspect the input.",
    "",
    "## Output",
    "",
    "Return the result.",
  ].join("\n"), [{
    name: "Decision playbook",
    path: "references/domain-playbook.md",
    activationCondition: "a domain judgment",
  }]);
  assert.ok(compiled.indexOf("Runtime knowledge routes") > compiled.indexOf("## Workflow"));
  assert.ok(compiled.indexOf("Runtime knowledge routes") < compiled.indexOf("1. Inspect the input."));
  assert.match(compiled, /references\/domain-playbook\.md/);
  assert.equal((compiled.match(/Runtime knowledge routes/g) || []).length, 1);
  assert.equal((ensureRuntimeKnowledgeRoutes(compiled, [{ name: "Decision playbook", path: "references/domain-playbook.md" }]).match(/Runtime knowledge routes/g) || []).length, 1);
});

test("semantic reconciliation removes only self-contradictory missing-field claims", () => {
  assert.equal(semanticIssueContradictsOwnMissingFieldClaim("实际 CSV 字段为需求编号、需求描述、优先级、来源客户，但缺少“来源客户”。"), true);
  assert.equal(semanticIssueContradictsOwnMissingFieldClaim("期望 CSV 包含来源客户，但实际输出缺少“来源客户”。"), false);
});

test("semantic reconciliation rejects a critic's invented runtime-branch quote", () => {
  const skill = [
    "## Runtime branches",
    "- **If 未提供输入文件:** 请求用户提供文件或粘贴内容. Then 停止直到输入可用.",
  ].join("\n");
  assert.equal(semanticIssueContradictsBundleBranchClaim(
    "主文件风险分支声明“未提供输入文件：先产出临时结果并建立占位行”，可能制造事实。",
    skill,
  ), true);
  assert.equal(semanticIssueContradictsBundleBranchClaim(
    "主文件风险分支声明“未提供输入文件：请求用户提供文件并停止”，导致任务暂停。",
    skill,
  ), false);
});
