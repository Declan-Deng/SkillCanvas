import assert from "node:assert/strict";
import test from "node:test";

import {
  applyKnowledgePackToFiles,
  buildFollowupResearchQueries,
  buildOptimizationResearchQueries,
  buildKnowledgeEvidencePayload,
  filterKnowledgePackAtoms,
  knowledgePackNeedsExpansion,
  mergeKnowledgePacks,
  normalizeKnowledgePack as normalizeKnowledgePackRaw,
  applyKnowledgeVerification,
  knowledgeVerificationCandidates,
  normalizeKnowledgePlan,
  normalizeRetrievedSources,
  knowledgePackIsPublishable,
  removePresentationContractRules,
  reconcileDomainRuleCountClaims,
  restoreKnowledgePack,
  serializeKnowledgePackForRefinement,
} from "../app/knowledge-research.ts";
import { hasContentPermissionConflict, resolveContentPermission } from "../app/evidence-gates.ts";

const sourceUrl = "https://docs.example.com/professional-rule";

// These older tests isolate authority, rendering and repair accounting. Give
// their fictional source fixtures explicit gap/quote bindings and mock only
// the semantic review. Strict missing/mismatched evidence is covered separately.
function normalizeKnowledgePack(input) {
  const plan = { ...input.plan, capabilityDeltaGapIds: input.plan.capabilityDeltaGapIds.length ? input.plan.capabilityDeltaGapIds : ["fixture-decision"] };
  const atoms = (input.raw.atoms || []).map((atom) => ({
    ...atom, gapIds: [plan.capabilityDeltaGapIds[0]], decision: atom.dimension || atom.title || "fixture decision",
    sourceSupport: (atom.sourceUrls || []).flatMap((url) => {
      const canonical = (value) => { const parsed = new URL(value); return `${parsed.hostname}${parsed.pathname.replace(/\/$/, "")}`; };
      const source = input.sources.find((item) => canonical(item.url) === canonical(url));
      return source ? [{ url, quote: source.excerpt }] : [];
    }),
  }));
  const pending = normalizeKnowledgePackRaw({ ...input, plan, raw: { ...input.raw, atoms } });
  const reviewed = applyKnowledgeVerification(pending, { verdicts: knowledgeVerificationCandidates(pending).map((item) => ({
    id: item.id, fingerprint: item.fingerprint, sourceSupported: true, deltaRelevant: true,
    categoryValid: true, notGeneric: true, notUserPolicy: true, verifiedGapIds: item.gapIds, reason: "mocked semantic verifier for isolated fixture",
    supportChecks: item.supportChecks.map((check) => ({ id: check.id, sourceIndexes: [0], reason: "fixture clause support" })),
  })) });
  return { ...reviewed, diagnostics: pending.diagnostics };
}

test("optimization research queries stay bounded to attributed gaps", () => {
  const queries = buildOptimizationResearchQueries("enterprise data export", ["缺少字段冲突的决策规则", "缺少异常输入验证", "缺少字段冲突的决策规则"]);
  assert.equal(queries.length, 2);
  assert.match(queries[0], /缺少字段冲突的决策规则/);
  assert.match(queries[0], /decision rules/);
  assert.match(queries[1], /缺少异常输入验证/);
});

test("followup research addresses actual missing gap questions instead of repackaging rejected rules", () => {
  const plan = normalizeKnowledgePlan({ required: true, domain: "bulk record import", queries: ["import docs"], knowledgeGaps: ["partial failures"] });
  const queries = buildFollowupResearchQueries(plan, ["partial failures"], ["How are acknowledgement tokens mapped to individual records?", "How are retryable responses distinguished?", "How are retryable responses distinguished?"]);
  assert.equal(queries.length, 2);
  assert.match(queries[0], /acknowledgement tokens/);
  assert.match(queries[1], /retryable responses/);
});

