import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { reconcileContentPermissionText, resolveContentPermission } from "../app/evidence-gates.ts";

async function requestWorker(request) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    request,
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function render() {
  return requestWorker(new Request("http://localhost/", { headers: { accept: "text/html" } }));
}

function createTextPdf(message) {
  const stream = `BT /F1 12 Tf 72 720 Td (${message}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

test("server-renders the SkillCanvas creation experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>SkillCanvas — 让 AI 真正懂你<\/title>/i);
  assert.match(html, /SkillCanvas 不会用固定问卷或静态样例冒充 AI 理解/);
  assert.doesNotMatch(html, /从你开始，不从格式开始/);
  assert.match(html, /AI不懂你/);
  assert.match(html, /SkillCanvas 来帮你/);
  assert.doesNotMatch(html, /你希望 AI 在什么事情上/);
  assert.match(html, /说出想法/);
  assert.match(html, /预演并理解/);
  assert.match(html, /确认关键决定/);
  assert.match(html, /生成并优化/);
  assert.match(html, /对照验证/);
  assert.match(html, /带走使用/);
  assert.doesNotMatch(html, /理解你的 AI/);
  assert.doesNotMatch(html, /当前建议/);
  assert.doesNotMatch(html, /“AI 建议”只是提示/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps the generator compiler, privacy gate, and prompts wired", async () => {
  const [page, route, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /function finalizeSkillFiles\(/);
  const projectionBoundary = page.slice(page.indexOf("const frozenIR = bindSkillIREvals"), page.indexOf("function auditSkillFiles"));
  assert.match(projectionBoundary, /files\["SKILL\.md"\] = projectSkillMarkdown\(frozenIR\)/);
  assert.match(projectionBoundary, /files\["evals\/evals\.json"\] = projectEvalBank\(frozenIR\)/);
  assert.doesNotMatch(projectionBoundary, /ensure(?:Description|Productive|Information|Confirmed|Instruction|SkillSemantic)|reconcile(?:ConfirmedContent|ValidationVisibility|DataMutation)/);
  assert.match(page, /function auditSkillFiles\(/);
  assert.match(page, /function sanitizeSkillFiles\(/);
  assert.match(page, /function createSpecificEvals\(/);
  assert.match(page, /version:\s*"2\.7"/);
  assert.match(page, /本用例携带的代表性输入材料如下，必须实际处理这些内容/);
  assert.match(page, /本用例没有携带核心输入材料/);
  assert.match(page, /__previewInput:\s*skillDemo\?\.userPrompt\s*\|\|\s*discoveryPreview\?\.sampleInput/);
  assert.match(page, /JSON\.stringify\(publicContract\)\.length\s*>\s*12_000/);
  assert.match(route, /Keep each output at or below 2500 characters/);
  assert.match(page, /function createEvalRunner\(/);
  assert.match(page, /function createEvalGraders\(/);
  assert.match(page, /function createEvalResultSchema\(/);
  assert.match(page, /function createArtifactChecker\(/);
  assert.match(page, /function normalizeCapabilityPlan\(/);
  assert.match(page, /function deriveLoopPlan\(/);
  assert.match(page, /function normalizeLoopPlan\(/);
  assert.match(page, /function createLoopPlanReference\(/);
  assert.doesNotMatch(page, /function createLoopSection\(/);
  assert.doesNotMatch(page, /function removeGeneratedLoopSections\(/);
  assert.match(page, /references\/loop-plan\.md/);
  assert.match(page, /loop-continue-on-observed-gap/);
  assert.match(page, /loop-stop-or-human-checkpoint/);
  assert.match(page, /Quality gates are acceptance checks/);
  assert.match(page, /最多 \{loopPlan\.maxRounds\} 回合/);
  assert.match(page, /DEFAULT_CAPABILITY_PLAN/);
  assert.match(page, /function createExpandedGoal\(/);
  assert.match(page, /body = reconcileConfirmedContentPolicy\(body, answers\);\s*body = ensureMeaningfulGoal\(body, createExpandedGoal/);
  assert.match(page, /compilerFixable.*总目标为空、过短或仍是占位内容.*内容限制与用户确认的润色或扩写权限冲突/s);
  assert.match(page, /compilerFixable.*USER_PERMISSION_IR_CONFLICT.*USER_PERMISSION_RUNTIME_CONFLICT.*USER_PERMISSION_EVAL_CONFLICT.*UNCONFIRMED_CONTENT_RESTRICTION/s);
  assert.match(page, /function reconcileCapabilityPlanContentPermission\(/);
  assert.match(page, /function reconcileKnowledgePackContentPermission\(/);
  assert.match(page, /const groundingRubric = contentGroundingRubric\(contentPermission\)/);
  assert.match(page, /const contentPolicyExpected = contentPolicyEvalExpectations\(contentPermission\)/);
  assert.match(page, /等待 Build Loop 修复完成后启动/);
  assert.match(page, /继续修复并启动/);
  assert.match(page, /while \(!validation\.executionReady/);
  assert.match(page, /validation\.issues\.filter\(\(issue\) => issue\.priority === "P0"\)/);
  assert.match(page, /async function runP1ContractRepairLoop\(/);
  assert.match(page, /category: "P1_CONTRACT_BLOCKER"/);
  assert.match(page, /if \(!initialContractRepair\.passed \|\| !bestBundleValidation\.contractReady \|\| staticPolicy\.priority === "P1"\)/);
  assert.doesNotMatch(page, /const deterministicBlockers = staticValidation\.issues\.map/);
  assert.match(route, /evaluation\.category is P1_CONTRACT_BLOCKER/);
  assert.match(page, /\/api\/credentials/);
  assert.doesNotMatch(page, /window\.localStorage\.setItem\([^)]*credential/i);
  assert.match(page, /清除已保存凭据/);
  assert.match(page, /function reconcileConfirmedContentPolicy\(/);
  assert.match(page, /function normalizeEvalResults\(/);
  assert.match(page, /function normalizeSkillDemo\(/);
  assert.match(page, /function createPersonalizedFeedbackOptions\(/);
  assert.match(page, /function createDemoFeedbackFallback\(/);
  assert.match(page, /function createContextualThinkingWords\(/);
  assert.doesNotMatch(page, /THINKING_WORDS/);
  assert.match(page, /function normalizeFeedbackOptions\(/);
  assert.match(page, /function removeGeneratedToolSections\(/);
  assert.match(page, /function confirmedContentPolicy\(/);
  assert.doesNotMatch(page, /function canonicalGuardrails\(/);
  assert.doesNotMatch(page, /function normalizeUnsafeFactualRules\(/);
  assert.doesNotMatch(page, /事实可靠性提醒：存在允许补写真实事实或数字的规则/);
  assert.match(page, /parsed\.evals\.length < 10/);
  assert.match(page, /trigger_negative/);
  assert.match(page, /evals\/run_evals\.py/);
  assert.match(page, /evals\/graders\.json/);
  assert.match(page, /evals\/result\.schema\.json/);
  assert.match(page, /evals\/artifact_checker\.py/);
  assert.match(page, /integrations\/tool-contracts\.json/);
  assert.match(page, /能力声明的具体实现文件不存在/);
  assert.match(page, /确定性脚本没有独立的脚本级测试/);
  assert.match(page, /evals\/capability-manifest\.json/);
  assert.match(page, /source-upload-receipt/);
  assert.match(page, /本地确定性检查/);
  assert.match(page, /Loop 自动推进/);
  assert.match(page, /响应较慢，系统会先结束异常长输出/);
  assert.match(page, /等待超过 \$\{Math\.round\(timeoutMs \/ 1_000\)\} 秒/);
  assert.match(page, /重试当前步骤/);
  assert.match(page, /function openOptimization\(/);
  assert.match(page, /function runSelectedOptimization\(/);
  assert.match(page, /function applyOptimizationEdits\(/);
  assert.match(page, /parseAndSplitEvalCases/);
  assert.match(page, /sampleOptimizationCases/);
  assert.match(page, /decideOptimizationGate/);
  assert.match(page, /OPTIMIZATION_EDIT_BUDGET/);
  assert.match(page, /setRejectedOptimizations/);
  assert.match(page, /候选版本未通过验证，已保留原 Skill/);
  assert.match(page, /独立验证门控/);
  assert.match(page, /\["build", "repair", "eval-execute", "eval-grade", "eval-compare", "optimization-diagnose", "optimization-patch-plan", "optimization-research", "personalize", "optimization-evidence", "demo", "evaluate"\]\.includes\(mode\)/);
  assert.match(page, /请求在等待模型时中断/);
  assert.match(page, /只重跑 Optimization Loop/);
  assert.match(page, /评测已完成，当前版本处于稳定上限/);
  assert.match(page, /✓ 已保留最佳版/);
  assert.match(page, /generationLoop\.status === "attention" && !optimizationStableAtCeiling/);
  assert.match(page, /正在运行 Optimization Loop/);
  assert.match(page, /generationLoop\.status === "running" \? "执行中"/);
  assert.match(page, /generation_loop_failed/);
  assert.match(page, /ai_client_timeout/);
  assert.match(page, /compilerClosedArtifactContract/);
  assert.match(page, /reconcileArtifactOutputContract/);
  assert.match(page, /demoReviewPending/);
  assert.match(page, /Demo 已保存，不会重新生成/);
  assert.match(page, /savedDemo: SkillDemo \| null/);
  assert.match(route, /compactSkillBundleForTrial/);
  assert.match(route, /compactSourceContextForTrial/);
  assert.match(route, /ai_request_retry/);
  assert.match(route, /function canRetryAfterTimeout\(/);
  assert.match(route, /raw = await upstream\.text\(\);/);
  assert.match(route, /attemptOutputTokenBudget\(body\.mode, attempt\)/);
  assert.match(page, /单项优化/);
  assert.match(page, /optimization-modal/);
  assert.match(page, /optimizationHistory/);
  assert.match(page, /新 Demo/);
  assert.match(page, /async function repairSkill\(/);
  assert.match(page, /callAI<\{ updatedFiles\?: Record<string, unknown>/);
  assert.match(page, /AI 修复并重新评估/);
  assert.match(page, /AI 正在修复发布前问题/);
  assert.match(page, /还有少量不会阻止下载的提醒/);
  assert.match(page, /这个 Skill 真正需要哪些能力/);
  assert.match(page, /目标、子目标与循环/);
  assert.match(page, /AI 已推荐并采用一条可执行流程/);
  assert.match(page, /推荐工作流：目标、子目标与循环/);
  assert.match(page, /本次无需额外安装/);
  assert.match(page, /没有为了显得“专业”而机械添加 MCP/);
  assert.match(page, /质检标准不是目标/);
  assert.match(page, /常用 Prompt、SOP 或工作方法/);
  assert.ok(page.indexOf('id: "existingPrompt"') < page.indexOf('id: "background"'));
  assert.ok(page.indexOf('id: "background"') < page.indexOf('id: "idealOutput"'));
  assert.ok(page.indexOf('id: "idealOutput"') < page.indexOf('id: "negativeOutput"'));
  assert.match(page, /核心能力会自动生成真实文件/);
  assert.match(page, /代表性任务试跑/);
  assert.match(page, /function runDemoAndReview\(/);
  assert.match(page, /function runOptimizationLoop\(/);
  assert.match(page, /auditCapabilityClosure/);
  assert.match(page, /decideGenerationGoalGate/);
  assert.match(page, /无 Skill 基线/);
  assert.match(page, /anonymous-baseline-preferred/);
  assert.match(page, /includeAnonymousBaselineEvidence/);
  assert.match(page, /能力闭环/);
  assert.match(route, /mode === "optimization-diagnose"/);
  assert.match(route, /mode === "optimization-patch-plan"/);
  assert.match(route, /mode === "optimization-research"/);
  assert.match(route, /BASELINE MODE/);
  assert.match(route, /Obey the supplied mutation budget exactly/);
  assert.match(page, /DEFAULT_MUTATION_BUDGET/);
  assert.match(page, /auditCrossArtifactConsistency/);
  assert.match(page, /pruneBundleDeterministically/);
  assert.match(page, /BUILD LOOP · 负责生成并冻结初始架构/);
  assert.match(page, /OPTIMIZATION LOOP · 只做有证据的局部优化/);
  assert.match(page, /查看已采纳的 \{knowledgePack\.atoms\.length\} 条知识明细/);
  assert.match(page, /<details className="knowledge-atom-details">/);
  assert.match(page, /Notification\.requestPermission\(\)/);
  assert.match(page, /notifyGenerationLoopResult\(state\)/);
  assert.match(page, /完成后通知我/);
  assert.match(page, /runIsolatedEvalHarness/);
  assert.match(page, /批量隔离执行漏返回用例，自动拆成单用例补跑/);
  assert.match(page, /批量隔离执行失败，自动拆成单用例补跑/);
  assert.match(page, /批量隔离评分漏返回用例，自动拆成单用例补跑/);
  assert.match(page, /批量隔离评分失败，自动拆成单用例补跑/);
  assert.match(page, /for \(let offset = 0; offset < repeats; offset \+= 1\)/);
  assert.doesNotMatch(page, /评测契约[^\n]+→ 2\.3/);
  assert.match(page, /runBlindHarnessComparison/);
  assert.match(page, /冻结评测/);
  assert.match(page, /隔离试跑证据/);
  assert.match(page, /匿名结果比较/);
  assert.match(route, /mode === "eval-execute"/);
  assert.match(route, /mode === "eval-grade"/);
  assert.match(route, /mode === "eval-compare"/);
  assert.match(route, /isolated Executor/);
  assert.match(route, /context-isolated Grader/);
  assert.match(route, /For an expected\.mustNot item, assertion\.passed=true when the forbidden behavior is absent/);
  assert.match(route, /blind A\/B Comparator/);
  assert.match(page, /function enterEvaluation\(\)/);
  assert.match(page, /onClick=\{enterEvaluation\}/);
  assert.match(page, /function sendDemoChatMessage\(\)/);
  assert.match(page, /继续试用这个 Skill/);
  assert.match(route, /mode === "demo-chat"/);
  assert.match(route, /continuing the same visible trial/);
  assert.match(page, /const CAPABILITY_LIBRARY/);
  assert.match(page, /宿主 Tools 与外部 MCP 分开选择/);
  assert.match(page, /function explainSkillFile\(/);
  assert.match(page, /里面具体有什么/);
  assert.match(page, /确认并生成下一版 Demo/);
  assert.match(page, /已经采用的建议/);
  assert.match(page, /feedbackRequirementMutations/);
  assert.match(page, /applyCanonicalCandidate/);
  assert.match(page, /const \[mutationHistory, setMutationHistory\]/);
  assert.match(page, /function commitSkillMutation\(/);
  assert.match(page, /validatePersonalizationCandidate/);
  assert.match(page, /mode: "preserve-and-satisfy"/);
  assert.doesNotMatch(page, /useState<PersonalizationHistoryEntry\[\]>/);
  assert.doesNotMatch(page, /useState<Record<string, OptimizationHistory>>/);
  assert.match(page, /feedbackAppearsInRuntimeFiles/);
  assert.doesNotMatch(page, /className="idea-source"/);
  assert.match(page, /看完 Demo，哪里还不够懂你？/);
  assert.doesNotMatch(page, /看完 Demo，哪里还不够像你？/);
  assert.match(page, /Let‘s Start！/);
  assert.doesNotMatch(page, /原文件不保存；解析文字会发送给你选择的模型/);
  assert.doesNotMatch(page, /理解预演 · 不计入正式评测/);
  assert.doesNotMatch(page, /discoveryPreview\.scenario/);
  assert.doesNotMatch(page, /可以多选，也可以直接补充。你的反馈会进入后面的提问和 Skill。/);
  assert.doesNotMatch(page, /总目标描述最终要完成的事情，下面的质检只判断有没有做好，不会反过来变成目标。/);
  assert.match(page, /className="round-transition" key=\{`interview-round-\$\{interviewRoundIndex\}`\}/);
  assert.match(css, /\.round-transition\s*\{[\s\S]*?round-content-enter 220ms var\(--ease-out\)/);
  assert.match(css, /prefers-reduced-motion:[\s\S]*?\.round-transition\s*\{[\s\S]*?round-content-fade 160ms ease/);
  assert.match(page, /label: "校准真实使用"/);
  assert.match(page, /dimensions: \["实战任务", "触发语言", "偏好复用", "交付确认"\]/);
  assert.match(page, /第 \{interviewRoundIndex \+ 1\} 轮 · 最多 \{INTERVIEW_ROUND_META\.length\} 轮/);
  assert.doesNotMatch(page, /当前理解把握/);
  assert.doesNotMatch(page, /共 3 轮/);
  assert.match(page, /question-options \$\{question\.selectionMode\}/);
  assert.match(page, /role=\{question\.selectionMode === "single" \? "radio" : "checkbox"\}/);
  assert.match(page, /className="choice-indicator"/);
  assert.match(page, /setFeedbackReasons\(\[\]\);/);
  assert.match(page, /PERSONALIZATION_MAX_ROUNDS/);
  assert.match(page, /BUILD_REPAIR_MAX_ROUNDS/);
  assert.match(page, /MANUAL_REPAIR_MAX_ROUNDS/);
  assert.match(page, /compareGateBlockers/);
  assert.match(page, /reportClientRepairEvent/);
  assert.doesNotMatch(page, /busyProgress/);
  assert.doesNotMatch(page, /current >= 92/);
  assert.match(page, /gateOutcomes\.build\.verdict !== "satisfied"/);
  assert.match(page, /确定性结构验证完成，初始架构已冻结/);
  assert.match(page, /当前候选已被保留集与回归证据接受/);
  assert.match(page, /Demo 不使用“通过”结论/);
  assert.doesNotMatch(route, /Reserve scores above 92/);
  assert.doesNotMatch(page, /const rawContextBundle/);
  assert.match(page, /PDF → 需求证据/);
  assert.match(page, /references\/source-evidence\.md/);
  assert.match(page, /没有切换成固定模板/);
  assert.doesNotMatch(page, /function createPersonalDemoFiles\(/);
  assert.doesNotMatch(page, /固定专业模板兜底/);
  assert.doesNotMatch(page, /已使用安全模板完成编译/);
  assert.doesNotMatch(page, /files\["references\/confirmed-content-policy\.md"\] =/);
  assert.match(page, /## Content transformation/);
  assert.match(page, /所有文件都能直接编辑/);
  assert.match(page, /className="skill-file-editor"/);
  assert.match(page, /function updateSelectedFileContent\(/);
  assert.match(page, /完整 Skill 文件/);
  assert.match(page, /release-skill-preview/);
  assert.doesNotMatch(page, /SKILL\.md 的 Goal 和 Integrity 规则明确禁止编造事实/);
  assert.match(page, /allowSensitiveExport \? files : sanitizeSkillFiles\(files\)/);
  assert.match(route, /explicit current-task instructions > confirmed reusable preferences/);
  assert.match(route, /Preserve the user's content-transformation policy exactly/);
  assert.match(route, /feedbackOptions/);
  assert.match(route, /Default mcp to not-needed/);
  assert.match(route, /Math\.min\(4/);
  assert.match(route, /round \$\{round\} of 4/);
  assert.match(route, /sixteen-dimension guided interview/);
  assert.match(route, /Ask exactly four first-round questions/);
  assert.match(route, /Do not ask about usage frequency/);
  assert.match(page, /dimension: "任务变化"/);
  assert.match(page, /id: "task-variability"/);
  assert.doesNotMatch(page, /dimension: "使用频率"/);
  assert.doesNotMatch(page, /id: "frequency"/);
  assert.doesNotMatch(page, /className="intent-summary"/);
  assert.doesNotMatch(page, /className=\{`adaptive-readiness/);
  assert.match(page, /function recommendedInterviewAnswers\(/);
  assert.match(page, /AI 推荐 · 已预选/);
  assert.match(page, /capabilityCatalog: CAPABILITY_LIBRARY\.map/);
  assert.match(page, /<details className="custom-mcp-disclosure">/);
  assert.match(page, /minimalityChecked: true/);
  assert.match(route, /Put it first in options; the interface will visibly preselect it/);
  assert.match(route, /Copy each selected catalog entry's exact id and kind/);
  assert.match(route, /connection\.verified to false/);
  assert.match(route, /unavailable until configured and verified/);
  assert.match(route, /default_prompt must explicitly invoke \$exact-skill-name/);
  assert.match(route, /Never use placeholders like "Complete the task"/);
  assert.match(route, /mode === "source-analysis"/);
  assert.match(route, /Never copy the original sentence unchanged under ## Goal/);
  assert.match(route, /create references\/source-evidence\.md/);
  assert.match(route, /filename and page marker/);
  assert.match(route, /MAX_OUTPUT_TOKENS/);
  assert.match(route, /42_000/);
  assert.match(route, /ai_request_started/);
  assert.match(route, /ai_repair_payload/);
  assert.match(route, /requestBody\.thinking = \{ type: "disabled" \}/);
  assert.match(route, /ai_response_empty/);
  assert.match(route, /function normalizeModelJsonContent\(/);
  assert.match(route, /ai_content_invalid_json/);
  assert.match(route, /attempt <= 2/);
  assert.match(route, /Every attempt owns its timeout|const controller = new AbortController\(\);[\s\S]*?for \(let attempt|for \(let attempt[\s\S]*?const controller = new AbortController/);
  assert.match(route, /All semantic changes MUST be CanonicalMutation objects/);
  assert.match(route, /"canonicalMutations"/);
  assert.doesNotMatch(route, /模型没有返回可用内容/);
  assert.match(route, /mode === "optimization-plan"/);
  assert.match(route, /mode === "optimization-evidence"/);
  assert.match(route, /real multi-case evidence for text-space Skill optimization/);
  assert.match(route, /Treat rejected-history entries as negative optimization feedback/);
  assert.match(route, /Return at most 4 focused mutations/);
  assert.match(route, /mode === "optimize"/);
  assert.match(route, /mode === "demo"/);
  assert.match(route, /mode === "personalize"/);
  assert.match(route, /mode === "evaluate-dimension"/);
  assert.match(route, /mode === "repair"/);
  assert.match(route, /Repair every supplied blocker/);
  assert.match(route, /10-20 realistic, self-contained cases/);
  assert.match(route, /Choose turn-based when success mainly depends on subjective human judgment/);
  assert.match(route, /Choose goal-driven when the important checks are objectively observable/);
  assert.match(route, /Choose hybrid when objective checks and subjective judgment coexist/);
  assert.match(route, /Never promote a quality criterion, score, rubric, format preference, or grader result into the goal/);
  assert.match(route, /kind":"llm\|reference\|script\|asset\|builtin-tool\|mcp\|eval/);
  assert.match(route, /Design the plan from requirements, not from a fixed bundle checklist/);
  assert.doesNotMatch(route, /must contain at least one item for every kind/);
  assert.doesNotMatch(page, /items\.length < 6/);
  assert.doesNotMatch(route, /references\/requirements\.md must preserve/);
  assert.match(route, /core_capability/);
  assert.match(route, /failure_mode/);
  assert.match(route, /evals\/script-tests/);
  assert.match(route, /For every script item with status generate/);
  assert.match(route, /For every asset item with status generate/);
  assert.match(route, /The Demo is primary evidence/);
  assert.match(route, /"sampleInput":"the smallest concrete, privacy-safe input fragment/);
  assert.match(page, /本用例携带的代表性输入材料如下/);
  assert.match(route, /Merely appending a feedback note is not sufficient/);
  assert.match(route, /optional=true, recommended=true, and enabled=true/);
  assert.match(route, /想看地区/);
  assert.match(route, /Verification failure from a previous candidate/);
  assert.match(css, /\.personalization-loop-card/);
  assert.match(css, /\.skill-demo-card/);
  assert.match(css, /\.eval-issue-compact/);
  assert.match(css, /\.tool-ability-picker/);
  assert.match(css, /\.personalization-history/);
  assert.match(route, /create references\/tooling\.md and integrations\/tool-contracts\.json/);
  assert.match(route, /should-not-trigger/);
  assert.match(route, /updatedFiles/);
  assert.match(route, /without seeing or inferring its previous score/);
  assert.match(css, /\.privacy-export-control/);
  assert.match(css, /\.status-pill\.attention/);
  assert.match(css, /\.source-impact-card/);
  assert.match(css, /\.ai-generation-error/);
  assert.match(css, /\.ai-progress-backdrop/);
  assert.match(css, /@keyframes progress-scan/);
  assert.match(css, /\.source-upload-receipt/);
  assert.match(css, /\.eval-optimize-button/);
  assert.match(css, /\.optimization-backdrop/);
  assert.match(css, /\.optimization-score-change/);
  assert.match(css, /\.capability-plan-card/);
  assert.match(css, /\.capability-plan-grid/);
  assert.match(css, /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.question-options\.single \.choice-indicator/);
  assert.match(css, /\.question-options\.multiple \.choice-indicator/);
  assert.match(page, /function confirmMcpCapability\(/);
  assert.match(page, /function chooseMcpFallback\(/);
  assert.match(page, /integrations\/mcp-setup\.md/);
  assert.match(page, /我已安装并授权/);
  assert.match(page, /改用无 MCP 方案/);
  assert.match(css, /\.mcp-setup-panel/);
  assert.match(css, /\.mcp-confirmed/);
  assert.match(css, /\.loop-plan-card/);
  assert.match(css, /\.loop-columns/);
  assert.doesNotMatch(css, /\.build-resource-chips/);
  assert.match(css, /\.skill-file-editor/);
  assert.match(css, /\.release-skill-preview/);
  assert.match(css, /grid-template-areas:\s*"icon name action" "icon state action"/);
  assert.doesNotMatch(css, /\.selection-note/);
  assert.match(css, /font-size:\s*17px/);
  assert.match(css, /font-size:\s*clamp\(46px, 5\.4vw, 74px\)/);
  assert.match(css, /min-height:\s*100dvh/);
  assert.match(css, /--coral:\s*#c94b38/);
  assert.match(css, /brief-content-enter 420ms var\(--ease-out\)/);
  assert.doesNotMatch(css, /font-size:\s*21\.25px/);
});

test("keeps the Optimization Loop card from collapsing inside the build workspace", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const buildStageRule = css.match(/\.build-stage\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const loopCardRule = css.match(/\.generation-loop-result\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const editorRule = css.match(/\.editor-shell\s*\{([\s\S]*?)\}/)?.[1] ?? "";

  assert.match(buildStageRule, /height:\s*auto/);
  assert.match(buildStageRule, /min-height:\s*max\(600px, calc\(100vh - 70px\)\)/);
  assert.match(loopCardRule, /flex:\s*0 0 auto/);
  assert.doesNotMatch(loopCardRule, /\bheight\s*:/);
  assert.match(editorRule, /flex:\s*1 0 470px/);
});

test("records client repair-gate outcomes without bundle content", async () => {
  const response = await requestWorker(new Request("http://localhost/api/client-log", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event: "repair_gate_checked",
      round: 1,
      beforeCount: 3,
      afterCount: 1,
      accepted: true,
      resolved: ["A", "B"],
      blockers: ["C"],
      updatedPaths: ["SKILL.md"],
    }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });

  const diagnostics = await requestWorker(new Request("http://localhost/api/client-log?limit=10"));
  assert.equal(diagnostics.status, 200);
  const diagnosticPayload = await diagnostics.json();
  assert.ok(Array.isArray(diagnosticPayload.entries));
  assert.ok(diagnosticPayload.entries.some((entry) => entry.event === "client_repair_gate_checked"));
  assert.doesNotMatch(JSON.stringify(diagnosticPayload), /do not log/);

  const rejected = await requestWorker(new Request("http://localhost/api/client-log", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: "arbitrary_event", secret: "do not log" }),
  }));
  assert.equal(rejected.status, 400);
});

test("stores credentials behind an HttpOnly tenant session without returning plaintext", async () => {
  const modelKey = "sk-test-secret-value-123456";
  const researchKey = "fc-test-secret-value-654321";
  const saved = await requestWorker(new Request("http://localhost/api/credentials", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: "deepseek",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com",
      apiKey: modelKey,
      researchProvider: "firecrawl",
      researchApiKey: researchKey,
      researchBaseUrl: "https://api.firecrawl.dev",
    }),
  }));
  assert.equal(saved.status, 200);
  const cookie = saved.headers.get("set-cookie") || "";
  assert.match(cookie, /skillcanvas_session=.*HttpOnly.*SameSite=Strict/i);

  const restored = await requestWorker(new Request("http://localhost/api/credentials", { headers: { cookie } }));
  assert.equal(restored.status, 200);
  const payload = await restored.json();
  assert.equal(payload.configured, true);
  assert.equal(payload.researchConfigured, true);
  assert.equal(payload.config.provider, "deepseek");
  assert.doesNotMatch(JSON.stringify(payload), new RegExp(`${modelKey}|${researchKey}`));

  const removed = await requestWorker(new Request("http://localhost/api/credentials", { method: "DELETE", headers: { cookie } }));
  assert.equal(removed.status, 200);
});

test("P0 Execution Gate compiles every generated Python file before contract optimization", async () => {
  const files = {
    "SKILL.md": `---\nname: example-skill\ndescription: "Use when the user needs an example task completed with a concrete workflow."\n---\n\n# Example\n`,
    "agents/openai.yaml": `interface:\n  display_name: "Example"\n  short_description: "Example Skill"\n  default_prompt: "Use $example-skill."`,
    "evals/capability-manifest.json": JSON.stringify({ capabilities: [], coverage: [] }),
    "evals/evals.json": JSON.stringify({ evals: [] }),
    "evals/graders.json": JSON.stringify({ graders: [] }),
    "evals/result.schema.json": JSON.stringify({ type: "object" }),
    "evals/run_evals.py": `# skillcanvas-owned-eval-runner:v1\nimport argparse\ndef main():\n    argparse.ArgumentParser().parse_args()\nif __name__ == "__main__":\n    main()\n`,
    "evals/artifact_checker.py": "# skillcanvas-owned-artifact-checker:v1\ndef broken(:\n    pass\n",
  };
  const response = await requestWorker(new Request("http://localhost/api/validate-bundle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ files }),
  }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.priority === "P0" && issue.code === "PYTHON_COMPILE_ERROR" && issue.path === "evals/artifact_checker.py"));
});

test("preserves a confirmed permissive content policy instead of injecting generic restrictions", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const start = page.indexOf("function confirmedContentPolicy");
  const end = page.indexOf("function reconcileKnowledgePackContentPermission");
  assert.ok(start >= 0 && end > start);
  const executable = page.slice(start, end)
    .replaceAll(": Record<string, string>", "")
    .replaceAll(": string", "");
  const reconcile = new Function("resolveContentPermission", "reconcileContentPermissionText", `${executable}; return reconcileConfirmedContentPolicy;`)(resolveContentPermission, reconcileContentPermissionText);
  const generated = "## Rules\n\n- 禁止编造真实事实、数字、日期、成就。\n- 不虚构经历、数据或资质。\n- 若用户要求编造，礼貌拒绝并解释真实性原则。\n- 保持结构清楚。";
  const permissive = reconcile(generated, { "evidence-policy": "可以适当润色、修改和合理扩写" });
  assert.doesNotMatch(permissive, /禁止编造|不虚构|真实性原则/);
  assert.match(permissive, /保持结构清楚/);
  const restrictive = reconcile(generated, { "evidence-policy": "只润色表达，不新增事实，不编造数字" });
  assert.match(restrictive, /禁止编造真实事实/);
  const englishConflict = reconcile("## Rules\n\n- Do not fabricate specific facts, numbers, or proprietary names.\n- You may expand existing content, but do not invent concrete facts.\n- 不把来源没有支持的具体事实补写成确定结论。", { "evidence-policy": "可以随意润色扩写增加经历，帮我更厉害就行" });
  assert.doesNotMatch(englishConflict, /Do not fabricate|do not invent|来源没有支持/);
});

