const CHECKPOINT_SIGNAL = /确认|询问|审批|复核|review|approve/i;
const PRODUCTIVE_FIRST_SIGNAL = /(?:先|先行)(?:交付|给|给出|展示|提供|生成|完成).{0,16}(?:可用结果|结果|草稿|初稿|初版|预览|demo)/i;
const MISSING_DECISION_SIGNAL = /(?:未提供|缺少|未确认|尚未).{0,24}(?:规则|标准|偏好|选择|选项|取值|决策|优先级|格式|范围|权限|审批|确认)/i;
const MISSING_CORE_SOURCE_SIGNAL = /(?:未提供|没有提供|缺少|尚无).{0,18}(?:输入(?:文件|数据|材料|内容)?|源材料|原始材料|原始记录|待处理(?:数据|文件|内容)|source material|source data|input file)/i;
const PLACEHOLDER_WITHOUT_SOURCE_SIGNAL = /(?:先|仍|也)(?:应|要|可)?(?:产出|生成|建立|创建|交付).{0,50}(?:占位|临时|草稿|模板|表头)|(?:占位行|placeholder rows?)/i;

function rewriteMissingCoreSourceContradiction(line: string) {
  if (!MISSING_CORE_SOURCE_SIGNAL.test(line) || !PLACEHOLDER_WITHOUT_SOURCE_SIGNAL.test(line)) return line;
  const branch = line.match(/^(\s*-\s+\*\*[^*]+\*\*[:：]?)/);
  if (branch) return `${branch[1]} 请求用户提供当前任务所需的核心文件、数据或源内容；停止依赖这些材料的执行，不创建占位记录或伪造任务结果。`;
  const prefix = line.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)?/)?.[0] || "";
  return `${prefix}如果核心文件、数据或源内容尚未提供，只请求当前最小必要材料；停止依赖这些材料的执行，不创建占位记录或伪造任务结果。`;
}

/** A productive checkpoint is a user-confirmed collaboration contract, not a
 * universal generator default. It is enabled only when the user asked both
 * for a checkpoint and for useful work to be shown before that checkpoint. */
export function productiveCheckpointRequested(answers: Record<string, string>) {
  const evidence = [answers.autonomy, answers.boundary, answers["delivery-checkpoint"], answers.workflow]
    .filter(Boolean)
    .join("；");
  return CHECKPOINT_SIGNAL.test(evidence) && PRODUCTIVE_FIRST_SIGNAL.test(evidence);
}