test("domain playbook removes duplicated presentation contracts but preserves external standards", () => {
  const playbook = `# Domain playbook

### 1. 业务判断规则
当输入包含多个候选项时，先按证据强度分级，再记录例外。

### 2. CSV 交付列名
CSV 列名固定为：编号、需求描述、来源客户、优先级、备注。

### 3. 外部交换规范
依据 RFC 4180 标准输出 CSV 文件格式，并正确转义逗号和换行。

## 来源账本
- https://example.com/rfc
`;
  const cleaned = removePresentationContractRules(playbook);

  assert.match(cleaned, /业务判断规则/);
  assert.doesNotMatch(cleaned, /CSV 交付列名/);
  assert.match(cleaned, /RFC 4180/);
  assert.match(cleaned, /^### 2\. 外部交换规范/m);
  assert.match(cleaned, /来源账本/);

  const reconciled = reconcileDomainRuleCountClaims({
    "SKILL.md": "运行 3 条有来源的专业判断。",
    "references/domain-playbook.md": cleaned,
    "references/source.md": "来源原文提到 9 条有来源的专业判断，不属于生成器投影。",
  });
  assert.equal(reconciled["SKILL.md"], "运行 2 条有来源的专业判断。");
  assert.equal(reconciled["references/source.md"], "来源原文提到 9 条有来源的专业判断，不属于生成器投影。");
});

test("saved knowledge packs from before diagnostics migration restore safely", () => {
  const restored = restoreKnowledgePack({
    status: "unavailable",
    summary: "旧版本知识结果",
    plan: { required: true, knowledgeGaps: ["判断规则"], decisionDimensions: ["判断规则"], queries: ["rule"] },
    sources: [],
    atoms: [],
    coverage: { target: 1, covered: [], missing: ["判断规则"], score: 0 },
    valueDensity: 0,
    rejected: ["泛化建议"],
  });

  assert.equal(restored.diagnostics.candidateCount, 0);
  assert.equal(restored.diagnostics.validatorRejectedCount, 0);
  assert.deepEqual(restored.coverage.missing, ["判断规则"]);
  assert.equal(restored.sufficiency, "insufficient");
  assert.deepEqual(restored.categoryCoverage.missing, ["decision_rules", "failure_modes", "edge_cases", "verification_methods"]);
});

test("knowledge planning only enables research for executable gaps and queries", () => {
  const disabled = normalizeKnowledgePlan({ required: true, knowledgeGaps: ["专业规则"], queries: [] });
  assert.equal(disabled.required, false);

  const enabled = normalizeKnowledgePlan({
    required: true,
    reason: "需要确认领域流程",
    domain: "招聘",
    knowledgeGaps: ["简历筛选的专业判断"],
    queries: ["official resume screening workflow"],
    freshness: "recent",
  });
  assert.equal(enabled.required, true);
  assert.equal(enabled.freshness, "recent");
  assert.deepEqual(enabled.requiredCategories, ["decision_rules", "failure_modes", "edge_cases", "verification_methods"]);
  assert.equal(enabled.queries.length, 4);
});

test("domain knowledge remains explicitly insufficient until all four required categories have evidence", () => {
  const plan = normalizeKnowledgePlan({ required: true, domain: "招聘", knowledgeGaps: ["筛选判断"], decisionDimensions: ["筛选判断"], queries: ["official screening rules"] });
  const sources = normalizeRetrievedSources([{ url: sourceUrl, title: "Screening rules", excerpt: "A sufficiently detailed primary guide defines an evidence classification rule, an observable decision condition, and an exception." }]);
  const pack = normalizeKnowledgePack({
    plan,
    sources,
    raw: { atoms: [{ title: "证据分层", dimension: "筛选判断", category: "decision_rules", knowledge: "先区分直接证据、间接证据和未知项。", type: "decision_rule", appliesWhen: "材料需要与岗位要求逐项核对时", action: "逐项分类证据并记录未知项，再只基于直接证据作出匹配判断。", exception: "来源冲突时保留冲突，不强行合并。", sourceUrls: [sourceUrl], confidence: 0.9 }] },
  });

  assert.equal(pack.sufficiency, "insufficient");
  assert.deepEqual(pack.categoryCoverage.covered, ["decision_rules"]);
  assert.deepEqual(pack.categoryCoverage.missing, ["failure_modes", "edge_cases", "verification_methods"]);
});

test("vendor blogs cannot be compiled as official rules", () => {
  const plan = normalizeKnowledgePlan({ required: true, domain: "招聘", knowledgeGaps: ["筛选规则"], decisionDimensions: ["筛选规则"], queries: ["resume rule"] });
  const sources = normalizeRetrievedSources([{ url: "https://vendor.example.com/blog/resume-guide", title: "Vendor guide", excerpt: "A sufficiently detailed practice with a condition, a comparison mechanism, and an exception." }]);
  const pack = normalizeKnowledgePack({
    plan,
    sources,
    raw: { atoms: [{ title: "筛选规则", dimension: "筛选规则", knowledge: "按照证据强度分类后再比较候选内容。", type: "official_rule", appliesWhen: "已经取得候选材料与目标要求时", action: "先分类证据，再比较直接证据、弱证据与真实缺口，最后记录例外。", sourceUrls: [sources[0].url], confidence: 0.98 }] },
  });
  assert.equal(sources[0].authorityTier, "reputable_secondary");
  assert.equal(pack.atoms[0].type, "reference_insight");
  assert.equal(pack.atoms[0].applicationMode, "advisory");
  assert.ok(pack.atoms[0].confidence <= 0.76);
});

test("runtime strength is deterministically compiled from authority, confidence, and corroboration", () => {
  const plan = normalizeKnowledgePlan({ required: true, domain: "内容发布", knowledgeGaps: ["发布规则"], decisionDimensions: ["发布规则"], queries: ["publishing policy"] });
  const officialSources = normalizeRetrievedSources([{ url: "https://docs.example.com/policy", title: "Publishing policy", excerpt: "The official policy requires every sponsored post to include a visible disclosure before publication." }]);
  const enforced = normalizeKnowledgePack({
    plan,
    sources: officialSources,
    raw: { atoms: [{ title: "标注赞助内容", dimension: "发布规则", knowledge: "官方发布规则要求赞助内容包含可见标识。", type: "official_rule", appliesWhen: "内容包含付费赞助或商业合作时", action: "在发布前检查并添加可见的赞助标识，缺失时停止发布流程。", sourceUrls: [officialSources[0].url], confidence: 0.95 }] },
  });
  assert.equal(enforced.atoms[0].applicationMode, "enforced");
  assert.equal(JSON.parse(applyKnowledgePackToFiles({ "SKILL.md": "# Skill" }, enforced)["evals/knowledge-contract.json"]).knowledge_checks[0].mandatory, true);

  const secondarySources = normalizeRetrievedSources([
    { url: "https://vendor-a.example.com/blog/workflow", title: "Workflow A", excerpt: "A detailed workflow article describing a concrete classification method, applicable condition, and fallback branch." },
    { url: "https://vendor-b.example.com/guide/workflow", title: "Workflow B", excerpt: "An independent guide corroborating the same classification sequence, validation method, and exception handling." },
  ]);
  const conditional = normalizeKnowledgePack({
    plan,
    sources: secondarySources,
    raw: { atoms: [{ title: "交叉验证发布内容", dimension: "发布规则", knowledge: "两个独立专业来源都建议先分类内容再运行发布检查。", appliesWhen: "内容同时包含普通信息和商业推广信息时", action: "先分类内容类型，再比较两类发布要求并运行对应检查，最后记录例外。", sourceUrls: secondarySources.map((source) => source.url), confidence: 0.9 }] },
  });
  assert.equal(conditional.atoms[0].applicationMode, "conditional");
  const conditionalCheck = JSON.parse(applyKnowledgePackToFiles({ "SKILL.md": "# Skill" }, conditional)["evals/knowledge-contract.json"]).knowledge_checks[0];
  assert.equal(conditionalCheck.mandatory, false);
  assert.equal(conditionalCheck.recommended, true);
});

test("unused authoritative sources force one more compiler pass instead of being decorative ledger rows", () => {
  const plan = normalizeKnowledgePlan({ required: true, domain: "内容发布", knowledgeGaps: ["发布规则"], decisionDimensions: ["发布规则"], queries: ["publishing rule"] });
  const sources = normalizeRetrievedSources([
    { url: "https://docs.example.com/policy", title: "Official publishing policy", excerpt: "The official policy requires a concrete pre-publication disclosure check and documents the exception branch." },
    { url: "https://writer.example.com/blog/tips", title: "Writer tips", excerpt: "A secondary article describes a concrete three-step classification workflow and a fallback when input is incomplete." },
  ]);
  const pack = normalizeKnowledgePack({
    plan,
    sources,
    raw: { atoms: [{ title: "分类后发布", dimension: "发布规则", knowledge: "经验文章建议先把内容分类再选择发布方式。", appliesWhen: "输入同时包含多种内容类型时", action: "先分类内容，再选择对应发布分支并检查是否遗漏。", sourceUrls: [sources[1].url], confidence: 0.85 }] },
  });
  const expansion = knowledgePackNeedsExpansion(pack);
  const refinement = JSON.parse(serializeKnowledgePackForRefinement(pack, sources));

  assert.equal(pack.diagnostics.authoritativeSourceCount, 1);
  assert.equal(pack.diagnostics.authoritativeSourceUseCount, 0);
  assert.equal(expansion.needsExpansion, true);
  assert.match(expansion.reason, /权威来源/);
  assert.equal(refinement.authority_coverage.authoritative_sources[0].url, sources[0].url);
  assert.match(applyKnowledgePackToFiles({ "SKILL.md": "# Skill" }, pack)["references/domain-playbook.md"], /Official publishing policy[^\n]+未进入运行知识，仅保留检索记录/);
});

test("source metadata can downgrade authority but cannot promote a community page", () => {
  const sources = normalizeRetrievedSources([{
    url: "https://zhihu.com/question/123",
    title: "Community answer",
    excerpt: "这是一段足够长的社区经验内容，描述了一个完整流程、具体判断条件、执行动作、异常分支和失败时的处理方式。",
    authorityTier: "official",
  }]);
  assert.equal(sources[0].authorityTier, "community");
});

test("legacy unknown metadata cannot pin a newly recognized official terms page below primary", () => {
  const sources = normalizeRetrievedSources([{
    url: "https://platform.example.com/terms/community-guidelines",
    title: "社区规范",
    excerpt: "本社区规范明确列出发布内容必须遵守的要求、禁止行为、违规处理、申诉例外流程以及规则适用范围。",
    authorityTier: "unknown",
    authorityReason: "旧版本尚未确认发布者身份",
  }]);
  assert.equal(sources[0].authorityTier, "primary");
});

test("concrete community knowledge is preserved as advisory insight instead of a hard runtime rule", () => {
  const plan = normalizeKnowledgePlan({
    required: true,
    domain: "需求整理",
    knowledgeGaps: ["需求分类"],
    decisionDimensions: ["需求分类"],
    queries: ["需求分类规则"],
  });
  const sources = normalizeRetrievedSources([{
    url: "https://zhihu.com/question/456",
    title: "Community guide",
    excerpt: "这是一段足够长的社区建议，建议把客户需求逐条分类、排序并输出成结构清晰、方便复核和继续编辑的表格。",
  }]);
  const pack = normalizeKnowledgePack({
    plan,
    sources,
    raw: { atoms: [{
      id: "generic-classification",
      title: "分类需求",
      dimension: "需求分类",
      knowledge: "把需求分为功能、体验与合规类别。",
      type: "decision_rule",
      appliesWhen: "输入包含多条客户需求时",
      action: "逐条识别类别并写入分类字段，再检查是否遗漏。",
      sourceUrls: [sources[0].url],
      confidence: 0.9,
    }] },
  });
  assert.equal(pack.atoms.length, 1);
  assert.equal(pack.atoms[0].type, "reference_insight");
  assert.equal(pack.atoms[0].applicationMode, "advisory");
  assert.ok(pack.atoms[0].confidence <= 0.62);
  assert.equal(pack.status, "partial");
  assert.equal(knowledgePackIsPublishable(pack), true);
  const files = applyKnowledgePackToFiles({ "SKILL.md": "# Skill" }, pack);
  assert.match(files["references/domain-playbook.md"], /参考洞察（先核对，不作为硬约束）/);
  const contract = JSON.parse(files["evals/knowledge-contract.json"]);
  assert.equal(contract.knowledge_checks[0].mandatory, false);
  const restored = restoreKnowledgePack({ ...pack, diagnostics: { ...pack.diagnostics, candidateCount: 19, validatorRejectedCount: 14 } });
  assert.equal(restored.diagnostics.candidateCount, 19);
  assert.equal(restored.diagnostics.validatorRejectedCount, 14);
});

test("a zero-yield refinement cannot overwrite the accepted pack with a contradictory summary", () => {
  const plan = normalizeKnowledgePlan({ required: true, domain: "内容策略", knowledgeGaps: ["结构方法"], decisionDimensions: ["结构方法"], queries: ["content structure method"] });
  const sources = normalizeRetrievedSources([{ url: "https://example.com/blog/structure-guide", title: "Structure guide", excerpt: "A detailed structure method with a decision condition, an ordered action, and a concrete exception for content drafting." }]);
  const primary = normalizeKnowledgePack({
    plan,
    sources,
    raw: { summary: "已形成一条可用方法", atoms: [{ title: "按结构组织内容", dimension: "结构方法", knowledge: "内容可按问题、证据与结论三层结构组织。", appliesWhen: "输入同时包含问题背景和支撑材料时", action: "先分类问题和证据，再按问题、证据、结论的顺序重组并检查遗漏。", sourceUrls: [sources[0].url] }] },
  });
  const emptyRefinement = normalizeKnowledgePack({ plan, sources, raw: { summary: "候选都未通过，因此没有写入 Skill", atoms: [] } });
  const merged = mergeKnowledgePacks(primary, emptyRefinement);

  assert.equal(merged.atoms.length, 1);
  assert.doesNotMatch(merged.summary, /都未通过|没有写入/);
});

test("follow-up queries target missing dimensions and partial packs are not written", () => {
  const plan = normalizeKnowledgePlan({ required: true, domain: "招聘", knowledgeGaps: ["岗位拆解"], decisionDimensions: ["岗位拆解", "证据分级"], queries: ["resume rule"], preferredDomains: ["example.org"] });
  const queries = buildFollowupResearchQueries(plan, ["证据分级"]);
  assert.match(queries[0], /证据分级/);
  assert.match(queries[0], /site:example\.org/);
  const partial = { status: "partial", atoms: [{ id: "one" }], coverage: { target: 2, score: 50 } };
  assert.equal(knowledgePackIsPublishable(partial), false);
});

test("retrieved evidence rejects malformed URLs and content-free search rows", () => {
  const sources = normalizeRetrievedSources([
    { url: "https://", excerpt: "这段内容足够长，但 URL 是无效的，因此不能进入证据集合。" },
    { url: sourceUrl, title: "Professional rule", excerpt: "This source explains a concrete professional decision rule and its applicable exception in enough detail." },
    { url: "https://docs.example.com/empty", excerpt: "too short" },
  ]);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].url, sourceUrl);
});

