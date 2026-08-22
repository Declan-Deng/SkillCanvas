import assert from "node:assert/strict";
import test from "node:test";

import {
  compareGateBlockers,
  demoteUnsupportedConfirmationClaims,
  descriptionCoversSpecificDomain,
  descriptionWorkflowScopeMismatches,
  ensureDescriptionWorkflowScopeBranches,
  demoteUnconfirmedQualityProxies,
  ensureInstructionPriorityOrder,
  evalContractIsIncomplete,
  evalPromptIsTooShort,
  findUnconfirmedOperationalDefaults,
  findUnconfirmedScriptComparisons,
  markUnconfirmedFormulasPending,
  hasExecutableWorkflowHeading,
  hasDataMutationPolicyConflict,
  hasInstructionPriorityOrder,
  hasMeaningfulGoal,
  ensureMeaningfulGoal,
  hasUnconfirmedOperationalDefaults,
  hasUnsafeDeterministicFallback,
  hasUnsafeDynamicExecution,
  hasUnboundedFormulaParser,
  pythonScriptTestContractIssues,
  reconcileFormulaSecurityTest,
  reconcilePythonTestInterpreter,
  pythonOutputContractIssues,
  reconcilePythonOutputContract,
  hasUnsupportedPersistenceConflict,
  normalizeExecutableWorkflowHeading,
  persistenceSignals,
  reconcileDataMutationPolicy,
  runtimeFileMentions,
} from "../app/gate-rules.ts";

test("repair progress is accepted only when it resolves blockers without introducing new ones", () => {
  assert.deepEqual(compareGateBlockers(["A", "B", "C"], ["B"]), {
    resolved: ["A", "C"],
    introduced: [],
    improvedWithoutRegression: true,
  });
  assert.deepEqual(compareGateBlockers(["A", "B"], ["B", "D"]), {
    resolved: ["A"],
    introduced: ["D"],
    improvedWithoutRegression: false,
  });
  assert.equal(compareGateBlockers(["A"], ["A"]).improvedWithoutRegression, false);
});