export function ensureProductiveCheckpointContract(skill: string, answers: Record<string, string>) {
  const withoutGeneratedSection = skill
    .replace(/\n## Productive checkpoint contract\s*\n[\s\S]*?(?=\n## |$)/gi, "")
    .replace(/\n?> Productive checkpoint execution \(compiler-owned\)\n(?:>.*\n?)*/gi, "\n")
    .trim();
  if (!productiveCheckpointRequested(answers)) return withoutGeneratedSection;

  const productivePause = "先完成并展示所有不依赖该决策的可逆部分，将仅受该决策影响的字段标记为“待确认”，再询问";
  let strengthened = withoutGeneratedSection.split("\n").map((sourceLine) => {
    const line = rewriteMissingCoreSourceContradiction(sourceLine);
    const runtimeBranch = line.match(/^(\s*-\s+\*\*If\s+(.+?):\*\*)\s*(.*)$/i);
    if (runtimeBranch && MISSING_DECISION_SIGNAL.test(runtimeBranch[2])) {
      return `${runtimeBranch[1]} 先完成并展示所有不依赖该决策的可逆部分，并将受影响字段标为 \`待确认\`。Then 只暂停依赖该值的最终化步骤，并询问一个当前最小必要问题；不得停止整个工作流。`;
    }
    if (!CHECKPOINT_SIGNAL.test(line) || !/暂停/.test(line) || /不依赖该决策|可逆部分/.test(line)) return line;
    return line.replace(/暂停(?:处理)?(?:并|[，,])?\s*(?:向用户)?询问/g, productivePause);
  }).join("\n");

  const executionRoute = [
    "> Productive checkpoint execution (compiler-owned)",
    "> - This route begins only after the core source material exists. If it is missing, ask only for that material and stop dependent execution; do not emit placeholder records or pretend a task result exists.",
    "> - If a required decision is missing, produce a concrete provisional result before asking: render every requested text-representable format, include its confirmed headers, and mark only decision-dependent cells or sections as `待确认`.",
    "> - A copyable Markdown table, CSV code block, JSON object, or equivalent provisional representation counts as usable work when the host cannot create the final file; never claim a file was written when it was not.",
    "> - Then ask one minimum-necessary question. After the answer, recompute only the dependent fields and finalize the affected output.",
  ].join("\n");
  const workflowHeading = strengthened.match(/(^|\n)(## (?:Executable )?Workflow\s*\n)/i);
  if (workflowHeading?.index !== undefined) {
    const routeInsertion = workflowHeading.index + workflowHeading[0].length;
    strengthened = `${strengthened.slice(0, routeInsertion)}\n${executionRoute}\n\n${strengthened.slice(routeInsertion).replace(/^\s+/, "")}`.trim();
  } else {
    strengthened = `${strengthened}\n\n${executionRoute}`;
  }

  const section = [
    "## Productive checkpoint contract",
    "",
    "- This contract starts after the core task material exists. If the source material itself is missing, ask only for that current dependency first; do not invent placeholder rows or bundle later decisions into the same question.",
    "- When a missing decision blocks only part of the task, finish and show every reversible part that does not depend on that decision.",
    "- The partial deliverable must contain concrete rows or sections for every requested output format that can be represented in text, including its confirmed headers; do not return only a question, plan, or one of several requested formats.",
    "- Mark only decision-dependent fields or finalization steps as `待确认`; do not pretend the value was supplied and do not select a hidden default.",
    "- Ask one focused minimum-necessary question after the partial deliverable. Once answered, recompute only the affected portion.",
    "- Any later instruction to ‘pause’ means pause the dependent finalization step, not the entire workflow or all usable output.",
  ].join("\n");
  const insertion = strengthened.search(/\n## (?:Runtime branches|Decision branches|Failure branches|运行时分支|决策分支|失败分支)\b/i);
  if (insertion >= 0) return `${strengthened.slice(0, insertion).trimEnd()}\n\n${section}\n${strengthened.slice(insertion)}`;
  return `${strengthened}\n\n${section}`;
}

export function ensureConfirmedCorrectionContract(skill: string, answers: Record<string, string>) {
  const withoutGeneratedSection = skill
    .replace(/\n## Confirmed runtime corrections\s*\n[\s\S]*?(?=\n## |$)/gi, "")
    .trim();
  const corrections = (answers.__previewFeedback || "")
    .split(/[；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
  if (!corrections.length) return withoutGeneratedSection;
  const laterChoices = [
    ["交付格式", answers["output-format"]],
    ["工作方式", answers.workflow],
    ["缺失信息处理", answers["input-strategy"]],
    ["协作边界", answers.boundary || answers.autonomy],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]?.trim())).slice(0, 4);
  const section = [
    "## Confirmed runtime corrections",
    "",
    "These are explicit corrections from a prior real-task preview. Apply them as current requirements; do not silently restore the rejected behavior:",
    ...corrections.map((item) => `- ${item}`),
    "- Preview feedback identifies the observed failure. When a later structured answer specifies its concrete implementation, the later answer is authoritative; do not broaden an earlier phrase beyond that later choice.",
    ...laterChoices.map(([label, value]) => `- Later confirmed ${label}: ${value}`),
  ].join("\n");
  const insertion = withoutGeneratedSection.search(/\n## Productive checkpoint contract\b/i);
  if (insertion >= 0) return `${withoutGeneratedSection.slice(0, insertion).trimEnd()}\n\n${section}\n${withoutGeneratedSection.slice(insertion)}`;
  return `${withoutGeneratedSection}\n\n${section}`;
}

/** Compile the user's missing-information permission into a runtime data-flow
 * contract. Permission to infer or expand content does not make an inferred
 * value an observed fact; downstream rankings and calculations must preserve
 * that provenance so a later user correction can be applied safely. */
export function ensureInformationDependencyContract(skill: string, answers: Record<string, string>) {
  const withoutGeneratedSection = skill
    .replace(/\n## Information dependency contract\s*\n[\s\S]*?(?=\n## |$)/gi, "")
    .trim();
  const evidence = `${answers["input-strategy"] || ""} ${answers.workflow || ""} ${answers.boundary || ""} ${answers["content-policy"] || ""}`.trim();
  if (!/(?:缺失|不足|未知|推断|估算|补写|补全|扩写|待确认)/i.test(evidence)) return withoutGeneratedSection;
  const inferenceAllowed = /(?:允许|可以|可|先|合理|适当).{0,12}(?:推断|估算|补写|补全|扩写|增加)|(?:推断|估算).{0,12}(?:并|但|同时).{0,12}(?:标注|备注|确认)/i.test(evidence)
    && !/(?:禁止|不得|不要|不能|不允许).{0,12}(?:推断|估算|补写|补全|扩写|增加)/i.test(evidence);
  const missingAction = inferenceAllowed
    ? "When the confirmed permission allows inference, produce the inferred value, label it as inferred in the nearest output field or note, record the basis, and include it in the assumptions/confirmation list."
    : "When inference is not confirmed, keep the dependent field as `待确认` and ask only when that value blocks the next step.";
  const section = [
    "## Information dependency contract",
    "",
    "- Before ranking, calculating, rewriting, or finalizing an output field, identify whether every required value is user-explicit, source-grounded, inferred, or unknown.",
    `- ${missingAction}`,
    "- Never present an inferred value as if it appeared in the user's material. A later explicit correction replaces the inference and triggers recomputation only of dependent fields.",
    "- Apply this contract to later conversation turns too: a newly supplied rule does not supply the data fields that rule needs.",
  ].join("\n");
  const insertion = withoutGeneratedSection.search(/\n## (?:Productive checkpoint contract|Runtime branches|Decision branches|Failure branches)\b/i);
  if (insertion >= 0) return `${withoutGeneratedSection.slice(0, insertion).trimEnd()}\n\n${section}\n${withoutGeneratedSection.slice(insertion)}`;
  return `${withoutGeneratedSection}\n\n${section}`;
}

export function confirmedCorrectionEvalEvidence(answers: Record<string, string>) {
  const feedback = (answers.__previewFeedback || "").trim();
  if (!feedback) return "";
  const laterChoices = [
    answers["output-format"] ? `交付格式=${answers["output-format"].trim()}` : "",
    answers.workflow ? `工作方式=${answers.workflow.trim()}` : "",
    answers["input-strategy"] ? `缺失信息处理=${answers["input-strategy"].trim()}` : "",
  ].filter(Boolean).join("；");
  return laterChoices
    ? `预演纠正=${feedback}；后续结构化确认=${laterChoices}。后续确认决定具体实现，不把早期宽泛措辞扩展成额外要求`
    : feedback;
}

/** Compile every user-confirmed field mention for one machine-readable format
 * into a single canonical schema. Interview answers often mention the main
 * columns in one clause and an extra column later; leaving those fragments in
 * different layers makes scripts, artifacts, and graders disagree even though
 * the user was consistent. */
export function confirmedOutputFields(value: string, format = "CSV") {
  const formatPattern = new RegExp(format.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const fields = value
    .split(/[；;\n]/)
    .filter((clause) => formatPattern.test(clause))
    .flatMap((clause) => {
      const tail = clause.match(/(?:字段(?:为|包括|包含)?|列(?:为|包括|包含)?|包括|包含)[:：]?\s*(.+)$/i)?.[1] || "";
      return tail
        .replace(/[。.!！]+$/g, "")
        .split(/[、，,]|\s+(?:和|及)\s+/)
        .map((field) => field.trim().replace(/^(?:CSV|Excel)\s*/i, ""))
        .map((field) => field.replace(/(.{2,16})\s*或\s*(.{1,12})$/, "$1/$2"))
        .filter((field) => field.length >= 1 && field.length <= 40);
    });
  return Array.from(new Set(fields));
}

/** Replace shorter model-authored display aliases (for example 分类/标签)
 * with the exact confirmed contract label (需求分类/标签). The matcher only
 * accepts slash-separated labels whose parts are exact suffixes, so ordinary
 * prose and internal machine keys remain untouched. */
export function reconcileContractFacingFieldLabels(text: string, confirmedFields: string[]) {
  const aliases = Array.from(text.matchAll(/[\p{L}\p{N}_-]{1,24}(?:\/[\p{L}\p{N}_-]{1,24})+/gu)).map((match) => match[0]);
  let next = text;
  confirmedFields.forEach((confirmed) => {
    const confirmedParts = confirmed.split("/").map((part) => part.trim()).filter(Boolean);
    if (confirmedParts.length < 2) return;
    // Collapse a prefix accidentally applied twice by an older compiler run.
    // This makes the reconciliation pass idempotent across restore/build loops.
    for (let prefixLength = 1; prefixLength < Math.min(7, confirmedParts[0].length); prefixLength += 1) {
      const prefix = confirmedParts[0].slice(0, prefixLength);
      const duplicated = `${prefix}${confirmed}`;
      next = next.replace(new RegExp(duplicated.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), confirmed);
    }
    const alias = aliases.find((candidate) => {
      if (candidate === confirmed) return false;
      const candidateParts = candidate.split("/").map((part) => part.trim()).filter(Boolean);
      return candidateParts.length === confirmedParts.length
        && candidateParts.every((part, index) => part.length >= 1 && confirmedParts[index].endsWith(part));
    });
    if (!alias) return;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(`(?<![\\p{L}\\p{N}_/-])${escaped}(?![\\p{L}\\p{N}_/-])`, "gu"), confirmed);
  });
  return next;
}

/** Build a deterministic, clearly synthetic completion for a numeric decision
 * branch when the representative fixture intentionally postpones its scores.
 * This does not invent user facts: the values live only inside the Eval case
 * and exist to prove that the post-confirmation calculation branch runs. */
export function completedNumericDecisionFixture(representativeInput: string) {
  if (!/(?:稍后提供|待补充|尚未提供|未提供).{0,16}(?:评分|分数)|(?:评分|分数).{0,16}(?:稍后提供|待补充|尚未提供|未提供)/i.test(representativeInput)) return "";
  const weightClause = representativeInput.match(/(?:权重(?:为|是)?|加权(?:规则|公式)?)[：:]?\s*([^。\n]+)/i)?.[1] || "";
  const dimensions = Array.from(weightClause.matchAll(/([\p{L}][\p{L}\p{N}_/-]{0,15})\s*(?:=|[：:])?\s*(?:0?\.\d+|\d+%)/gu))
    .map((match) => match[1].trim())
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 6);
  if (dimensions.length < 2) return "";
  const rowCount = Math.min(6, Math.max(2, (representativeInput.match(/(?:^|\n)\s*\d+[.、)]\s*/g) || []).length));
  const rows = Array.from({ length: rowCount }, (_, rowIndex) => {
    const values = dimensions.map((dimension, dimensionIndex) => `${dimension}=${1 + ((rowIndex * 2 + dimensionIndex) % 5)}`);
    return `记录${rowIndex + 1}：${values.join("，")}`;
  });
  return `${representativeInput.trim()}\n\n本 Eval 用例现在补齐上一轮缺失的评分（以下只是隔离测试数据，不是用户事实）：\n${rows.join("\n")}\n请使用已确认的权重完成计算、排序和最终交付，不要再次询问评分。`;
}

export type RuntimeKnowledgeRoute = {
  name: string;
  path: string;
  activationCondition?: string;
};

/** Keep progressive-disclosure references at the point where the agent must
 * decide to load them. A route buried at the end of SKILL.md is technically
 * present but is easy for a runtime model to skip while executing Workflow. */
export function ensureRuntimeKnowledgeRoutes(skill: string, routes: RuntimeKnowledgeRoute[]) {
  const withoutGeneratedSection = skill
    .replace(/\n?> Runtime knowledge routes \(compiler-owned\)\n(?:>.*\n?)*/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const activeRoutes = routes
    .filter((route) => route.path.trim() && route.name.trim())
    .filter((route, index, all) => all.findIndex((candidate) => candidate.path === route.path) === index);
  if (!activeRoutes.length) return withoutGeneratedSection;

  const routeBlock = [
    "> Runtime knowledge routes (compiler-owned)",
    ...activeRoutes.map((route) => `> - Before a workflow step makes ${route.activationCondition?.trim() || "a domain-specific judgment"}, read [${route.name}](${route.path}); apply only rules whose conditions match, follow their exception branch when applicable, and let the user's explicit instruction take precedence.`),
  ].join("\n");
  const workflowHeading = withoutGeneratedSection.match(/(^|\n)(## (?:Executable )?Workflow\s*\n)/i);
  if (!workflowHeading || workflowHeading.index === undefined) return `${withoutGeneratedSection}\n\n${routeBlock}`;
  const insertion = workflowHeading.index + workflowHeading[0].length;
  return `${withoutGeneratedSection.slice(0, insertion)}\n${routeBlock}\n\n${withoutGeneratedSection.slice(insertion).replace(/^\s+/, "")}`.trim();
}

/** A critic cannot claim a field is absent after explicitly listing that
 * field as part of the actual/generated schema in the same piece of evidence. */
export function semanticIssueContradictsOwnMissingFieldClaim(evidence: string) {
  const missingClaims = [
    ...evidence.matchAll(/(?:缺少|未包含|没有包含|遗漏)[了:]?\s*[“"'`]([^”"'`，。；;]+)[”"'`]/gi),
    ...evidence.matchAll(/(?:missing|omits?)\s+[“"'`]([^”"'`,.;]+)[”"'`]/gi),
  ];
  return missingClaims.some((claim) => {
    const field = claim[1]?.trim();
    const claimIndex = claim.index ?? -1;
    if (!field || claimIndex <= 0) return false;
    const before = evidence.slice(Math.max(0, claimIndex - 260), claimIndex);
    const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:(?:实际|当前|生成(?:的)?|输出(?:的)?)(?:\\s*CSV)?(?:\\s*(?:输出)?(?:字段|列|schema))?\\s*(?:为|包括|包含|[:：])|(?:CSV|schema)\\s*(?:输出)?(?:字段|列)\\s*(?:为|包括|包含|[:：]))[^。；;\\n]{0,220}${escaped}`, "i").test(before);
  });
}

/** Reject a semantic-critic finding when it quotes a runtime branch that the
 * compiled SKILL.md demonstrably does not contain. This is intentionally
 * narrow: it only handles a high-risk inversion between "request the missing
 * core material and stop" and "invent/emit placeholder output first". */
export function semanticIssueContradictsBundleBranchClaim(evidence: string, skill: string) {
  const normalizedEvidence = evidence.replace(/\s+/g, " ").trim();
  const quotedBranches = [
    ...normalizedEvidence.matchAll(/(?:主文件|SKILL\.md|运行时|风险)?\s*分支[^“\"]{0,40}[“\"]([^”\"]{8,360})[”\"]/gi),
  ];
  return quotedBranches.some((match) => {
    const claim = match[1]?.trim();
    if (!claim) return false;
    const split = claim.match(/^(.{2,100}?)[：:]\s*(.+)$/);
    if (!split) return false;
    const condition = split[1].replace(/^(?:如果|若|if)\s*/i, "").trim();
    const claimedAction = split[2].trim();
    if (!condition || !/(?:先产出|先生成|占位(?:行|符|结果)|临时结果|虚构|编造)/i.test(claimedAction)) return false;

    const conditionTokens = condition
      .split(/[\s、，,和与或/]+/)
      .map((token) => token.replace(/[“”'"`*]/g, "").trim())
      .filter((token) => token.length >= 2)
      .slice(0, 4);
    const actualLine = skill.split("\n").find((line) => conditionTokens.length > 0 && conditionTokens.every((token) => line.includes(token)));
    if (!actualLine) return false;
    return /(?:请求|要求|等待).{0,60}(?:输入|文件|材料|内容|数据)/i.test(actualLine)
      && /(?:停止|暂停|直到.*可用|不得.{0,20}(?:产出|生成))/i.test(actualLine)
      && !/(?:先产出|先生成|占位(?:行|符|结果)|临时结果|虚构|编造)/i.test(actualLine);
  });
}