test("knowledge compiler keeps only source-grounded behavior-changing rules", () => {
  const plan = normalizeKnowledgePlan({
    required: true,
    reason: "需要领域规则",
    domain: "招聘",
    knowledgeGaps: ["经历与岗位要求的判断规则"],
    queries: ["resume evidence matching decision rule"],
  });
  const sources = normalizeRetrievedSources([
    { url: sourceUrl, title: "Resume evidence guide", excerpt: "Use evidence from the source material to map a candidate's experience to observable job requirements and preserve uncertain details." },
  ]);
  const pack = normalizeKnowledgePack({
    plan,
    sources,
    raw: {
      summary: "形成可执行判断",
      atoms: [
        {
          id: "evidence-match",
          title: "按证据匹配岗位要求",
          knowledge: "岗位匹配应基于经历材料中可观察的职责、动作与结果，而不是只复制职位关键词。",
          type: "decision_rule",
          appliesWhen: "用户提供目标岗位和至少一段可核验经历时",
          action: "逐项比较岗位要求与经历证据，记录匹配、缺口和需要确认的信息，再决定如何重组表达。",
          exception: "没有经历证据的要求只标记为缺口。",
          sourceUrls: [sourceUrl],
          confidence: 0.86,
        },
        {
          id: "generic",
          title: "保持专业",
          knowledge: "专业",
          appliesWhen: "任何时候都适用",
          action: "保持专业和清晰",
          sourceUrls: [sourceUrl],
        },
        {
          id: "invented-source",
          title: "未知来源规则",
          knowledge: "这是一条无法追溯的领域规则。",
          appliesWhen: "遇到所有复杂任务的时候",
          action: "检查并执行这条没有证据的规则。",
          sourceUrls: ["https://unknown.example.net/rule"],
        },
      ],
    },
  });

  assert.equal(pack.atoms.length, 1);
  assert.equal(pack.atoms[0].id, "evidence-match");
  assert.deepEqual(pack.atoms[0].writeTo, ["references/domain-playbook.md", "evals/knowledge-contract.json", "evals/evals.json"]);
});