test("cleans a generated frontmatter restriction when it conflicts with the confirmed policy", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const existingDescription = reconcileConfirmedContentPolicy\(rawExistingDescription, answers\)\.trim\(\)/);
  assert.doesNotMatch(page, /description: "根据职位描述改写、定制或检查简历，在不虚构经历/);
  assert.doesNotMatch(page, /without inventing facts/);
});

test("repairs invalid JSON backslash escapes returned by a model", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const start = page.indexOf("function jsonFromText");
  const end = page.indexOf("function explainSkillFile");
  assert.ok(start >= 0 && end > start);
  const executable = page.slice(start, end)
    .replace("function jsonFromText<T>(raw: string): T", "function jsonFromText(raw)")
    .replaceAll(" as T", "");
  const parse = new Function(`${executable}; return jsonFromText;`)();
  const parsed = parse(String.raw`{"files":{"scripts/check.js":"const pattern = /\s+/g"}}`);
  assert.equal(parsed.files["scripts/check.js"], String.raw`const pattern = /\s+/g`);
});

test("applies compact optimization edits without replacing the whole bundle", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const start = page.indexOf("function applyOptimizationEdits");
  const end = page.indexOf("function applyCanonicalCandidate");
  assert.ok(start >= 0 && end > start);
  const executable = page.slice(start, end)
    .replace("function applyOptimizationEdits(currentFiles: Record<string, string>, response: OptimizationEditResponse)", "function applyOptimizationEdits(currentFiles, response)")
    .replace("const changedPaths = new Set<string>();", "const changedPaths = new Set();")
    .replaceAll(" as Record<string, unknown>", "");
  const apply = new Function(`const isImplementationBytePath = (path) => /^(scripts|assets)\\//.test(path); ${executable}; return applyOptimizationEdits;`)();
  const current = { "SKILL.md": "# Skill\n\nOld workflow\n", "scripts/check.py": "old implementation\n" };
  const result = apply(current, {
    edits: [{ path: "scripts/check.py", find: "old implementation", replacement: "improved implementation" }],
    createdFiles: { "assets/checklist.md": "# Checklist\n" },
  });
  assert.equal(result.files["scripts/check.py"], "improved implementation\n");
  assert.equal(result.files["assets/checklist.md"], "# Checklist\n");
  assert.deepEqual(result.changedPaths.sort(), ["assets/checklist.md", "scripts/check.py"]);
  assert.equal(current["SKILL.md"], "# Skill\n\nOld workflow\n");
  assert.throws(() => apply({ "scripts/check.py": "same same" }, { edits: [{ path: "scripts/check.py", find: "same", replacement: "new" }] }), /修改位置不够准确/);
  assert.deepEqual(apply(current, { edits: [{ path: "SKILL.md", find: "Old workflow", replacement: "hidden" }] }).changedPaths, []);
});

