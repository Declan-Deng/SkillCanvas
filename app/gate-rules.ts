export const MIN_EXECUTABLE_EVAL_PROMPT_CHARS = 12;

export type EvalContractLike = {
  prompt?: string;
  expected?: unknown;
  graders?: unknown;
};

export type GateBlockerDiff = {
  resolved: string[];
  introduced: string[];
  improvedWithoutRegression: boolean;
};

const CANONICAL_PROJECTION_REFERENCES = new Set([
  "references/domain-playbook.md",
  "references/loop-plan.md",
  "references/output-contract.md",
  "references/state-model.md",
  "references/tooling.md",
]);

/**
 * Detect duplicated author-owned runtime prose. Canonical reference files are
 * deliberately excluded: they are deterministic views of the same SkillIR,
 * so shared wording there is projection evidence, not competing authority.
 */
export function countDuplicateAuthorRuntimeRules(files: Record<string, string>) {
  const sentenceOwners = new Map<string, Set<string>>();
  Object.entries(files)
    .filter(([path]) => (path === "SKILL.md" || path.startsWith("references/")) && !CANONICAL_PROJECTION_REFERENCES.has(path))
    .forEach(([path, content]) => {
      content
        .split(/[。！？.!?\n]+/)
        .map((sentence) => sentence.replace(/^[#>*\-\d.\s]+/, "").replace(/\s+/g, " ").trim().toLowerCase())
        .filter((sentence) => sentence.length >= 36)
        .forEach((sentence) => {
          const owners = sentenceOwners.get(sentence) || new Set<string>();
          owners.add(path);
          sentenceOwners.set(sentence, owners);
        });
    });
  return Array.from(sentenceOwners.values()).filter((owners) => owners.size > 1).length;
}

export function evalPromptIsTooShort(item: EvalContractLike) {
  return (item.prompt || "").trim().length < MIN_EXECUTABLE_EVAL_PROMPT_CHARS;
}

export function evalContractIsIncomplete(item: EvalContractLike) {
  return !item.expected
    || typeof item.expected !== "object"
    || !Array.isArray(item.graders)
    || item.graders.length === 0;
}

function markerIndexAfter(text: string, pattern: RegExp, after: number) {
  const match = pattern.exec(text.slice(after));
  return match ? after + match.index : -1;
}

const WORKFLOW_HEADING = /^##\s+(?:\d+[.)、]\s*)?(?:workflow(?:\s+and\s+(?:branches|decisions))?|executable\s+workflow|procedure|runtime\s+workflow|execution(?:\s+(?:workflow|steps))?|steps|instructions|工作流|工作流程|执行流程|执行步骤|运行流程|操作流程|处理流程|具体步骤|工作步骤)\s*[：:]?\s*$/im;

export function hasExecutableWorkflowHeading(text: string) {
  return WORKFLOW_HEADING.test(text);
}

export function normalizeExecutableWorkflowHeading(text: string) {
  return text.replace(WORKFLOW_HEADING, "## Workflow");
}

export function markdownSectionBody(text: string, heading: string) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`(?:^|\\n)##\\s+${escapedHeading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i"));
  return match?.[1]?.trim() || "";
}

export function hasMeaningfulGoal(text: string) {
  const goal = markdownSectionBody(text, "Goal")
    .replace(/^[#>*\-\d.)、\s]+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return goal.length >= 32 && !/^(?:待补充|尚未提供|暂无|none|n\/?a)$/i.test(goal);
}

export function ensureMeaningfulGoal(text: string, expandedGoal: string) {
  if (hasMeaningfulGoal(text)) return text;
  const goal = expandedGoal.replace(/\s+/g, " ").trim();
  if (goal.length < 32) return text;
  const section = /(^|\n)##\s+Goal\s*\n[\s\S]*?(?=\n##\s|$)/i;
  if (section.test(text)) return text.replace(section, (_, prefix: string) => `${prefix}## Goal\n\n${goal}\n`);
  return `## Goal\n\n${goal}\n\n${text.trim()}`;
}

export function demoteUnconfirmedQualityProxies(text: string, confirmedText: string) {
  const confirmed = confirmedText.replace(/\s+/g, "").toLowerCase();
  return text.split("\n").map((line) => {
    const compact = line.replace(/\s+/g, "").toLowerCase().replace(/^[#>*\-\d.]+/, "");
    if (!/(?:必须|务必|至少|不得少于|should always|must|at least)/i.test(line)) return line;
    const proxy = /(?:标题.{0,12}\d+.{0,8}(?:字|字符)|正文.{0,20}(?:比喻|意象)|至少.{0,10}(?:比喻|意象)|标签.{0,12}\d+.{0,8}(?:个|条)|\d+\s*(?:到|至|[-–])\s*\d+\s*(?:字|个标签|条标签))/i.test(line);
    if (!proxy || (compact.length >= 8 && confirmed.includes(compact))) return line;
    if (/标题/i.test(line) && /字|字符/i.test(line)) return "- 标题长度应服务于当前内容、平台呈现和用户确认的风格；固定字数只作诊断提示，不作为通用通过条件。";
    if (/比喻|意象/i.test(line)) return "- 仅在当前主题与已确认文风适合时使用比喻或意象；自然、有信息价值的表达无需为了过检而强行添加。";
    if (/标签/i.test(line)) return "- 标签数量由主题相关性和用户交付要求决定；优先保留精准标签，不为达到固定数量凑词。";
    return line;
  }).join("\n");
}

const SPECIFIC_DOMAIN_SIGNALS: Array<{ idea: RegExp; description: RegExp }> = [
  { idea: /红人|达人|博主|influencers?/i, description: /红人|达人|博主|influencers?/i },
  { idea: /简历|resume|\bjd\b/i, description: /简历|resume|职位|岗位|\bjd\b/i },
  { idea: /小红书|xiaohongshu|rednote/i, description: /小红书|xiaohongshu|rednote/i },
  { idea: /旅行|行程|旅游|travel|trip/i, description: /旅行|行程|旅游|travel|trip/i },
  { idea: /竞品|产品分析|product analysis/i, description: /竞品|产品|product/i },
];

export function descriptionCoversSpecificDomain(description: string, idea: string) {
  const signal = SPECIFIC_DOMAIN_SIGNALS.find((item) => item.idea.test(idea));
  return !signal || signal.description.test(description);
}

export function descriptionWorkflowScopeMismatches(skill: string) {
  const description = skill.match(/^description:\s*([^\n]+)$/m)?.[1]?.replace(/^['"]|['"]$/g, "") || "";
  const body = skill.replace(/^---\s*\n[\s\S]*?\n---(?:\s*\n|$)/, "");
  const intents = [
    { label: "生成完整内容", promised: /创作|生成(?:标题|正文|内容|文案)|write|create|generate/i, implemented: /创作|生成|起草|write|draft|create/i },
    { label: "改写或优化已有内容", promised: /改写|修改|优化已有|润色|rewrite|edit|revise|polish/i, implemented: /改写|修改|优化|润色|rewrite|edit|revise|polish/i },
    { label: "压缩或精简", promised: /压缩|精简|缩短|摘要|shorten|condense|summari[sz]e/i, implemented: /压缩|精简|缩短|摘要|shorten|condense|summari[sz]e/i },
    { label: "只生成标题", promised: /(?:只|仅|单独|独立).{0,8}标题|标题.{0,8}(?:即可|就行|only)|(?:title|headline)(?:-only|\s+only)|only.{0,8}(?:title|headline)/i, implemented: /仅.{0,8}标题|标题.{0,16}(?:分支|任务|生成)|title|headline/i },
    { label: "内容结构", promised: /内容结构|结构设计|outline|structure/i, implemented: /结构|大纲|outline|structure/i },
  ];
  return intents.filter((intent) => intent.promised.test(description) && !intent.implemented.test(body)).map((intent) => intent.label);
}

/**
 * Close common frontmatter trigger promises into explicit runtime branches.
 * These branches are deterministic contract glue, so generation should not
 * spend another model round (or ask the user) to add them.
 */
export function ensureDescriptionWorkflowScopeBranches(skill: string) {
  const missing = new Set(descriptionWorkflowScopeMismatches(skill));
  if (!missing.size) return skill;

  const branches = [
    missing.has("生成完整内容") ? "- 当用户要求从零创作或生成完整内容时，读取现有材料与约束，按输出契约完成完整结果；不要只返回局部片段。" : "",
    missing.has("改写或优化已有内容") ? "- 当用户提供已有内容并要求改写、润色或优化时，保留仍然有效的信息，只修改用户要求的范围，并交付修改后的完整可用版本。" : "",
    missing.has("压缩或精简") ? "- 当用户要求压缩、精简、缩短或摘要时，保留核心事实与意图，删除重复和低价值内容，并按用户要求的长度或格式交付。" : "",
    missing.has("只生成标题") ? "- 当用户只要求标题时，进入仅标题分支：仅生成标题候选，不强制附带正文、标签或其他完整内容；若数量或风格未说明，给出少量有明显差异的候选。" : "",
    missing.has("内容结构") ? "- 当用户只要求内容结构、大纲或结构设计时，先交付可执行的结构与各部分目的，不擅自扩写成完整正文。" : "",
  ].filter(Boolean);
  if (!branches.length) return skill;

  const section = `## Trigger-to-workflow branches\n\n${branches.join("\n")}`;
  const outputHeading = skill.search(/\n##\s+(?:Output|Deliverable|Output contract|交付|输出)/i);
  if (outputHeading >= 0) return `${skill.slice(0, outputHeading).trimEnd()}\n\n${section}\n${skill.slice(outputHeading)}`;
  return `${skill.trimEnd()}\n\n${section}`;
}

export function hasUnsafeDeterministicFallback(text: string) {
  return /(?:LLM|大模型|模型).{0,16}(?:手动)?(?:计算|处理|生成|导出)|手动计算/i.test(text);
}

export function hasUnsafeDynamicExecution(text: string) {
  return /\b(?:eval|exec)\s*\(|\bos\.system\s*\(|\bshell\s*=\s*True\b/i.test(text);
}

export function hasUnboundedFormulaParser(text: string) {
  if (!/\bast\.parse\s*\(/i.test(text)) return false;
  return !/len\s*\(\s*(?:expr|expression|formula)\s*\)\s*>|MAX_(?:EXPRESSION|FORMULA)_(?:LENGTH|SIZE)|(?:expression|formula).{0,24}(?:too long|长度上限|过长)/i.test(text);
}

function pythonFunctionBody(text: string, functionName: string) {
  const start = text.search(new RegExp(`^def\\s+${functionName}\\s*\\([^\\n]*\\):\\n`, "m"));
  if (start < 0) return "";
  const bodyStart = text.indexOf("\n", start) + 1;
  const tail = text.slice(bodyStart);
  const nextTopLevel = tail.search(/^(?:def|class)\s+/m);
  return nextTopLevel < 0 ? tail : tail.slice(0, nextTopLevel);
}

function pythonTestMethods(text: string) {
  const starts = Array.from(text.matchAll(/^ {4}def\s+test_[A-Za-z0-9_]+\s*\(self[^\n]*\):/gm)).map((match) => match.index || 0);
  return starts.map((start, index) => {
    const nextMethod = starts[index + 1] ?? text.length;
    const tail = text.slice(start, nextMethod);
    const classOrMain = tail.slice(1).search(/^(?:class\s+|if __name__)/m);
    return classOrMain < 0 ? tail : tail.slice(0, classOrMain + 1);
  });
}

export function pythonScriptTestContractIssues(scriptText: string, testText: string, scriptModule = "process_data") {
  const issues: string[] = [];
  if (/\bmain\s*\(\s*\[/m.test(testText) && /def\s+main\s*\(\s*\)\s*:/m.test(scriptText)) {
    issues.push("脚本测试会向 main 传入参数，但脚本入口不接收 argv");
  }
  const testMethods = pythonTestMethods(testText);
  const unsafeFormulaTests = testMethods.filter((method) => (
    /__import__\s*\(|\bos\.system\s*\(|\beval\s*\(|\bexec\s*\(|test_(?:call_attempt|formula_injection|unsafe_formula)/i.test(method)
  ));
  const expectsInvalidFormulaExit = unsafeFormulaTests.some((method) => (
    /assertRaises\s*\(\s*SystemExit\s*\)/i.test(method) && /main\s*\(/i.test(method)
  ));
  const swallowsFormulaError = /except\s+(?:\([^)]*ValueError[^)]*\)|ValueError)[^:]*:\s*[\s\S]{0,420}row\s*\[/i.test(scriptText);
  const rowLoopIndex = scriptText.search(/for\s+row\s+in\s+data\s*:/i);
  const preflightIndex = scriptText.search(/(?:compute_rate|validate_formula_ast|parse_formula)\s*\(\s*args\.formula\b/i);
  const validatesBeforeRows = preflightIndex >= 0
    && rowLoopIndex >= 0
    && preflightIndex < rowLoopIndex
    && /sys\.exit\s*\(\s*[1-9]/i.test(scriptText.slice(preflightIndex, rowLoopIndex));
  if (expectsInvalidFormulaExit && swallowsFormulaError && !validatesBeforeRows) issues.push("脚本与测试对非法公式的处理不一致：一个继续标记，另一个期待停止");
  const computeRateBody = pythonFunctionBody(scriptText, "compute_rate");
  const computeRateReturnsNone = /except\s+(?:\([^)]*ValueError[^)]*\)|ValueError)[^:]*:\s*[\s\S]{0,240}return\s+None\b/i.test(computeRateBody);
  const expectsComputeRateRaise = unsafeFormulaTests.some((method) => (
    /assertRaises\s*\(\s*ValueError\s*\)/i.test(method) && /compute_rate\s*\(/i.test(method)
  ));
  if (computeRateReturnsNone && expectsComputeRateRaise) issues.push("安全公式测试与 compute_rate 的返回契约不一致：函数返回空值，测试却期待抛出异常");
  const scriptExports = new Set(Array.from(scriptText.matchAll(/^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm)).map((match) => match[1]));
  const misplacedImports = Array.from(testText.matchAll(/^from\s+([A-Za-z0-9_.]+)\s+import\s+([^\n]+)$/gm)).flatMap((match) => {
    const moduleName = match[1].split(".").pop() || match[1];
    if (moduleName === scriptModule) return [];
    return match[2].split(",").map((name) => name.trim().split(/\s+as\s+/i)[0]).filter((name) => scriptExports.has(name));
  });
  if (misplacedImports.length) issues.push(`测试把脚本函数错误地从其他模块导入：${[...new Set(misplacedImports)].join("、")}`);
  return issues;
}

export function reconcileFormulaSecurityTest(scriptText: string, testText: string) {
  if (!/def\s+compute_rate\s*\(/m.test(scriptText) || !/def\s+test_call_attempt\s*\(/m.test(testText)) return testText;
  let next = testText.replace(/^(from\s+(?!(?:scripts\.)?process_data\b)[A-Za-z0-9_.]+\s+import\s+)([^\n]+)$/gm, (line, prefix: string, names: string) => {
    if (!/\bcompute_rate\b/.test(names)) return line;
    const cleaned = names.split(",").map((name) => name.trim()).filter((name) => name !== "compute_rate");
    return `${prefix}${cleaned.join(", ")}`;
  });
  next = next.replace(/^(from\s+(?:scripts\.)?process_data\s+import\s+)([^\n]+)$/m, (line, prefix: string, names: string) => {
    return /\bcompute_rate\b/.test(names) ? line : `${prefix}${names.trim()}, compute_rate`;
  });
  const computeRateBody = pythonFunctionBody(scriptText, "compute_rate");
  const returnsNone = /except\s+(?:\([^)]*ValueError[^)]*\)|ValueError)[^:]*:\s*[\s\S]{0,240}return\s+None\b/i.test(computeRateBody);
  const assertion = returnsNone
    ? `self.assertIsNone(compute_rate(\n                '({likes}+{comments}+{shares})/{followers} + __import__("os")',\n                100, 10, 5, 10000,\n            ))`
    : `with self.assertRaises(ValueError):\n            compute_rate(\n                '({likes}+{comments}+{shares})/{followers} + __import__("os")',\n                100, 10, 5, 10000,\n            )`;
  next = next.replace(
    /\n {4}def test_call_attempt\(self\):\n[\s\S]*?(?=\n {4}def |\nif __name__|$)/,
    `\n    def test_call_attempt(self):\n        ${assertion}`,
  );
  return next;
}

/** Generated tests must invoke the interpreter that is already running the
 * suite. A bare `python` executable is not portable across macOS, Linux,
 * containers, or isolated runners and can make valid business logic look
 * broken before it is ever exercised. */
export function reconcilePythonTestInterpreter(testText: string) {
  const needsSystemInterpreter = /subprocess\.(?:run|Popen|call|check_call|check_output)\s*\(\s*\[\s*["']python(?:3)?["']/m.test(testText);
  if (!needsSystemInterpreter) return testText;
  let next = testText;
  if (!/^import\s+sys\s*$/m.test(next) && !/^from\s+sys\s+import\s+/m.test(next)) {
    const importBlock = [...next.matchAll(/^(?:import\s+[^\n]+|from\s+[^\n]+\s+import\s+[^\n]+)$/gm)];
    const insertion = importBlock.length ? (importBlock.at(-1)?.index || 0) + (importBlock.at(-1)?.[0].length || 0) : 0;
    next = `${next.slice(0, insertion)}${insertion ? "\n" : ""}import sys${insertion ? "" : "\n"}${next.slice(insertion)}`;
  }
  return next.replace(/(subprocess\.(?:run|Popen|call|check_call|check_output)\s*\(\s*\[\s*)["']python(?:3)?["']/gm, "$1sys.executable");
}

export function pythonOutputContractIssues(scriptText: string, contractText: string) {
  const removesOriginalColumns = /row\s*\[\s*new\s*\]\s*=\s*row\.pop\(\s*old\s*\)/i.test(scriptText);
  const restoresOriginalColumns = /row\s*\[\s*(?:old|original)\s*\]\s*=\s*row\.pop\(\s*(?:new|normalized)\s*\)|reverse_field_map|restore.{0,24}(?:field|column)/i.test(scriptText);
  const requiresArtifactColumns = /##\s+Required content[\s\S]{0,1200}(?:^|\n)\s*-\s+\S+/im.test(contractText);
  return removesOriginalColumns && requiresArtifactColumns && !restoresOriginalColumns
    ? ["脚本标准化字段时移除了原始列名，但导出前没有恢复输出契约要求的列"]
    : [];
}

export function reconcilePythonOutputContract(scriptText: string, contractText: string) {
  if (!pythonOutputContractIssues(scriptText, contractText).length) return scriptText;
  const restoreBlock = [
    "    # Restore the contract-facing column names before export.",
    "    for row in data:",
    "        for original, normalized in field_map.items():",
    "            if normalized in row:",
    "                row[original] = row.pop(normalized)",
    "",
  ].join("\n");
  const outputMarker = /^(\s{4}#\s*(?:输出|export|write output)[^\n]*\n)/im;
  if (outputMarker.test(scriptText)) return scriptText.replace(outputMarker, `${restoreBlock}$1`);
  const writeCall = /^(\s{4}(?:write_csv|write_excel|write_output)\s*\()/m;
  return writeCall.test(scriptText) ? scriptText.replace(writeCall, `${restoreBlock}$1`) : scriptText;
}

export function runtimeFileMentions(text: string) {
  return [...new Set(text.match(/\b(?:references|scripts|assets|integrations)\/[A-Za-z0-9_./-]+\.(?:md|json|py|csv|tsv|txt|yaml|yml|html|xlsx?)\b/g) || [])];
}

function numericPolicyTokens(text: string) {
  return (text.match(/\d+(?:\.\d+)?\s*(?:%|％|元|万|天|小时|分钟|次|分)?/g) || [])
    .map((token) => token.replace(/\s+/g, "").toLowerCase());
}

export function findUnconfirmedOperationalDefaults(runtimeText: string, confirmedText: string, checkFormula = true) {
  const confirmed = confirmedText.replace(/\s+/g, "").toLowerCase();
  const confirmedTokens = new Set(numericPolicyTokens(confirmedText));
  const operationalField = /阈值|比例|权重|预算|时限|期限|数量|分数|公式|分母|threshold|ratio|weight|budget|deadline|formula|denominator/i;
  const defaultMarker = /默认|缺省|未提供.{0,16}(?:使用|设为|按)|default\s*=|default value/i;
  const formulaMarker = /(?:公式|formula)\s*(?:为|是|[:：=]).*(?:\/|\*|\+|-)/i;

  return runtimeText.split("\n").flatMap((line) => {
    const compact = line.replace(/\s+/g, "").toLowerCase();
    const formulaPending = /待确认|需要.{0,12}确认|请.{0,12}确认|确认后|用户.{0,24}确认.{0,40}后(?:才)?|候选(?:公式|规则)|仅作示例/i.test(line);
    if (checkFormula && formulaMarker.test(line) && !confirmed.includes(compact.replace(/^[#>*\-\d.)、]+/, ""))) return formulaPending ? [] : [line.trim().replace(/\s+/g, " ").slice(0, 180)];
    const explicitlyPending = /待确认|需要.{0,12}确认|请.{0,12}确认|确认后|作为.{0,12}参数|必填参数|必须.{0,12}(?:提供|指定|传入)|候选(?:公式|规则)|仅作示例|不设默认|不得.{0,12}默认|不使用默认|without a default|user[- ]provided|required\s*(?:=|:)\s*true|required (?:argument|parameter)/i.test(line);
    if (explicitlyPending) return [];
    if (!operationalField.test(line) || !defaultMarker.test(line)) return [];
    const tokens = numericPolicyTokens(line);
    return tokens.length > 0 && tokens.some((token) => !confirmedTokens.has(token))
      ? [line.trim().replace(/\s+/g, " ").slice(0, 180)]
      : [];
  });
}

export function hasUnconfirmedOperationalDefaults(runtimeText: string, confirmedText: string, checkFormula = true) {
  return findUnconfirmedOperationalDefaults(runtimeText, confirmedText, checkFormula).length > 0;
}

export function markUnconfirmedFormulasPending(runtimeText: string, confirmedText: string) {
  const confirmed = confirmedText.replace(/\s+/g, "").toLowerCase();
  const formulaMarker = /(?:公式|formula)\s*(?:为|是|[:：=]).*(?:\/|\*|\+|-)/i;
  const pendingMarker = /待确认|需要.{0,12}确认|请.{0,12}确认|确认后|候选(?:公式|规则)|仅作示例/i;

  return runtimeText.split("\n").map((line) => {
    const compact = line.replace(/\s+/g, "").toLowerCase().replace(/^[#>*\-\d.)、]+/, "");
    if (!formulaMarker.test(line) || pendingMarker.test(line) || confirmed.includes(compact)) return line;

    const candidate = line
      .replace(/公式\s*(?:为|是|[:：=])/i, "候选公式为")
      .replace(/formula\s*(?:is|[:=])/i, "candidate formula: ");
    return `${candidate}（待确认；运行前必须请用户确认公式，未确认则停止计算。）`;
  }).join("\n");
}

export function findUnconfirmedScriptComparisons(scriptText: string, confirmedText: string) {
  const confirmedTokens = new Set((confirmedText.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) || []).map((token) => token.toLowerCase()));
  const normalizedConfirmed = confirmedText.replace(/\s+/g, "").toLowerCase();
  const lines = scriptText.split("\n");
  return lines.flatMap((line, index) => {
    const safetyBound = /len\s*\(\s*(?:expr|expression|formula|payload|content|source|text)\b|(?:expression|formula|parser|ast).{0,24}(?:length|size|depth|nodes|长度|深度|节点)/i.test(line);
    if (safetyBound) return [];
    const nearby = lines.slice(Math.max(0, index - 3), index + 1).join(" ");
    const categoricalWeights = [...line.matchAll(/["']([^"']{1,32})["']\s*:\s*(-?\d+(?:\.\d+)?)/g)];
    if (categoricalWeights.length >= 2
      && /priority|rank|severity|level|tier|order|score|优先级|等级|排序|权重/i.test(nearby)
      && !/待确认|用户.{0,12}提供|参数|argument|config/i.test(nearby)) {
      const labels = categoricalWeights.map((match) => match[1].replace(/\s+/g, "").toLowerCase());
      if (labels.some((label) => label.length >= 1 && !normalizedConfirmed.includes(label))) {
        return [line.trim().replace(/\s+/g, " ").slice(0, 180)];
      }
    }
    const tokens = Array.from(line.matchAll(/[<>]=?\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi)).map((match) => match[1].toLowerCase());
    const unsupported = tokens.filter((token) => Number(token) !== 0 && !confirmedTokens.has(token));
    return unsupported.length ? [line.trim().replace(/\s+/g, " ").slice(0, 180)] : [];
  });
}

export function demoteUnsupportedConfirmationClaims(text: string, confirmedText: string) {
  return text.split("\n").map((line) => {
    const unsupported = findUnconfirmedOperationalDefaults(line, confirmedText).length > 0;
    if (!unsupported || !/(?:此(?:公式|规则))?已由用户确认|用户已确认/i.test(line)) return line;
    return line
      .replace(/(?:此(?:公式|规则))?已由用户确认[^。.!！\n]*[。.!！]?/gi, "该规则是候选方案，运行前必须请用户确认；若用户选择其他规则，则按其选择配置后再运行。")
      .replace(/用户已确认[^。.!！\n]*[。.!！]?/gi, "该规则是候选方案，运行前必须请用户确认；若用户选择其他规则，则按其选择配置后再运行。");
  }).join("\n");
}

export function reconcileDataMutationPolicy(text: string, confirmedText: string) {
  const forbidsMutation = /仅标记.{0,24}(?:不修改|不补全|不猜测)|不修改原始数据|标记缺失.{0,24}不(?:自行)?猜测/i.test(confirmedText);
  if (!forbidsMutation) return text;
  return text
    .replace(/允许[^。.!！\n]{0,80}(?:缺失值|缺失数据)[^。.!！\n]{0,80}(?:估算|补全|填充)[^。.!！\n]*[。.!！]?/gi, "缺失值只做标记，不进行任何估算或补写，也不修改原始数据。")
    .replace(/(?:用|使用)(?:\s*0|零|平均值|中位数)[^。.!！\n]{0,40}(?:填充|补全|估算)(?:缺失值|缺失数据)[^。.!！\n]*[。.!！]?/gi, "缺失值只做标记，不进行估算或补写。 ");
}

export function hasDataMutationPolicyConflict(text: string, confirmedText: string) {
  const forbidsMutation = /仅标记.{0,24}(?:不修改|不补全|不猜测)|不修改原始数据|标记缺失.{0,24}不(?:自行)?猜测/i.test(confirmedText);
  if (!forbidsMutation) return false;
  return text.split(/[。.!！\n]+/).some((sentence) => (
    /(?:缺失值|缺失数据).{0,60}(?:用\s*0|平均值|中位数|估算|补全|填充)/i.test(sentence)
    && !/不(?:进行)?(?:任何)?(?:估算|补写|补全|填充|猜测)|不用\s*0|不使用(?:平均值|中位数)/i.test(sentence)
  ));
}

export function hasInstructionPriorityOrder(text: string) {
  const currentPattern = /(?:current.{0,24}explicit|explicit.{0,24}current|(?:当前|本次).{0,24}明确)/i;
  const reusablePattern = /(?:confirmed.{0,30}(?:reusable|preference|rule)|已确认.{0,30}(?:长期|可复用|偏好|规则))/i;
  const examplePattern = /(?:approved.{0,18}example|user.{0,18}example|用户.{0,18}示例|批准.{0,18}示例|示例)/i;
  const inferencePattern = /(?:working.{0,18}inference|inference|工作.{0,18}推断|推断)/i;
  let searchFrom = 0;

  while (searchFrom < text.length) {
    const current = markerIndexAfter(text, currentPattern, searchFrom);
    if (current < 0) return false;
    const reusable = markerIndexAfter(text, reusablePattern, current + 1);
    const example = reusable < 0 ? -1 : markerIndexAfter(text, examplePattern, reusable + 1);
    const inference = example < 0 ? -1 : markerIndexAfter(text, inferencePattern, example + 1);
    if (reusable > current && example > reusable && inference > example && inference - current <= 2_000) return true;
    searchFrom = current + 1;
  }
  return false;
}

export function ensureInstructionPriorityOrder(text: string) {
  const prioritySections = /(?:^|\n)##\s+(?:Instruction priority|指令优先级)\s*\n[\s\S]*?(?=\n##\s|$)/gi;
  const matches = Array.from(text.matchAll(prioritySections));
  if (matches.length <= 1 && hasInstructionPriorityOrder(text)) return text;
  const generatedPriorityLines = /(?:^|\n)\s*[1-5][.)、]\s*(?:Current explicit task instructions|Confirmed reusable preferences|User-approved examples|Working inferences|Generic defaults|当前(?:任务中的)?明确(?:的)?(?:任务)?指令|已确认的(?:可复用|长期)偏好|用户批准的示例|工作推断|通用默认值)[^\n]*(?=\n|$)/gi;
  const withoutGeneratedPriority = text
    .replace(prioritySections, "\n")
    .replace(generatedPriorityLines, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return `${withoutGeneratedPriority}\n\n## Instruction priority\n\n1. Current explicit task instructions override every lower-priority source.\n2. Confirmed reusable preferences apply only when they do not conflict with the current task.\n3. User-approved examples guide structure and expression without creating requirements the user did not state.\n4. Working inferences remain provisional and must yield to confirmed information.\n5. Generic defaults apply only when the higher-priority sources are silent.`;
}

export function persistenceSignals(text: string) {
  const sentences = text.split(/[\n。！？!?]+/).map((item) => item.trim()).filter(Boolean);
  let allowsPersistence = false;
  let forbidsPersistence = false;

  for (const sentence of sentences) {
    const mentionsPersistence = /(?:persist|save|store|remember|长期保存|持久化|写入状态|记住).{0,80}(?:context|source|preference|personal|资料|偏好|个人)/i.test(sentence);
    if (!mentionsPersistence) continue;
    const isNegated = /(?:never|do not|must not|should not|don't|won't|不得|禁止|不要|不会|不应|不再|不可|不予|不).{0,40}(?:persist|save|store|remember|长期保存|持久化|写入|记住)/i.test(sentence);
    if (isNegated) forbidsPersistence = true;
    else allowsPersistence = true;
  }

  return { allowsPersistence, forbidsPersistence };
}

export function hasUnsupportedPersistenceConflict(text: string, stateScope: string) {
  if (stateScope !== "none") return false;
  const signals = persistenceSignals(text);
  return signals.allowsPersistence && signals.forbidsPersistence;
}

export function compareGateBlockers(before: string[], after: string[]): GateBlockerDiff {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const resolved = before.filter((item) => !afterSet.has(item));
  const introduced = after.filter((item) => !beforeSet.has(item));
  return {
    resolved,
    introduced,
    improvedWithoutRegression: resolved.length > 0 && introduced.length === 0,
  };
}