test("knowledge compiler accepts executable named methods and canonical source URLs", () => {
  const plan = normalizeKnowledgePlan({
    required: true,
    reason: "需要可执行方法",
    domain: "内容编译",
    knowledgeGaps: ["结构化表达"],
    decisionDimensions: ["结构化表达"],
    queries: ["structured communication method"],
  });
  const sources = normalizeRetrievedSources([{
    url: "https://docs.example.com/framework/?utm_source=search",
    title: "Structured method",
    excerpt: "The STAR method organizes evidence into Situation, Task, Action and Result. Use it to structure experience examples rather than merely listing responsibilities.",
  }]);
  const pack = normalizeKnowledgePack({
    plan,
    sources,
    raw: {
      atoms: [{
        id: "structured-method",
        title: "按结构组织证据",
        dimension: "结构表达方式",
        knowledge: "STAR 方法把情境、任务、行动与结果拆开，避免只罗列职责。",
        type: "evidence_backed_practice",
        appliesWhen: "输入包含需要重组的经历或案例材料时",
        action: "使用 STAR 方法重组材料，并检查每个部分是否包含可观察证据。",
        sourceUrls: ["https://docs.example.com/framework"],
        confidence: 0.84,
      }],
    },
  });

  assert.equal(pack.atoms.length, 1);
  assert.equal(pack.atoms[0].dimension, "结构化表达");
  assert.equal(pack.atoms[0].sourceUrls[0], sources[0].url);
});