test("generated Python tests use the current interpreter instead of a non-portable python command", () => {
  const repaired = reconcilePythonTestInterpreter("import subprocess\n\ndef run():\n    return subprocess.run(['python', 'scripts/run.py'])\n");
  assert.match(repaired, /^import sys$/m);
  assert.match(repaired, /subprocess\.run\(\[sys\.executable,/);
  assert.doesNotMatch(repaired, /\[['\"]python(?:3)?['\"]/);
});

test("a concise but executable eval prompt is not rejected as a broken contract", () => {
  const currentCase = {
    prompt: "请帮我筛选红人，关键材料都在下面。",
    expected: { behaviors: ["使用材料"] },
    graders: ["trigger", "core_capability"],
  };
  assert.equal(currentCase.prompt.length, 17);
  assert.equal(evalPromptIsTooShort(currentCase), false);
  assert.equal(evalContractIsIncomplete(currentCase), false);
  assert.equal(evalContractIsIncomplete({ ...currentCase, graders: [] }), true);
});

test("instruction priority accepts natural Chinese and English ordering", () => {
  assert.equal(hasInstructionPriorityOrder(`
    1. 当前任务中的明确指令
    2. 已确认的长期偏好
    3. 用户批准的示例
    4. 工作推断
  `), true);
  assert.equal(hasInstructionPriorityOrder("Current explicit instructions > confirmed reusable preferences > approved examples > working inference"), true);
  assert.equal(hasInstructionPriorityOrder("只参考示例，没有说明其他来源。"), false);
});

test("compiler normalizes common workflow headings and adds deterministic priority rules", () => {
  const chineseWorkflow = "## 工作流程\n\n1. 当资料齐全时，生成结果。";
  assert.equal(hasExecutableWorkflowHeading(chineseWorkflow), true);
  assert.match(normalizeExecutableWorkflowHeading(chineseWorkflow), /^## Workflow$/m);
  assert.equal(hasExecutableWorkflowHeading("## 2、执行步骤\n\n如果输入缺失则先询问。"), true);
  assert.equal(hasExecutableWorkflowHeading("## Executable workflow\n\n1. Resolve inputs, then execute."), true);
  assert.match(normalizeExecutableWorkflowHeading("## Executable workflow\n\n1. Execute."), /^## Workflow$/m);

  const repaired = ensureInstructionPriorityOrder(`${chineseWorkflow}\n\n## Notes\n\n用户确认的偏好优先。`);
  assert.equal(hasInstructionPriorityOrder(repaired), true);
  assert.equal(ensureInstructionPriorityOrder(repaired), repaired);
});

test("priority detection ignores earlier inference words and collapses duplicate generated sections", () => {
  const noisy = `合理推断并标注推断部分。\n\n2. Confirmed reusable preferences apply only when they do not conflict with the current task.\n3. User-approved examples guide structure and expression but do not create new facts.\n4. Working inferences remain provisional.\n\n## Instruction priority\n\n1. Current explicit task instructions override every lower-priority source.\n2. Confirmed reusable preferences apply only when they do not conflict with the current task.\n3. User-approved examples guide structure and expression but do not create new facts.\n4. Working inferences remain provisional.\n\n## 指令优先级\n\n1. 当前明确指令\n2. 已确认的长期偏好\n3. 用户批准的示例\n4. 工作推断`;
  assert.equal(hasInstructionPriorityOrder(noisy), true);
  const normalized = ensureInstructionPriorityOrder(noisy);
  assert.equal((normalized.match(/^## Instruction priority$/gm) || []).length, 1);
  assert.equal((normalized.match(/^## 指令优先级$/gm) || []).length, 0);
  assert.equal((normalized.match(/Confirmed reusable preferences/g) || []).length, 1);
  assert.equal((normalized.match(/已确认的长期偏好/g) || []).length, 0);
  assert.equal(hasInstructionPriorityOrder(normalized), true);
});

test("Chinese persistence negation is not counted as permission to save", () => {
  const signals = persistenceSignals("不持久化个人数据，除非用户明确要求。每次任务结束后不保留资料。");
  assert.deepEqual(signals, { allowsPersistence: false, forbidsPersistence: true });
  assert.equal(hasUnsupportedPersistenceConflict("不持久化个人数据，除非用户明确要求。", "none"), false);
  assert.equal(hasUnsupportedPersistenceConflict("长期保存个人偏好。不得持久化个人资料。", "none"), true);
  assert.equal(hasUnsupportedPersistenceConflict("长期保存个人偏好。不得持久化个人资料。", "persistent"), false);
});

test("release gate requires a real goal body, not only a heading", () => {
  assert.equal(hasMeaningfulGoal("## Goal\n\n## Workflow\n\n1. 执行任务"), false);
  assert.equal(hasMeaningfulGoal("## Goal\n\n待补充\n\n## Workflow\n\n1. 执行任务"), false);
  assert.equal(hasMeaningfulGoal("## Goal\n\n根据用户提供的红人数据稳定计算互动率，筛选食品品牌合作候选人，并交付可追溯的清单。\n\n## Workflow\n\n1. 执行任务"), true);
});

test("compiler deterministically replaces an empty or placeholder Goal", () => {
  const expanded = "根据用户已经确认的目标和材料完成小红书内容改写，并交付可以直接检查和继续修改的标题、正文与标签。";
  const repaired = ensureMeaningfulGoal("## Goal\n\n待补充\n\n## Workflow\n\n1. 执行任务", expanded);
  assert.equal(hasMeaningfulGoal(repaired), true);
  assert.match(repaired, /根据用户已经确认的目标/);
  assert.doesNotMatch(repaired, /待补充/);
});

test("trigger descriptions must retain the idea's specific domain", () => {
  assert.equal(descriptionCoversSpecificDomain("清洗、分析和解释用户提供的数据，并形成可验证结论。", "筛选适合食品品牌合作的红人"), false);
  assert.equal(descriptionCoversSpecificDomain("根据红人数据计算互动率并筛选品牌合作候选人。", "筛选适合食品品牌合作的红人"), true);
  assert.equal(descriptionCoversSpecificDomain("根据预算规划可执行旅行行程。", "帮我规划旅行"), true);
});

test("description promises must close into executable workflow branches", () => {
  const skill = `---\nname: xhs\ndescription: "创作、改写、压缩小红书内容，也可只生成标题。"\n---\n\n## Workflow\n\n1. 根据素材生成完整文案。`;
  assert.deepEqual(descriptionWorkflowScopeMismatches(skill), ["改写或优化已有内容", "压缩或精简", "只生成标题"]);
  const closed = `${skill}\n2. 如果用户要求改写或压缩，按要求修改已有内容。\n3. 如果用户只要标题，进入标题生成分支。`;
  assert.deepEqual(descriptionWorkflowScopeMismatches(closed), []);
});

test("compiler deterministically closes frontmatter promises before release", () => {
  const skill = `---\nname: xhs\ndescription: "创作、改写、压缩小红书内容，也可只生成标题。"\n---\n\n## Workflow\n\n1. 根据素材生成完整文案。\n\n## Output\n\n返回结果。`;
  const repaired = ensureDescriptionWorkflowScopeBranches(skill);
  assert.deepEqual(descriptionWorkflowScopeMismatches(repaired), []);
  assert.match(repaired, /## Trigger-to-workflow branches/);
  assert.match(repaired, /仅标题分支/);
  assert.ok(repaired.indexOf("## Trigger-to-workflow branches") < repaired.indexOf("## Output"));
  assert.equal(ensureDescriptionWorkflowScopeBranches(repaired), repaired);
});

test("mentioning a title as one field does not invent a title-only trigger promise", () => {
  const skill = `---\nname: xhs\ndescription: "根据主题生成小红书标题、正文与标签。"\n---\n\n## Workflow\n\n1. 根据主题生成完整文案。`;
  assert.deepEqual(descriptionWorkflowScopeMismatches(skill), []);
  assert.equal(ensureDescriptionWorkflowScopeBranches(skill), skill);
});

test("unconfirmed measurable proxies become soft heuristics", () => {
  const repaired = demoteUnconfirmedQualityProxies("- 标题必须10到20字\n- 正文至少一个比喻\n- 标签至少5个", "用户要自然表达");
  assert.match(repaired, /固定字数只作诊断提示/);
  assert.match(repaired, /无需为了过检而强行添加/);
  assert.match(repaired, /不为达到固定数量凑词/);
});

test("deterministic fallbacks never delegate calculations back to the model", () => {
  assert.equal(hasUnsafeDeterministicFallback("如果脚本不可用，使用LLM手动计算并提示用户"), true);
  assert.equal(hasUnsafeDeterministicFallback("脚本不可用时让大模型生成表格"), true);
  assert.equal(hasUnsafeDeterministicFallback("停止批量计算，说明缺少的运行条件并给出可复核公式"), false);
});

test("generated scripts reject dynamic execution primitives", () => {
  assert.equal(hasUnsafeDynamicExecution("result = eval(expression)"), true);
  assert.equal(hasUnsafeDynamicExecution("subprocess.run(command, shell=True)"), true);
  assert.equal(hasUnsafeDynamicExecution("return evaluate_allowed_ast(tree)"), false);
});

test("formula parsers require a resource bound", () => {
  assert.equal(hasUnboundedFormulaParser("tree = ast.parse(expr, mode='eval')"), true);
  assert.equal(hasUnboundedFormulaParser("if len(expr) > 200: raise ValueError('too long')\ntree = ast.parse(expr, mode='eval')"), false);
});

test("python script tests must match the script entrypoint and failure semantics", () => {
  assert.deepEqual(pythonScriptTestContractIssues("def main():\n    pass", "def test_ok(self):\n    main(['in.csv'])"), ["脚本测试会向 main 传入参数，但脚本入口不接收 argv"]);
  assert.deepEqual(pythonScriptTestContractIssues(
    "def main(argv=None):\n    try:\n        compute()\n    except ValueError:\n        row['error'] = 'bad'",
    "    def test_call_attempt(self):\n        with self.assertRaises(SystemExit):\n            main(['in.csv', '--formula', '__import__(\\\"os\\\")'])",
  ), ["脚本与测试对非法公式的处理不一致：一个继续标记，另一个期待停止"]);
  assert.deepEqual(pythonScriptTestContractIssues(
    "def main(argv=None):\n    try:\n        compute_rate(args.formula, 1, 1, 1, 1)\n    except ValueError:\n        sys.exit(1)\n    for row in data:\n        try:\n            compute_rate(args.formula, 1, 1, 1, 1)\n        except ValueError:\n            row['error'] = 'bad'",
    "    def test_call_attempt(self):\n        with self.assertRaises(SystemExit):\n            main(['in.csv', '--formula', '__import__(\\\"os\\\")'])",
  ), []);
  assert.deepEqual(pythonScriptTestContractIssues("def main(argv=None):\n    parser.parse_args(argv)", "main(['in.csv'])"), []);
  assert.deepEqual(pythonScriptTestContractIssues(
    "def compute_rate(formula):\n    try:\n        return parse(formula)\n    except ValueError:\n        return None\n\ndef main(argv=None):\n    pass",
    "class TestParse:\n    def test_invalid(self):\n        self.assertIsNone(parse_number('abc'))\n\nclass TestMain:\n    def test_missing_formula_stops(self):\n        with self.assertRaises(SystemExit):\n            main([])\n",
  ), []);
  assert.deepEqual(pythonScriptTestContractIssues(
    "def compute_rate(formula):\n    try:\n        return parse(formula)\n    except ValueError:\n        return None\n",
    "class TestMain:\n    def test_call_attempt(self):\n        with self.assertRaises(ValueError):\n            compute_rate('__import__(\\\"os\\\")')\n",
  ), ["安全公式测试与 compute_rate 的返回契约不一致：函数返回空值，测试却期待抛出异常"]);
});

test("compiler points formula injection tests at the safe parser", () => {
  const repaired = reconcileFormulaSecurityTest(
    "def compute_rate(formula, likes, comments, shares, followers):\n    raise ValueError('bad')",
    "from process_data import parse_number, main\n\nclass TestMain:\n    def test_call_attempt(self):\n        with self.assertRaises(SystemExit):\n            main(['input.csv'])\n\n    def test_next(self):\n        pass\n",
  );
  assert.match(repaired, /import parse_number, main, compute_rate/);
  assert.match(repaired, /with self\.assertRaises\(ValueError\)/);
  assert.match(repaired, /compute_rate\(/);
  assert.doesNotMatch(repaired, /test_call_attempt[\s\S]{0,200}main\(\[/);
});

test("compiler follows a safe parser's documented None return contract", () => {
  const repaired = reconcileFormulaSecurityTest(
    "def compute_rate(formula):\n    try:\n        return parse(formula)\n    except ValueError:\n        return None\n",
    "from pathlib import Path, compute_rate\nfrom process_data import parse_number, main\n\nclass TestMain:\n    def test_call_attempt(self):\n        with self.assertRaises(SystemExit):\n            main(['input.csv'])\n",
  );
  assert.match(repaired, /from pathlib import Path\nfrom process_data import parse_number, main, compute_rate/);
  assert.match(repaired, /self\.assertIsNone\(compute_rate\(/);
  assert.doesNotMatch(repaired, /from pathlib import Path, compute_rate/);
});

test("release gate rejects script functions imported from the wrong Python module", () => {
  assert.deepEqual(pythonScriptTestContractIssues(
    "def compute_rate(formula):\n    return 0\n",
    "from pathlib import Path, compute_rate\nfrom process_data import main\n",
    "process_data",
  ), ["测试把脚本函数错误地从其他模块导入：compute_rate"]);
  assert.deepEqual(pythonScriptTestContractIssues(
    "def compute_rate(formula):\n    return 0\n",
    "from pathlib import Path\nfrom process_data import main, compute_rate\n",
    "process_data",
  ), []);
});

test("compiler restores contract-facing columns after internal normalization", () => {
  const script = "def main():\n    field_map = {'粉丝数': 'followers'}\n    for row in data:\n        for old, new in field_map.items():\n            if old in row:\n                row[new] = row.pop(old)\n    # 输出\n    write_csv(data, output_path)\n";
  const contract = "## Required content\n\n- 粉丝数\n- 互动率\n";
  assert.deepEqual(pythonOutputContractIssues(script, contract), ["脚本标准化字段时移除了原始列名，但导出前没有恢复输出契约要求的列"]);
  const repaired = reconcilePythonOutputContract(script, contract);
  assert.match(repaired, /row\[original\] = row\.pop\(normalized\)/);
  assert.deepEqual(pythonOutputContractIssues(repaired, contract), []);
});

test("script threshold gate ignores parser safety limits but keeps business cutoffs", () => {
  assert.deepEqual(findUnconfirmedScriptComparisons("if len(expr) > 200: raise ValueError('too long')", ""), []);
  assert.deepEqual(findUnconfirmedScriptComparisons("if engagement_rate < 0.05: reject()", ""), ["if engagement_rate < 0.05: reject()"]);
  assert.deepEqual(findUnconfirmedScriptComparisons('priority_map = {"high": 0, "medium": 1, "low": 2}', "按用户确认的排序规则执行"), ['priority_map = {"high": 0, "medium": 1, "low": 2}']);
  assert.deepEqual(findUnconfirmedScriptComparisons('priority_map = {"high": 0, "medium": 1, "low": 2}', "用户明确选择 high、medium、low 的顺序"), []);
});

test("runtime file mentions include backticks and markdown links", () => {
  assert.deepEqual(runtimeFileMentions("读取 `references/missing.md`，运行 [calc](scripts/calc.py)，忽略 evals/evals.json。"), ["references/missing.md", "scripts/calc.py"]);
});

test("operational defaults require explicit confirmation", () => {
  assert.equal(hasUnconfirmedOperationalDefaults("默认互动率阈值：1%。", "需要互动率阈值，但尚未确定"), true);
  assert.equal(hasUnconfirmedOperationalDefaults("互动率公式：(点赞+评论)/粉丝数", "公式必须清楚，但分母尚未确认"), true);
  assert.equal(hasUnconfirmedOperationalDefaults("互动率公式为 (点赞+评论)/粉丝数", "公式必须清楚，但分母尚未确认"), true);
  assert.equal(hasUnconfirmedOperationalDefaults("互动率公式为待确认项；由用户确认后作为参数传入脚本", "公式必须清楚，但分母尚未确认"), false);
  assert.equal(hasUnconfirmedOperationalDefaults("用户确认公式为 (点赞+评论)/粉丝数 后才执行", "公式必须清楚，但分母尚未确认"), false);
  assert.equal(hasUnconfirmedOperationalDefaults("公式：(点赞+评论)/粉丝数。此公式已由用户确认。", "公式必须清楚，但分母尚未确认"), true);
  assert.equal(hasUnconfirmedOperationalDefaults("# supported formula: (likes + comments) / followers", "公式必须清楚，但分母尚未确认", false), false);
  assert.equal(hasUnconfirmedOperationalDefaults("默认互动率阈值：1%。", "用户确认默认互动率阈值为 1%"), false);
  assert.deepEqual(findUnconfirmedOperationalDefaults("默认互动率阈值：1%。\n默认预算：10万元。", "尚未确定"), ["默认互动率阈值：1%。", "默认预算：10万元。"]);
});

test("compiler makes unconfirmed formulas visibly pending", () => {
  const normalized = markUnconfirmedFormulasPending("3. 互动率公式为 (likes + comments) / followers", "公式必须清楚，但分母尚未确认");
  assert.match(normalized, /候选公式为/);
  assert.match(normalized, /未确认则停止计算/);
  assert.equal(hasUnconfirmedOperationalDefaults(normalized, "公式必须清楚，但分母尚未确认"), false);
});

test("compiler demotes generated claims that the user already confirmed an absent rule", () => {
  const repaired = demoteUnsupportedConfirmationClaims("- 公式：A / B。此公式已由用户确认，作为唯一依据。", "公式仍待确认");
  assert.match(repaired, /候选方案/);
  assert.match(repaired, /必须请用户确认/);
  assert.doesNotMatch(repaired, /已由用户确认/);
});

test("script business cutoffs cannot hide as numeric comparisons", () => {
  assert.deepEqual(findUnconfirmedScriptComparisons("if followers > 1e9 or rate > 1.0:\n  flag()\nif denominator <= 0:\n  stop()", "异常规则尚未确认"), ["if followers > 1e9 or rate > 1.0:"]);
  assert.deepEqual(findUnconfirmedScriptComparisons("if followers > 100000:\n  flag()", "用户确认粉丝阈值为 100000"), []);
});

test("confirmed mark-only data policy removes generated imputation permission", () => {
  const confirmed = "仅标记异常，不修改原始数据";
  const repaired = reconcileDataMutationPolicy("允许对缺失值进行标记和估算（如用0或平均值），但需披露。", confirmed);
  assert.match(repaired, /只做标记/);
  assert.doesNotMatch(repaired, /平均值/);
  assert.equal(hasDataMutationPolicyConflict("缺失数据可用平均值填充", confirmed), true);
  assert.equal(hasDataMutationPolicyConflict("缺失值处理：标记缺失字段，不填充。", confirmed), false);
  assert.equal(hasDataMutationPolicyConflict(repaired, confirmed), false);
});