test("an ambiguous optimization patch is replanned instead of crashing the Loop", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /修改锚点无法唯一定位/);
  assert.match(page, /phase:\s*"replan"/);
  assert.match(page, /preparedPatch\s*=\s*applyPatchPlan/);
});

test("Eval v2.7 covers completed decision branches and script field mapping", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /version:\s*"2\.7"/);
  assert.match(page, /workflow-decision-values-provided/);
  assert.match(page, /completedNumericDecisionFixture\(representativeInput\)/);
  assert.match(page, /CSV 精确列名及顺序/);
  assert.match(page, /map the current records to those exact keys/);
  assert.match(page, /item\.output\.replace\(\/；导出前恢复用户\[\^；\]\*\/g/);
  assert.match(page, /core_capability", \.\.\.\(expectedArtifacts\.length \? \["artifact_checker"\]/);
  assert.match(page, /generationLoop\.status !== "idle" && generationLoop\.issues\.length/);
  assert.match(page, /__previewInput:\s*restoredPreviewInput/);
  assert.match(page, /savedEvalVersion === "2\.7"/);
  assert.match(page, /savedLoop\.status !== "running"/);
  assert.match(page, /const optimizationRunInFlight = useRef\(false\)/);
  assert.match(page, /if \(optimizationRunInFlight\.current\) return/);
});

test("removes a model-authored Tools section before adding the canonical contract", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const start = page.indexOf("function removeGeneratedToolSections");
  const end = page.indexOf("function humanizeSkillName");
  assert.ok(start >= 0 && end > start);
  const executable = page.slice(start, end).replaceAll(": string", "");
  const remove = new Function(`${executable}; return removeGeneratedToolSections;`)();
  const result = remove("# Skill\n\n## Workflow\n\nDo the task.\n\n## Tools\n\nNeeds configuration.\n\n## Verification\n\nCheck the result.");
  assert.doesNotMatch(result, /## Tools|Needs configuration/);
  assert.match(result, /## Workflow/);
  assert.match(result, /## Verification/);
});

test("extracts page-marked text from an uploaded PDF", async () => {
  const message = "SkillCanvas reads this PDF source and preserves its page provenance for the AI interview";
  const form = new FormData();
  form.append("file", new File([createTextPdf(message)], "source.pdf", { type: "application/pdf" }));
  const response = await requestWorker(new Request("http://localhost/api/parse-pdf", { method: "POST", body: form }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.totalPages, 1);
  assert.equal(result.scannedLikely, false);
  assert.match(result.text, /第 1 页/);
  assert.match(result.text, /SkillCanvas reads this PDF source/);
});