test("partial knowledge packs carry validator feedback into the automatic refinement pass", () => {
  const plan = normalizeKnowledgePlan({ required: true, domain: "招聘", knowledgeGaps: ["证据判断"], queries: ["evidence rule"] });
  const sources = normalizeRetrievedSources([{ url: sourceUrl, title: "Evidence guide", excerpt: "A long enough source describing evidence decisions and their observable exceptions." }]);
  const pack = normalizeKnowledgePack({
    plan,
    sources,
    raw: {
      atoms: [{ title: "泛化规则", dimension: "证据判断", knowledge: "保持内容专业清晰完整。", appliesWhen: "处理任何材料的时候", action: "保持专业和清晰", sourceUrls: [sourceUrl] }],
    },
  });
  const refinement = JSON.parse(serializeKnowledgePackForRefinement(pack, sources));

  assert.equal(pack.atoms.length, 0);
  assert.ok(refinement.validation_feedback.some((item) => item.includes("可执行")));
  assert.deepEqual(refinement.repair_contract.dimension_must_equal_one_of, plan.decisionDimensions);
  assert.deepEqual(refinement.repair_contract.source_url_must_equal_one_of, [sourceUrl]);
});

test("a multi-dimensional domain plan cannot pass with one generic rule", () => {
  const plan = normalizeKnowledgePlan({
    required: true,
    reason: "需要形成可执行的简历定制方法",
    domain: "简历与招聘",
    knowledgeGaps: ["岗位定制决策"],
    decisionDimensions: ["JD能力拆解", "证据强度分级", "项目相关性排序", "业务价值提取", "指标处理", "冗余裁剪"],
    queries: ["resume tailoring evidence ranking framework"],
  });
  const sources = normalizeRetrievedSources(Array.from({ length: 12 }, (_, index) => ({
    id: `source-${index + 1}`,
    query: "resume tailoring evidence ranking framework",
    title: `Resume source ${index + 1}`,
    url: `https://docs.example.com/resume-${index + 1}`,
    excerpt: "This evidence describes concrete resume screening decisions, evidence strength, relevance ranking, ownership, metrics, and space allocation.",
  })));
  const pack = normalizeKnowledgePack({
    plan,
    sources,
    raw: {
      atoms: [{
        id: "generic-jd",
        title: "根据 JD 优化简历",
        dimension: "JD能力拆解",
        knowledge: "分析 JD 关键词并突出相关经验和技能。",
        type: "decision_rule",
        appliesWhen: "用户希望针对目标岗位优化简历时",
        action: "根据 JD 调整项目排序和描述。",
        sourceUrls: [sources[0].url],
      }],
    },
  });

  assert.equal(pack.atoms.length, 0);
  assert.equal(pack.status, "unavailable");
  const expansion = knowledgePackNeedsExpansion(pack);
  assert.equal(expansion.needsExpansion, true);
  assert.ok(expansion.missingDimensions.includes("证据强度分级"));
});

test("one useful rule from twelve resume sources remains partial and triggers another compiler pass", () => {
  const plan = normalizeKnowledgePlan({
    required: true,
    reason: "需要形成多维度简历定制决策",
    domain: "简历与招聘",
    knowledgeGaps: ["岗位定制决策"],
    queries: ["resume evidence strength relevance ranking"],
  });
  const sources = normalizeRetrievedSources(Array.from({ length: 12 }, (_, index) => ({
    id: `source-${index + 1}`,
    query: "resume evidence strength relevance ranking",
    title: `Resume evidence ${index + 1}`,
    url: `https://docs.example.com/evidence-${index + 1}`,
    excerpt: "Classify direct, transferable, weak, and missing evidence before ranking bullets by role relevance and observable impact.",
  })));
  const pack = normalizeKnowledgePack({
    plan,
    sources,
    raw: {
      atoms: [{
        id: "evidence-tier",
        title: "证据分级后再改写",
        dimension: "证据强度分级",
        knowledge: "岗位要求与经历之间的支持关系应区分为直接证据、可迁移证据、弱证据和真实缺口。",
        type: "decision_rule",
        appliesWhen: "已经取得目标 JD 与候选人现有简历时",
        action: "逐项比较岗位要求与经历，分类并记录证据强度；先处理直接证据，再决定弱证据是否保留。",
        sourceUrls: [sources[0].url],
      }],
    },
  });

  assert.equal(pack.atoms.length, 1);
  assert.equal(pack.status, "partial");
  assert.ok(pack.coverage.score < 60);
  assert.ok(pack.valueDensity >= 55, "high-value rules should not be penalized merely because research returned many sources");
  assert.equal(knowledgePackNeedsExpansion(pack).needsExpansion, true);
});

test("knowledge evidence stays inside a bounded model context", () => {
  const sources = Array.from({ length: 12 }, (_, index) => ({
    id: `source-${index + 1}`,
    query: `query-${index % 4}`,
    title: `Source ${index + 1}`,
    url: `https://docs.example.com/${index + 1}`,
    excerpt: "x".repeat(10_000),
    publishedAt: "",
    retrievedAt: "2026-08-14T00:00:00.000Z",
  }));
  const payload = buildKnowledgeEvidencePayload(sources, 20_000);
  assert.ok(payload.length <= 12);
  assert.ok(JSON.stringify(payload).length <= 20_002);
  assert.ok(payload.every((source) => source.passages.length && !source.excerpt), "source text is included exactly once as numbered spans");
});

test("compiled knowledge becomes a routed Skill reference instead of a decorative search summary", () => {
  const plan = normalizeKnowledgePlan({ required: true, reason: "需要领域规则", domain: "招聘", knowledgeGaps: ["判断规则"], queries: ["resume decision rule"] });
  const sources = normalizeRetrievedSources([{ url: sourceUrl, title: "Resume guide", excerpt: "This source contains a sufficiently detailed and source-grounded professional workflow for evaluation." }]);
  const pack = normalizeKnowledgePack({
    plan,
    sources,
    raw: { atoms: [{ title: "证据优先", dimension: "判断规则", knowledge: "匹配判断必须回到候选人的可观察经历证据。", appliesWhen: "目标岗位与候选人经历都已经提供时", action: "比较每项岗位要求和经历证据，并标记没有证据支持的缺口。", sourceUrls: [sourceUrl] }] },
  });
  const files = applyKnowledgePackToFiles({ "SKILL.md": "# Skill\n\n## Workflow\n\nComplete the task." }, pack);

  assert.match(files["SKILL.md"], /Professional domain knowledge/);
  assert.match(files["SKILL.md"], /references\/domain-playbook\.md/);
  assert.match(files["references/domain-playbook.md"], /证据优先/);
  assert.match(files["references/domain-playbook.md"], new RegExp(sourceUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const contract = JSON.parse(files["evals/knowledge-contract.json"]);
  assert.equal(contract.knowledge_checks.length, 1);
  assert.equal(contract.knowledge_checks[0].id, pack.atoms[0].id);
});

test("a rejected knowledge pack removes stale generated runtime knowledge", () => {
  const rejected = restoreKnowledgePack({
    status: "partial",
    plan: { required: true, knowledgeGaps: ["专业判断"], decisionDimensions: ["专业判断"], queries: ["decision rule"] },
    sources: [{ url: sourceUrl, title: "Weak source", excerpt: "A source that did not yield a publishable rule." }],
    atoms: [],
    coverage: { target: 1, covered: [], missing: ["专业判断"], score: 0 },
    valueDensity: 0,
    rejected: ["只有泛化建议"],
  });
  const files = applyKnowledgePackToFiles({
    "SKILL.md": "# Skill\n\n## Professional domain knowledge\n\n- Read [domain-playbook.md](references/domain-playbook.md).\n\n## Workflow\n\nDo the task.",
    "references/domain-playbook.md": "# Stale playbook",
    "evals/knowledge-contract.json": "{}",
  }, rejected);

  assert.equal(files["references/domain-playbook.md"], undefined);
  assert.equal(files["evals/knowledge-contract.json"], undefined);
  assert.doesNotMatch(files["SKILL.md"], /Professional domain knowledge|domain-playbook/);
  assert.match(files["SKILL.md"], /## Workflow/);
});

test("source-backed domain rules cannot override the owner's content permission", () => {
  const plan = normalizeKnowledgePlan({
    required: true,
    domain: "内容优化",
    knowledgeGaps: ["量化处理", "术语选择"],
    decisionDimensions: ["量化处理", "术语选择"],
    queries: ["content optimization rules"],
  });
  const sources = normalizeRetrievedSources([{ url: sourceUrl, title: "Professional guide", excerpt: "A detailed professional guide with decision rules, exceptions, terminology, and observable actions for content optimization." }]);
  const pack = normalizeKnowledgePack({
    plan,
    sources,
    raw: { atoms: [
      { id: "omit-quantity", title: "缺少依据时省略量化", dimension: "量化处理", knowledge: "量化表达需要根据输入条件选择不同处理分支。", appliesWhen: "没有现成数字、可比较基线或估算范围时", action: "先检查数字与比较基线，再判断是否能够估算；无法估算或对比时省略量化并避免编造数据，最后检查结果。", sourceUrls: [sourceUrl] },
      { id: "role-language", title: "按任务选择术语", dimension: "术语选择", knowledge: "术语应与目标任务的读者、角色和语境一致。", appliesWhen: "目标任务、目标读者和交付场景已经明确时", action: "先提取目标语境中的核心词，再选择对应术语并检查全文前后一致，最后删除与目标角色无关的表达。", sourceUrls: [sourceUrl] },
    ] },
  });
  const permission = resolveContentPermission({ "evidence-policy": "可以自由补充量化数据和经历" });
  const filtered = filterKnowledgePackAtoms(pack, (atom) => hasContentPermissionConflict(`${atom.knowledge}\n${atom.action}\n${atom.exception}`, permission), "与用户权限冲突");
  assert.deepEqual(filtered.atoms.map((atom) => atom.id), ["role-language"]);
  assert.ok(filtered.rejected.some((item) => item.includes("omit-quantity") || item.includes("缺少依据时省略量化")));
  assert.ok(filtered.coverage.missing.includes("量化处理"));
  assert.doesNotMatch(applyKnowledgePackToFiles({ "SKILL.md": "# Skill" }, filtered)["references/domain-playbook.md"] || "", /省略量化|避免编造/);
});
