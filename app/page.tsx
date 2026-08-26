"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  OPTIMIZATION_EDIT_BUDGET,
  OPTIMIZATION_SELECTION_SAMPLE,
  OPTIMIZATION_TRAIN_SAMPLE,
  aggregateDimensionScore,
  decideCandidateCommitGate,
  decideOptimizationGate,
  parseAndSplitEvalCases,
  heldOutCapabilityCoverage,
  sampleOptimizationCases,
  type OptimizationEvidenceReport,
  type SkillEvalCase,
} from "./optimizer-core";
import { DEMO_SCORING_POLICY, buildGateOutcome, demoGateOutcome, optimizationGateOutcome } from "./gate-outcome";
import {
  DECISION_LEDGER_PATH,
  appendDecisionLedgerEntry,
  createDecisionLedgerEntry,
  decisionLedgerFeedback,
} from "./decision-ledger";
import {
  compareGateBlockers,
  countDuplicateAuthorRuntimeRules,
  demoteUnsupportedConfirmationClaims,
  demoteUnconfirmedQualityProxies,
  ensureInstructionPriorityOrder,
  evalContractIsIncomplete,
  evalPromptIsTooShort,
  descriptionCoversSpecificDomain,
  descriptionWorkflowScopeMismatches,
  ensureDescriptionWorkflowScopeBranches,
  findUnconfirmedOperationalDefaults,
  findUnconfirmedScriptComparisons,
  ensureMeaningfulGoal,
  markUnconfirmedFormulasPending,
  hasUnsafeDeterministicFallback,
  hasUnsafeDynamicExecution,
  hasUnboundedFormulaParser,
  pythonScriptTestContractIssues,
  pythonOutputContractIssues,
  reconcilePythonOutputContract,
  reconcileFormulaSecurityTest,
  reconcilePythonTestInterpreter,
  hasExecutableWorkflowHeading,
  hasInstructionPriorityOrder,
  hasMeaningfulGoal,
  hasDataMutationPolicyConflict,
  hasUnsupportedPersistenceConflict,
  normalizeExecutableWorkflowHeading,
  reconcileDataMutationPolicy,
  runtimeFileMentions,
} from "./gate-rules";
import {
  confirmedPersonalizationConflicts,
  extractConfirmedPersonalizationFeedback,
  feedbackAppearsInRuntimeFiles,
  normalizeFeedbackRequirement,
  reconcileCapabilityPlanWithFeedback,
} from "./personalization-rules";
import {
  auditCapabilityClosure,
  decideGenerationGoalGate,
  generationEvaluationAtCeiling,
  generationGoalSatisfied,
  artifactDeliveryRequested,
  inferArtifactPatterns,
  reconcileArtifactOutputContract,
  removeResolvedFileObservations,
  reusableOutputAssetRequested,
  summarizeGenerationEvidence,
} from "./generation-loop-core";
import {
  DEFAULT_MUTATION_BUDGET,
  applyPatchPlan,
  auditCrossArtifactConsistency,
  canonicalCapabilityContract,
  capabilityOwnsArtifacts,
  candidateUtility,
  constrainPatchPlan,
  estimateDomainValueDensity,
  makeContractIssues,
  normalizeCapabilityScope,
  normalizePatchPlan,
  optimizationPolicyFor,
  pruneBundleDeterministically,
  reconcileArtifactProducerCapabilities,
  validatePatchPlan,
  type CapabilityScope,
  type EvalFamily,
  type PipelineIssue,
} from "./skill-pipeline-core";
import { classifyBundleIssue, validateBundleStructure, type BundleStaticIssue, type BundleStaticValidation } from "./bundle-validator";
import {
  applySkillIRMutations,
  feedbackRequirementMutations,
  isImplementationBytePath,
  normalizeCanonicalMutations,
  parseCanonicalSkillIR,
  semanticSkillIRDigest,
  validateCanonicalSkillIR,
} from "./canonical-mutations";
import {
  buildInformationDependencies,
  buildRequirementProvenance,
  confirmedAnswerEvidenceText,
  contentGroundingRubric,
  contentPolicyEvalExpectations,
  deriveDomainEvidence,
  deriveScopeProvenance,
  downgradeUngroundedHardConstraints,
  finalMinimalityPass,
  hardNegativePrompts,
  hasContentPermissionConflict,
  isUnconfirmedGenericFactRestriction,
  reconcileContentPermissionText,
  realisticFailureFixtures,
  reconcileValidationVisibility,
  resolveContentPermission,
  semanticGateAudit,
} from "./evidence-gates";
import {
  bindSkillIREvals,
  compileSkillIR,
  ensureSkillIREvalCoverage,
  ensureSkillSemanticClosure,
  projectAgentMetadata,
  projectCapabilityManifest,
  projectDomainPlaybook,
  projectEvalBank,
  projectLoopReference,
  projectOutputReference,
  projectSkillMarkdown,
  projectStateReference,
  projectToolContracts,
  projectToolingReference,
  reconcileSkillIRContentPermission,
  reconcileSkillIRInputResolutions,
  reconcileSkillIRSourceEvidence,
  type SkillIR,
} from "./skill-ir";
import {
  EMPTY_KNOWLEDGE_PACK,
  applyKnowledgePackToFiles,
  buildKnowledgeEvidencePayload,
  buildFollowupResearchQueries,
  filterKnowledgePackAtoms,
  knowledgePackIsPublishable,
  knowledgePackNeedsExpansion,
  mergeKnowledgePacks,
  normalizeKnowledgePack,
  normalizeKnowledgePlan,
  normalizeRetrievedSources,
  removePresentationContractRules,
  reconcileDomainRuleCountClaims,
  restoreKnowledgePack,
  serializeKnowledgePackForRefinement,
  serializeKnowledgePack,
  type KnowledgePack,
  type RetrievedKnowledgeSource,
  type ResearchProviderId,
} from "./knowledge-research";
import { dedupeResearchSources } from "./research-core";
import { verifyBundleScriptTests, verifyExecutionsInLocalSandbox } from "./eval-workflow-service";
import { DurableWorkflowJournal } from "./workflow-client";
import { completedNumericDecisionFixture, confirmedCorrectionEvalEvidence, confirmedOutputFields, ensureConfirmedCorrectionContract, ensureInformationDependencyContract, ensureProductiveCheckpointContract, ensureRuntimeKnowledgeRoutes, productiveCheckpointRequested, reconcileContractFacingFieldLabels, semanticIssueContradictsBundleBranchClaim, semanticIssueContradictsOwnMissingFieldClaim } from "./workflow-compiler";
import {
  anonymizeComparison,
  buildHarnessReport,
  compareHarnessBenchmarks,
  freezeEvalContract,
  normalizeBlindComparison,
  normalizeHarnessExecutions,
  normalizeHarnessGrades,
  publicExecutionContract,
  runtimeSkillBundle,
  type BenchmarkCaseComparison,
  type HarnessConfiguration,
  type HarnessExecution,
  type HarnessGrade,
  type HarnessReport,
} from "./real-eval-harness";
import {
  EMPTY_INTERVIEW_READINESS,
  normalizeDiscoveryPreview,
  normalizeInterviewReadiness,
  optionConflictsWithPriorEvidence,
  previewFeedbackEvidence,
  type DiscoveryPreview,
  type InterviewReadiness,
} from "./discovery-preview";
import {
  REQUIREMENT_DIMENSIONS,
  WORKFLOW_STEPS,
  canNavigateToWorkflowStep,
  normalizeWorkflowStep,
  reconcileBlueprintProvenance,
  summarizeRequirementCoverage,
  type WorkflowStepId,
} from "./workflow-state";

type StepId = WorkflowStepId;
type ProviderId = "deepseek" | "openai" | "compatible";

type ModelPreset = {
  id: string;
  label: string;
  detail: string;
  recommended?: boolean;
};

type Question = {
  id: string;
  dimension: string;
  label: string;
  helper: string;
  placeholder: string;
  options: string[];
  selectionMode: "single" | "multiple";
  recommendedOption?: string;
};

type InterviewRound = {
  title: string;
  description: string;
  questions: Question[];
};

type ContextFieldId = "idealOutput" | "negativeOutput" | "existingPrompt" | "background";
type ContextNotes = Record<ContextFieldId, string>;
type RoundOrigin = "ai" | "template";

type SourceInsight = {
  sourceName: string;
  documentType: string;
  role: "ideal-output" | "negative-example" | "source-material" | "background";
  roleLabel: string;
  roleReason: string;
  summary: string;
  observableTraits: string[];
  questionInfluence: string[];
  evidence: string[];
  privacyNote: string;
};

type BusyTask = "interview" | "blueprint" | "build" | "repair" | "evaluate" | "personalize";
type RetryAction = "start-interview" | "advance-interview" | "regenerate-interview" | "build-blueprint" | "compile-skill" | "rerun-optimization-loop" | "rerun-multi-scene-comparison" | "repair-skill" | "evaluate" | "personalize";
type BusyExecutionKind = "local" | "model" | "loop";

const SESSION_STORAGE_KEY = "skillcanvas.current-tab.v1";
// One-time migration key from the early prototype. Secrets are removed from
// browser storage immediately and persisted through /api/credentials instead.
const LEGACY_CREDENTIAL_STORAGE_KEY = "skillcanvas.local-credentials.v1";

type SourceReceipt = {
  tone: "reading" | "ready" | "warning" | "error";
  title: string;
  detail: string;
};

type BlueprintSection = {
  id: string;
  index: string;
  title: string;
  description: string;
  content: string;
  status: "ready" | "attention";
};

type CapabilityKind = "llm" | "reference" | "script" | "asset" | "builtin-tool" | "mcp" | "eval";
type CapabilityStatus = "generate" | "use-provided" | "requires-setup" | "not-needed";
type CapabilityLayer = "runtime" | "evaluation" | "build-time";

type McpConnection = {
  server: string;
  tools: string[];
  verified: boolean;
};

type CapabilityItem = {
  id: string;
  kind: CapabilityKind;
  name: string;
  path: string;
  layer: CapabilityLayer;
  requirement: string;
  purpose: string;
  reason: string;
  status: CapabilityStatus;
  input: string;
  output: string;
  fallback: string;
  routingCondition: string;
  deterministicAdvantage: string;
  evaluationCriteria: string[];
  scope?: CapabilityScope;
  activationCondition?: string;
  affects?: string[];
  mustNotAffect?: string[];
  connection?: McpConnection;
  optional?: boolean;
  enabled?: boolean;
  recommended?: boolean;
  necessity?: {
    successLift: "high" | "medium" | "low";
    bareModelReliable: boolean;
    deterministicNeed: boolean;
    realResourceAvailable: boolean;
    externalDependency: boolean;
    decision: "include" | "optional" | "exclude";
  };
};

type OutcomeModel = {
  ultimateGoal: string;
  controllableOutcomes: string[];
  uncontrollableOutcomes: string[];
  observableIndicators: string[];
};

type StateField = {
  name: string;
  purpose: string;
  source: "explicit" | "user-claim" | "inference" | "hypothesis" | "unknown";
  updateRule: string;
};

type StateModel = {
  needed: boolean;
  scope: "none" | "session" | "persistent";
  reason: string;
  fields: StateField[];
  expiry: string;
  correction: string;
  missingBehavior: string;
  privacyBoundary: string;
};

type OutputContract = {
  mode: "human" | "machine" | "artifact" | "mixed";
  format: string;
  requiredSections: string[];
  artifactPatterns: string[];
  validation: string[];
};

type RiskBranch = {
  id: string;
  condition: string;
  action: string;
  stopOrRedirect: string;
};

type CapabilityPlan = {
  summary: string;
  outcomeModel: OutcomeModel;
  stateModel: StateModel;
  outputContract: OutputContract;
  riskBranches: RiskBranch[];
  failureModes: string[];
  items: CapabilityItem[];
};

type LoopMode = "turn-based" | "goal-driven" | "hybrid";

type LoopSubgoal = {
  id: string;
  title: string;
  outcome: string;
  verification: string;
};

type LoopQualityGate = {
  id: string;
  criterion: string;
  check: string;
  owner: "ai" | "user" | "shared";
};

type LoopPlan = {
  mode: LoopMode;
  label: string;
  reason: string;
  goal: string;
  subgoals: LoopSubgoal[];
  qualityGates: LoopQualityGate[];
  cycle: string[];
  maxRounds: number;
  stopConditions: string[];
  escalationConditions: string[];
  scopes: Array<{
    id: string;
    scope: "inference" | "task-retry" | "interaction" | "longitudinal";
    trigger: string;
    action: string;
    maxCycles: number;
    stateDependency: string;
    stop: string;
  }>;
};

type BuildLoopState = {
  status: "idle" | "checking" | "repairing" | "passed" | "attention";
  phase: "idle" | "intent" | "examples" | "contract" | "capability" | "knowledge" | "artifact" | "bundle" | "frozen";
  rounds: number;
  issues: string[];
  frozen: boolean;
};

type GenerationSemanticIssue = {
  id: string;
  lens: "scope" | "knowledge" | "workflow" | "tool" | "state" | "output" | "eval" | "consistency" | "efficiency";
  type: string;
  severity: "critical" | "high" | "medium";
  priority: "P1" | "P2" | "P3";
  capabilityId: string;
  evidence: string;
  route: "scope" | "research" | "workflow" | "tool" | "state" | "output" | "eval" | "consistency" | "simplify";
  files: string[];
};

type GenerationSemanticAudit = {
  summary: string;
  issues: GenerationSemanticIssue[];
  unnecessaryFiles: string[];
};

type GenerationLoopState = {
  evaluationContractVersion: "2.7";
  status: "idle" | "running" | "passed" | "stable" | "attention";
  phase: "idle" | "contract" | "static" | "rollout" | "diagnose" | "patch" | "validate" | "complete";
  rounds: number;
  maxRounds: number;
  baselineScore: number;
  bestScore: number;
  baselineQualityScore: number;
  bestQualityScore: number;
  comparisonConfidence: number;
  comparisonRevision: string;
  comparisonStage: "not-run" | "initial" | "optimized" | "post-prune";
  comparisonCaseCount: number;
  comparisonVerdict: "not-run" | "improved" | "equivalent" | "regressed";
  comparisonEvidence: BenchmarkCaseComparison[];
  /** Project-level held-out suite. It stays fixed when the Bundle changes. */
  benchmarkSuiteCases: SkillEvalCase[];
  lift: number;
  passRate: number;
  closureScore: number;
  acceptedPatches: number;
  rejectedPatches: number;
  contractDigest: string;
  benchmarkCases: number;
  benchmarkRepeatsPerCase: number;
  benchmarkRuns: number;
  baselineStddev: number | null;
  bestStddev: number | null;
  meanDurationMs: number;
  blindWinner: "baseline" | "candidate" | "tie" | "not-run";
  minimalityChecked: boolean;
  issues: string[];
  stopReason: string;
};

function describeMultiSceneComparison(loop: GenerationLoopState) {
  const delta = loop.bestQualityScore - loop.baselineQualityScore;
  if (loop.comparisonVerdict === "improved") {
    return {
      tone: "improved",
      title: "专属 Skill 已证明有稳定增益",
      detail: `当前 Skill 多场景总分高于普通 AI ${Math.max(0, delta)} 分，并通过了冻结任务与匿名质量对照。`,
    };
  }
  if (delta > 0) {
    return {
      tone: "attention",
      title: "多场景总分已提升，稳定性仍待确认",
      detail: `当前 Skill 多场景总分高于普通 AI ${delta} 分，但冻结任务通过率或匿名质量对照尚未达到接受门槛，因此暂不宣称获得稳定增益。`,
    };
  }
  if (delta < 0) {
    return {
      tone: "regressed",
      title: "当前 Skill 出现多场景回退",
      detail: `当前 Skill 多场景总分比普通 AI 低 ${Math.abs(delta)} 分，系统已保留原版本，不接受这次候选修改。`,
    };
  }
  return {
    tone: "equivalent",
    title: "当前 Skill 与普通 AI 表现接近",
    detail: "两者多场景总分持平；当前证据不足以证明稳定增益，系统不会夸大结果。",
  };
}

type EvalResult = {
  label: string;
  detail: string;
  strength?: string;
  issue?: string;
  evidence?: string;
  impact?: string;
  score: number;
  tone: "good" | "warn" | "bad";
  coverage?: "observed" | "not-covered";
};

type SkillDemo = {
  title: string;
  scenario: string;
  userPrompt: string;
  output: string;
  appliedRules: string[];
  uncertainties: string[];
};

type DemoChatAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  text: string;
  truncated: boolean;
};

type DemoChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: DemoChatAttachment[];
};

type CapabilityCatalogItem = CapabilityItem & {
  category: "文件与内容" | "代码与自动化" | "联网与界面" | "外部服务 MCP";
  hosts: string[];
};

type FileExplanation = {
  kind: string;
  summary: string;
  contents: string[];
  usedWhen: string;
  affects: string;
  related: string[];
  validation: string;
};

type OptimizationSuggestion = {
  id: string;
  title: string;
  detail: string;
  impact: string;
  files: string[];
  recommended: boolean;
  risk: "low" | "medium";
};

type OptimizationPlan = {
  diagnosis: string;
  suggestions: OptimizationSuggestion[];
};

type OptimizationEditResponse = {
  canonicalMutations?: unknown;
  implementationFiles?: Record<string, unknown>;
  edits?: unknown;
  createdFiles?: Record<string, unknown>;
  updatedFiles?: Record<string, unknown>;
  summary?: string;
  consumedDecisionIds?: string[];
};

type CanonicalRepairResponse = {
  canonicalMutations?: unknown;
  implementationFiles?: Record<string, unknown>;
  updatedFiles?: Record<string, unknown>;
  summary?: string;
  resolved?: unknown;
};

type OptimizationStatus = "idle" | "analyzing" | "ready" | "optimizing" | "reevaluating" | "complete" | "error";

type OptimizationHistory = {
  accepted: boolean;
  before: EvalResult;
  after: EvalResult;
  summary: string;
  changedFiles: string[];
  appliedTitles: string[];
  evidence: string[];
  gateReasons: string[];
  regressions: string[];
  testedCases: number;
};

type OptimizationSession = {
  cases: SkillEvalCase[];
  trainCaseIds: string[];
  selectionCaseIds: string[];
  trainingEvidence: OptimizationEvidenceReport;
  baselineEvidence: OptimizationEvidenceReport;
};

type RejectedOptimization = {
  dimension: string;
  selectedTitles: string[];
  reason: string;
  beforeScore: number;
  candidateScore: number;
  changedFiles: string[];
  textualFeedback?: OptimizationEvidenceReport["textualFeedback"];
  failedCases?: OptimizationEvidenceReport["failedCases"];
};

type PersonalizationHistoryEntry = {
  id: string;
  round: number;
  feedback: string[];
  summary: string;
  changedFiles: string[];
  testedCases?: number;
};

type SkillMutationReceipt = {
  id: string;
  source: "optimization" | "personalization";
  accepted: boolean;
  createdAt: number;
  baselineRevision: string;
  candidateRevision: string;
  changedFiles: string[];
  testedCases: number;
  evidence: string[];
  gateReasons: string[];
  regressions: string[];
  contractDigest?: string;
  runIds?: string[];
  caseIds?: string[];
  baselineScore?: number;
  candidateScore?: number;
  textualFeedback?: OptimizationEvidenceReport["textualFeedback"];
  failedCases?: OptimizationEvidenceReport["failedCases"];
  consumedDecisionIds?: string[];
  optimization?: OptimizationHistory & { dimension: string };
  personalization?: PersonalizationHistoryEntry;
};

function skillBundleRevision(files: Record<string, string>) {
  // The decision ledger describes commits; it is not part of the candidate it
  // fingerprints. Excluding it avoids a self-referential revision digest.
  const serialized = Object.keys(files).filter((path) => path !== DECISION_LEDGER_PATH).sort().map((path) => `${path}\u0000${files[path]}`).join("\u0001");
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `bundle-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

const BUSY_STAGES: Record<BusyTask, { title: string; stages: string[] }> = {
  interview: { title: "AI 正在先做一次，再理解你", stages: ["读取你的目标与资料", "选择代表性任务", "生成可判断的理解预演", "找出最值得确认的选择"] },
  blueprint: { title: "AI 正在整理理解", stages: ["汇总你的回答", "等待模型整理", "校验理解蓝图"] },
  build: { title: "AI 正在研究、生成并优化专属 Skill", stages: ["固定 Goal 并编译专业知识", "生成 Skill 候选", "执行确定性检查", "修复结构问题", "建立能力闭环", "冻结评测并隔离执行", "上下文隔离评分与跨文件检查", "按失败类型局部修改", "重复试跑并匿名比较", "保留最佳版本并停止"] },
  repair: { title: "AI 正在修复发布前问题", stages: ["读取待修复问题", "修改受影响内容", "检查文件完整性", "重新评估"] },
  evaluate: { title: "AI 正在试跑这个 Skill", stages: ["设计代表性任务", "按 Skill 生成 Demo", "对照你的要求找差距", "生成可选择的反馈"] },
  personalize: { title: "AI 正在验证下一版候选", stages: ["读取你确认的不满意点", "定向生成候选 Skill", "用冻结任务检查既有能力", "用新任务生成并复评 Demo", "原子提交已验证版本"] },
};

const AI_MODE_LABELS: Record<string, string> = {
  "knowledge-plan": "识别专业知识缺口",
  "knowledge-compile": "把来源编译成专业规则",
  preview: "生成第一版理解预演",
  interview: "生成下一轮理解问题",
  blueprint: "整理需求与能力蓝图",
  build: "生成完整 Skill 候选",
  repair: "重写有问题的文件",
  "eval-execute": "在隔离上下文中执行冻结任务",
  "eval-grade": "在隔离评分上下文检查实际输出",
  "eval-compare": "对两版结果进行匿名比较",
  "optimization-evidence": "运行兼容评测流程",
  "optimization-diagnose": "根据证据定位根因",
  "optimization-patch-plan": "规划最小修改范围",
  "optimization-research": "判断领域知识缺口",
  demo: "运行 Skill Demo",
  evaluate: "评估 Demo 与需求差距",
  personalize: "按你的反馈改写 Skill",
};

const PROVIDERS: Record<ProviderId, { name: string; model: string; baseUrl: string; mark: string; models: ModelPreset[] }> = {
  deepseek: {
    name: "DeepSeek",
    model: "deepseek-v4-flash",
    baseUrl: "https://api.deepseek.com",
    mark: "DS",
    models: [
      { id: "deepseek-v4-flash", label: "V4 Flash", detail: "更快、更经济，适合日常创建", recommended: true },
      { id: "deepseek-v4-pro", label: "V4 Pro", detail: "复杂 Skill 与高质量评审" },
    ],
  },
  openai: {
    name: "OpenAI",
    model: "gpt-5.4-mini",
    baseUrl: "https://api.openai.com/v1",
    mark: "OA",
    models: [
      { id: "gpt-5.4-mini", label: "GPT-5.4 mini", detail: "快速创建与迭代", recommended: true },
      { id: "gpt-5.4", label: "GPT-5.4", detail: "复杂规划与深度评估" },
    ],
  },
  compatible: {
    name: "兼容接口",
    model: "your-model-name",
    baseUrl: "https://your-provider.example/v1",
    mark: "API",
    models: [],
  },
};

function ProviderLogo({ id }: { id: ProviderId }) {
  const sources: Partial<Record<ProviderId, string>> = {
    deepseek: "https://cdn.simpleicons.org/deepseek",
    openai: "https://unpkg.com/@lobehub/icons-static-svg@1.94.0/icons/openai.svg",
  };
  return sources[id]
    ? <img src={sources[id]} alt="" aria-hidden="true" />
    : <span aria-hidden="true">{PROVIDERS[id].mark}</span>;
}

const RESEARCH_PROVIDERS: Record<ResearchProviderId, { name: string; mark: string; detail: string; baseUrl: string }> = {
  disabled: { name: "暂不联网", mark: "—", detail: "仍会识别知识缺口，但不会把模型常识伪装成来源知识", baseUrl: "" },
  firecrawl: { name: "Firecrawl", mark: "FC", detail: "搜索并提取网页正文，适合直接形成可引用知识", baseUrl: "https://api.firecrawl.dev" },
  searxng: { name: "SearXNG", mark: "SX", detail: "连接你自部署的开源搜索服务，再读取公开结果正文", baseUrl: "" },
};

type InternalMcpEvidenceReport = {
  phase: "knowledge-compile" | "optimization-research";
  sources: RetrievedKnowledgeSource[];
  attempts: Array<{ status: string; query: string; toolName: string; reason?: string }>;
  connectionsScanned: number;
  toolsDiscovered: number;
  error?: string;
};

type InternalMcpEvidenceReports = Partial<Record<InternalMcpEvidenceReport["phase"], InternalMcpEvidenceReport>>;

type McpConnectionSummary = {
  id: string;
  name: string;
  serverUrl: string;
  configured: boolean;
  updatedAt: string;
};

function mergeInternalMcpEvidenceReports(
  current: InternalMcpEvidenceReport | undefined,
  next: InternalMcpEvidenceReport,
): InternalMcpEvidenceReport {
  if (!current || current.phase !== next.phase) return next;
  const sources = new Map<string, RetrievedKnowledgeSource>();
  [...current.sources, ...next.sources].forEach((source) => sources.set(source.id || source.url, source));
  const attempts = [...current.attempts, ...next.attempts].filter((attempt, index, list) => (
    list.findIndex((candidate) => [candidate.status, candidate.query, candidate.toolName, candidate.reason || ""].join("|")
      === [attempt.status, attempt.query, attempt.toolName, attempt.reason || ""].join("|")) === index
  ));
  return {
    phase: next.phase,
    sources: [...sources.values()],
    attempts,
    connectionsScanned: Math.max(current.connectionsScanned, next.connectionsScanned),
    toolsDiscovered: Math.max(current.toolsDiscovered, next.toolsDiscovered),
    error: next.error || current.error,
  };
}

type OptimizationResearchDecision = {
  required: boolean;
  reason: string;
  knowledgeGaps: string[];
  availableSourcesSufficient: boolean;
  distilledKnowledge: string[];
  forbiddenGenericAdvice: string[];
  mcpEvidence?: {
    sourceCount: number;
    attempts: InternalMcpEvidenceReport["attempts"];
  };
};

function normalizeOptimizationResearchDecision(value: unknown): OptimizationResearchDecision {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const strings = (input: unknown, max = 8) => Array.isArray(input)
    ? Array.from(new Set(input.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean))).slice(0, max)
    : [];
  return {
    required: raw.required === true,
    reason: typeof raw.reason === "string" ? raw.reason.trim().slice(0, 800) : "",
    knowledgeGaps: strings(raw.knowledgeGaps, 6),
    availableSourcesSufficient: raw.availableSourcesSufficient === true,
    distilledKnowledge: strings(raw.distilledKnowledge, 12),
    forbiddenGenericAdvice: strings(raw.forbiddenGenericAdvice, 12),
  };
}

const UNSURE_OPTION = "我不确定，请 AI 帮我判断";
const BUILD_REPAIR_MAX_ROUNDS = 2;
const STATIC_REPAIR_MAX_ROUNDS = 5;
const PATCH_PLAN_MAX_ATTEMPTS = 3;
const MANUAL_REPAIR_MAX_ROUNDS = 3;
const PERSONALIZATION_MAX_ROUNDS = 4;
const GENERATION_GOAL_MAX_ROUNDS = 2;
const DEFAULT_BUILD_LOOP: BuildLoopState = { status: "idle", phase: "idle", rounds: 0, issues: [], frozen: false };
const BUILD_LOOP_STEPS = ["用户意图", "任务样例", "Skill 契约", "能力图", "专业知识编译", "产物计划", "生成 Bundle", "冻结架构"] as const;
const BUILD_LOOP_PHASE_INDEX: Record<BuildLoopState["phase"], number> = { idle: 0, intent: 0, examples: 1, contract: 2, capability: 3, knowledge: 4, artifact: 5, bundle: 6, frozen: 7 };
const OPTIMIZATION_LOOP_STEPS = ["冻结评测", "隔离执行", "隔离评分", "无 Skill 基线", "问题诊断", "有限修改", "匿名 A/B", "保留集回归", "保留任务", "精简冗余"] as const;
const DEFAULT_GENERATION_LOOP: GenerationLoopState = {
  evaluationContractVersion: "2.7",
  status: "idle",
  phase: "idle",
  rounds: 0,
  maxRounds: GENERATION_GOAL_MAX_ROUNDS,
  baselineScore: 0,
  bestScore: 0,
  baselineQualityScore: 0,
  bestQualityScore: 0,
  comparisonConfidence: 0,
  comparisonRevision: "",
  comparisonStage: "not-run",
  comparisonCaseCount: 0,
  comparisonVerdict: "not-run",
  comparisonEvidence: [],
  benchmarkSuiteCases: [],
  lift: 0,
  passRate: 0,
  closureScore: 0,
  acceptedPatches: 0,
  rejectedPatches: 0,
  contractDigest: "",
  benchmarkCases: 0,
  benchmarkRepeatsPerCase: 0,
  benchmarkRuns: 0,
  baselineStddev: null,
  bestStddev: null,
  meanDurationMs: 0,
  blindWinner: "not-run",
  minimalityChecked: false,
  issues: [],
  stopReason: "尚未运行",
};
const SOURCE_ROLE_LABELS: Record<SourceInsight["role"], string> = {
  "ideal-output": "理想产出示例",
  "negative-example": "反例",
  "source-material": "任务事实资料",
  background: "背景知识",
};

const INTERVIEW_ROUND_META = [
  {
    label: "确定目标",
    title: "先弄清：它到底要帮你什么",
    description: "先不谈 Skill 格式。把一句想法展开成真实场景、核心价值和成功标准。",
    dimensions: ["使用场景", "核心价值", "任务变化", "成功标准"],
  },
  {
    label: "搭建工作流",
    title: "再弄清：它应该怎样完成",
    description: "补齐输入、工作步骤、交付形式和信息不足时的处理方式；具体能力由 AI 自动规划。",
    dimensions: ["输入信息", "工作流程", "交付形式", "信息策略"],
  },
  {
    label: "定义个性与边界",
    title: "继续确认：怎样才真正懂你",
    description: "确定 AI 的主动程度、质量标准、不能犯的错和必须停下来问你的边界。",
    dimensions: ["自主程度", "质量标准", "失败模式", "协作边界"],
  },
  {
    label: "校准真实使用",
    title: "最后校准：放进真实任务里怎么用",
    description: "用一个真实场景确认它何时出现、哪些要求可以复用，以及做完后怎样与你确认。",
    dimensions: ["实战任务", "触发语言", "偏好复用", "交付确认"],
  },
] as const;

const CONTEXT_FIELDS: Array<{ id: ContextFieldId; tabLabel: string; label: string; description: string; placeholder: string; tag: string; icon: string }> = [
  { id: "existingPrompt", tabLabel: "方法 / SOP", label: "方法 / SOP", description: "粘贴你已经在使用的方法、步骤、检查清单或 Prompt。", placeholder: "把常用 Prompt、SOP、操作步骤或检查清单粘贴到这里……", tag: "提取可复用步骤", icon: "https://unpkg.com/@tabler/icons@3.46.0/icons/outline/file-description.svg" },
  { id: "idealOutput", tabLabel: "理想样例", label: "理想产出示例", description: "粘贴你觉得很好的结果、文章片段、报告、方案或代码。", placeholder: "把理想的文章、报告、方案、代码或其他结果粘贴到这里……", tag: "让 AI 知道“好”的样子", icon: "https://unpkg.com/@tabler/icons@3.46.0/icons/outline/star.svg" },
  { id: "negativeOutput", tabLabel: "避免什么", label: "你不希望出现什么", description: "粘贴反例，或者直接说明哪些表达、判断和做法会让你不满意。", placeholder: "粘贴反例，或写下你最不喜欢的做法……", tag: "告诉 AI 哪些不能做", icon: "https://unpkg.com/@tabler/icons@3.46.0/icons/outline/shield-check.svg" },
  { id: "background", tabLabel: "背景资料", label: "背景资料", description: "补充业务背景、目标用户、专业术语、规则或其他判断依据。", placeholder: "例如：产品背景、目标用户、专业术语、品牌规则、业务限制……", tag: "补足判断所需信息", icon: "https://unpkg.com/@tabler/icons@3.46.0/icons/outline/folder.svg" },
];

const DEFAULT_INTERVIEW_ROUNDS: InterviewRound[] = [
  {
    title: INTERVIEW_ROUND_META[0].title,
    description: INTERVIEW_ROUND_META[0].description,
    questions: [
      { id: "scenario", dimension: "使用场景", label: "你最可能在什么时候叫它出来帮忙？", helper: "触发场景会决定 Skill 何时被调用，以及第一步应该做什么。", placeholder: "例如：每次拿到一个模糊任务时", options: ["刚有一个模糊想法时", "开始一项新任务时", "遇到复杂选择时", "需要稳定重复产出时", UNSURE_OPTION], selectionMode: "single", recommendedOption: "刚有一个模糊想法时" },
      { id: "outcome", dimension: "核心价值", label: "你最希望它替你减少哪一种负担？", helper: "不是问功能清单，而是确认这个 Skill 最核心的用户价值。", placeholder: "例如：帮我把零散想法变成能执行的完整方案", options: ["把模糊想法变成完整方案", "搜集并整理复杂信息", "直接产出可以使用的结果", "检查并优化我已有的内容", UNSURE_OPTION], selectionMode: "single" },
      { id: "task-variability", dimension: "任务变化", label: "每次让它帮忙时，情况通常有多像？", helper: "这会决定 Skill 应该按固定流程稳定执行，还是先判断情况再选择不同步骤；不会影响质量高低。", placeholder: "例如：目标相同，但每次提供的资料和限制条件不同", options: ["基本一样，只替换少量资料", "目标相同，但输入和条件经常变化", "大致分成几种固定情况", "每次差异很大，需要 AI 先判断", UNSURE_OPTION], selectionMode: "single" },
      { id: "good-example", dimension: "成功标准", label: "出现哪些结果，你会觉得“它真的帮到我了”？", helper: "可以多选。AI 会把这些选择变成验收标准，而不是空泛地追求“高质量”。", placeholder: "例如：结果让我不需要再二次整理", options: ["结果可以直接拿去用", "比我自己想得更完整", "让我更快做出决定", "符合我的个人习惯", "能主动提醒遗漏和风险", UNSURE_OPTION], selectionMode: "multiple", recommendedOption: "能主动提醒遗漏和风险" },
    ],
  },
  {
    title: INTERVIEW_ROUND_META[1].title,
    description: INTERVIEW_ROUND_META[1].description,
    questions: [
      { id: "inputs", dimension: "输入信息", label: "开始工作时，你通常能给 AI 什么？", helper: "可以多选。输入来源决定 Skill 需要先追问、读文件，还是直接开始。", placeholder: "例如：一句话加几个参考链接", options: ["通常只有一句简单想法", "会提供文件或链接", "会提供过去的好案例", "需要 AI 主动追问补齐", "有固定模板或数据", UNSURE_OPTION], selectionMode: "multiple", recommendedOption: "需要 AI 主动追问补齐" },
      { id: "workflow", dimension: "工作流程", label: "你更希望它怎样和你一起推进？", helper: "选择默认协作节奏。重要信息缺失时，Skill 仍会停下来确认。", placeholder: "例如：先问关键问题，再给完整初稿", options: ["先连续问清楚再产出", "边提问边给我看草稿", "先出初版再一起迭代", "能判断的就直接推进", UNSURE_OPTION], selectionMode: "single", recommendedOption: "先连续问清楚再产出" },
      { id: "output-format", dimension: "交付形式", label: "你最后希望拿到什么类型的结果？", helper: "可以多选。交付形式会直接写进 Skill 的输出规范。", placeholder: "例如：一份方案文档加执行清单", options: ["可直接复制的文字", "表格、清单或计划", "文件、代码或可运行产物", "多个方案与优缺点对比", "先摘要再给完整内容", UNSURE_OPTION], selectionMode: "multiple" },
      { id: "evidence-policy", dimension: "信息策略", label: "你希望 AI 可以把内容改到什么程度？", helper: "可以多选。这里会直接决定 Skill 是否允许扩写、生成事实或在信息不足时采用假设；生成器不会再替你收紧。", placeholder: "例如：可以扩写并生成事实，缺重要信息时按目标补全", options: ["只调整表达，不新增内容", "可以合理扩写和重组", "可以主动生成事实、经历和量化内容", "可以根据目标主动补全", "信息不足时先问我或标注", UNSURE_OPTION], selectionMode: "multiple", recommendedOption: "可以主动生成事实、经历和量化内容" },
    ],
  },
  {
    title: INTERVIEW_ROUND_META[2].title,
    description: INTERVIEW_ROUND_META[2].description,
    questions: [
      { id: "autonomy", dimension: "自主程度", label: "你希望 AI 主动到什么程度？", helper: "这决定它是只给建议、生成草案，还是在规则内持续完成任务。", placeholder: "例如：低风险步骤可以直接做，关键决策先问我", options: ["只分析并给建议", "生成结果，等我确认", "低风险步骤可以自主完成", "按明确规则自动执行", UNSURE_OPTION], selectionMode: "single", recommendedOption: "生成结果，等我确认" },
      { id: "style", dimension: "质量标准", label: "什么会让你觉得结果足够专业？", helper: "可以多选。这些标准会进入质量检查与评测集。", placeholder: "例如：结论有依据，而且可以直接行动", options: ["事实准确并说明依据", "结构完整、逻辑清楚", "符合我的语言和表达习惯", "能直接执行而不是只讲道理", "主动发现风险和遗漏", UNSURE_OPTION], selectionMode: "multiple" },
      { id: "bad-example", dimension: "失败模式", label: "哪些情况最容易让你觉得“它根本不懂我”？", helper: "可以多选。反例会转化成禁止行为和回归测试。", placeholder: "例如：没看我的资料就套模板", options: ["没问清楚就开始做", "内容空泛、重复、像套话", "忽略我提供的资料和偏好", "擅自替我做重要决定", "输出格式让我无法使用", UNSURE_OPTION], selectionMode: "multiple" },
      { id: "boundary", dimension: "协作边界", label: "遇到哪些动作，它必须停下来先问你？", helper: "可以多选。这些选择会成为 Agent 的明确停止条件。", placeholder: "例如：任何对外发送和付费操作都必须确认", options: ["对外发送或发布前", "付费、购买或创建资源前", "涉及隐私和敏感资料时", "改变目标或做关键取舍时", "没有额外限制", UNSURE_OPTION], selectionMode: "multiple", recommendedOption: "改变目标或做关键取舍时" },
    ],
  },
  {
    title: INTERVIEW_ROUND_META[3].title,
    description: INTERVIEW_ROUND_META[3].description,
    questions: [
      { id: "real-task", dimension: "实战任务", label: "你最想先让它在哪一种真实任务里证明自己？", helper: "这个场景会成为首轮 Demo 和后续回归测试的主要依据。", placeholder: "例如：下次我只有一句模糊想法时，帮我整理成可执行方案", options: ["我现在马上要做的任务", "最常重复出现的任务", "最容易做错的一类任务", "最能代表理想结果的任务", UNSURE_OPTION], selectionMode: "single" },
      { id: "trigger-language", dimension: "触发语言", label: "你通常会用哪些说法叫它出来帮忙？", helper: "可以多选。真实说法会写进触发描述和正向测试，不只依赖 Skill 名称。", placeholder: "例如：帮我按之前的方式重新做一版", options: ["只说一句模糊想法", "给一份资料让它直接处理", "说结果不满意让它修改", "明确要求按我的习惯完成", UNSURE_OPTION], selectionMode: "multiple" },
      { id: "preference-reuse", dimension: "偏好复用", label: "这次确认的哪些内容，以后可以继续沿用？", helper: "单选一个默认范围，避免把一次性的要求误当成长期偏好。", placeholder: "例如：只长期保留我的表达习惯，具体任务每次重新确认", options: ["只沿用表达和语气", "沿用工作步骤与交付格式", "沿用质量标准和协作边界", "本次专用，以后重新确认", UNSURE_OPTION], selectionMode: "single", recommendedOption: "沿用质量标准和协作边界" },
      { id: "delivery-checkpoint", dimension: "交付确认", label: "它完成一轮后，你希望怎样判断继续还是结束？", helper: "可以多选。这会决定 Demo、自动检查和你的确认分别在什么时候出现。", placeholder: "例如：先给我一版真实结果，再让我选择最明显的偏差", options: ["先给可用结果，我再指出问题", "先展示 Demo，让我选择偏差", "先自动检查明显问题再给我", "涉及主观取舍时单独问我", UNSURE_OPTION], selectionMode: "multiple", recommendedOption: "先展示 Demo，让我选择偏差" },
    ],
  },
];

const DEFAULT_BLUEPRINT: BlueprintSection[] = [
  {
    id: "goal",
    index: "A",
    title: "你的目标",
    description: "AI 要帮助你的事情，以及真正完成的标准",
    content: "AI 不只交付一个结果，还要理解你为什么需要它、怎样才算真正有帮助，并围绕这个目标组织整个工作流。",
    status: "ready",
  },
  {
    id: "understanding",
    index: "B",
    title: "AI 对你的理解",
    description: "目前提炼出的偏好、经验和判断标准",
    content: "AI 会把访谈回答区分为目标、偏好、事实、案例和待确认事项。任何推断都会明确标记，等待你确认。",
    status: "attention",
  },
  {
    id: "working-style",
    index: "C",
    title: "你的工作方式",
    description: "AI 应该如何思考、推进和表达",
    content: "默认先理解目标和资料，再识别信息缺口；重要决策先确认，最终先给结论和行动，再补充依据与风险。",
    status: "ready",
  },
  {
    id: "boundary",
    index: "D",
    title: "人机协作边界",
    description: "AI 可以主动做什么，什么必须先问你",
    content: "涉及外部发送、费用、敏感信息或改变原始目标时必须确认；内容可以改动到什么程度，完全以你在信息策略中的选择为准。",
    status: "attention",
  },
  {
    id: "output",
    index: "E",
    title: "专属输出标准",
    description: "不仅正确，还要符合你的表达与判断习惯",
    content: "输出应直接、清晰、可执行，并准确遵循你允许的润色、扩写、补全或保守处理范围。",
    status: "ready",
  },
  {
    id: "eval",
    index: "F",
    title: "懂你测试",
    description: "证明它遵循你的偏好，而不是通用地看起来不错",
    content: "使用满意案例、反例、资料缺失和越界场景，检查目标一致性、偏好遵循、主动程度、协作边界和最终接受度。",
    status: "ready",
  },
];

const DEFAULT_CAPABILITY_PLAN: CapabilityPlan = {
  summary: "先拆解任务能力，再决定由大模型、领域知识、确定性代码、产出资产或外部工具负责；没有明确收益的组件不会进入最终 Skill。",
  outcomeModel: {
    ultimateGoal: "完成用户真正需要的任务结果，而不是承诺无法由 Skill 控制的外部结果。",
    controllableOutcomes: ["正确理解输入与约束", "执行可复用的专业步骤", "交付可检查的结果"],
    uncontrollableOutcomes: ["他人的态度、录用、成交或平台结果"],
    observableIndicators: ["核心输入被实际使用", "输出符合明确契约", "失败条件触发正确分支"],
  },
  stateModel: {
    needed: false,
    scope: "none",
    reason: "默认任务在一次会话内完成，不预设长期记忆。",
    fields: [],
    expiry: "任务完成后不保留",
    correction: "以用户本轮明确更正为准",
    missingBehavior: "缺少会改变结果的必要信息时明确指出并按已确认策略处理",
    privacyBoundary: "只使用当前任务必需信息，不把一次性内容升级为长期偏好",
  },
  outputContract: {
    mode: "human",
    format: "面向用户的可直接使用结果",
    requiredSections: ["核心结果", "必要依据或下一步"],
    artifactPatterns: [],
    validation: ["结果真实存在", "覆盖核心任务", "没有用抽象质量词代替交付"],
  },
  riskBranches: [
    { id: "blocking-input", condition: "缺少会改变任务方向的必要输入", action: "按已确认的信息策略追问、标注或采用可逆假设", stopOrRedirect: "无法安全替代时停止并说明缺口" },
    { id: "external-action", condition: "下一步涉及外部发送、费用或不可逆动作", action: "先展示将执行的动作和影响", stopOrRedirect: "获得明确确认后才继续" },
  ],
  failureModes: ["套用通用模板而没有完成领域任务", "声明使用资料或工具但没有可观察证据", "把质量分数当成任务目标"],
  items: [
    { id: "core-reasoning", kind: "llm", name: "领域任务推理", path: "SKILL.md", layer: "runtime", requirement: "理解用户目标并完成核心语义任务", purpose: "保留需要语义判断、取舍和表达的专业工作", reason: "这类工作无法通过固定脚本可靠完成", status: "generate", input: "当前请求、必要上下文和约束", output: "满足输出契约的真实结果", fallback: "标出未知内容并请求最小必要信息", routingCondition: "每次触发 Skill 时", deterministicAdvantage: "无；该能力需要上下文理解", evaluationCriteria: ["核心任务被真正完成", "输出体现输入中的关键差异"] },
    { id: "eval-plan", kind: "eval", name: "领域回归测试", path: "evals/", layer: "evaluation", requirement: "证明核心能力、触发边界和失败分支可重复", purpose: "用真实任务验证行为，而不只检查目录结构", reason: "每个可发布 Skill 都需要可执行回归证据", status: "generate", input: "10–20 条代表性任务与 Agent 结果", output: "逐项分数、证据和失败原因", fallback: "至少运行结构检查并明确尚未执行的行为测试", routingCondition: "构建后、修改后或发布前", deterministicAdvantage: "固定数据结构、评分汇总和文件检查可重复", evaluationCriteria: ["覆盖核心领域能力", "包含不应触发和失败模式", "评分器与预期一一对应"] },
  ],
};

const DEFAULT_LOOP_PLAN: LoopPlan = {
  mode: "hybrid",
  label: "混合循环",
  reason: "先让 AI 自动检查能够客观验证的部分，再把需要个人判断的部分交给用户确认。",
  goal: "完成用户真正需要的任务结果，并在不改变原始目标的前提下稳定交付。",
  subgoals: [
    { id: "understand-input", title: "确认任务状态", outcome: "目标、必要输入和不能越过的边界已明确", verification: "检查是否仍有会改变结果方向的关键信息缺口" },
    { id: "produce-candidate", title: "形成可用结果", outcome: "完成一版可以被检查和反馈的真实产出", verification: "确认交付物存在、格式可用且覆盖核心任务" },
    { id: "close-gaps", title: "修复关键差距", outcome: "客观问题已修复，主观差异已获得用户确认", verification: "运行自动检查，并在个人判断点发起一轮明确确认" },
  ],
  qualityGates: [
    { id: "goal-alignment", criterion: "结果仍然服务于原始目标", check: "逐项对照当前任务与交付结果，不把评分项改写成新目标", owner: "ai" },
    { id: "usable-output", criterion: "结果可以按约定方式直接使用", check: "检查结构、格式、必要内容与交付物是否完整", owner: "ai" },
    { id: "personal-fit", criterion: "表达和取舍符合用户确认的偏好", check: "只让用户判断无法客观验证的偏好差异", owner: "shared" },
  ],
  cycle: ["执行当前子目标", "收集可观察证据", "通过对应质检", "只修复未通过项", "决定继续、交付或升级确认"],
  maxRounds: 4,
  stopConditions: ["总目标已完成", "所有阻断性检查已通过", "需要用户判断的部分已经确认"],
  escalationConditions: ["达到最大回合仍未收敛", "目标或关键约束互相冲突", "缺少无法安全替代的输入", "下一步涉及外部或不可逆动作"],
  scopes: [
    { id: "inference-revision", scope: "inference", trigger: "当前答案内部不一致或证据不足", action: "在同一次推理中修正一次并显式标出未知", maxCycles: 1, stateDependency: "仅依赖当前输入", stop: "逻辑一致或仍存在无法消除的未知" },
    { id: "task-retry", scope: "task-retry", trigger: "可观察检查未通过", action: "只修复失败项并复检受影响部分", maxCycles: 3, stateDependency: "保留当前任务结果和检查证据", stop: "通过、无进展或达到上限" },
    { id: "interaction-checkpoint", scope: "interaction", trigger: "剩余判断不可由 AI 客观验证", action: "提交一个可比较版本并请求聚焦反馈", maxCycles: 1, stateDependency: "保留本轮用户反馈", stop: "用户确认、改变方向或暂不继续" },
  ],
};

const CAPABILITY_KIND_META: Record<CapabilityKind, { label: string; icon: string }> = {
  llm: { label: "大模型推理", icon: "AI" },
  reference: { label: "参考资料", icon: "R" },
  script: { label: "可执行脚本", icon: ">_" },
  asset: { label: "产出资产", icon: "A" },
  "builtin-tool": { label: "宿主 Tools", icon: "T" },
  mcp: { label: "MCP 连接", icon: "M" },
  eval: { label: "自动测试", icon: "E" },
};

const CAPABILITY_STATUS_LABELS: Record<CapabilityStatus, string> = {
  generate: "AI 自动生成",
  "use-provided": "使用已上传资料",
  "requires-setup": "需要安装或授权",
  "not-needed": "当前不需要",
};

const CAPABILITY_LIBRARY: CapabilityCatalogItem[] = [
  {
    id: "host-file-workspace", kind: "builtin-tool", name: "读取与编辑工作区文件", path: "integrations/tool-contracts.json", layer: "runtime",
    requirement: "按任务读取、创建、修改和检查本地文件", purpose: "让 Skill 能处理真实项目、文档和目录，而不只在对话里给建议",
    reason: "适合需要基于现有文件继续工作或交付文件的任务", status: "use-provided", input: "用户授权范围内的文件路径和任务要求",
    output: "可验证的文件内容或明确的文件变更", fallback: "请用户粘贴必要内容，或只给出不会冒充已写入文件的操作说明",
    routingCondition: "任务明确涉及已有文件、项目目录或文件交付时", deterministicAdvantage: "宿主直接读写文件比让模型猜测内容可靠",
    evaluationCriteria: ["只访问任务范围内文件", "修改结果可定位并可复核"], optional: true, enabled: false, recommended: false,
    category: "文件与内容", hosts: ["Codex", "Claude Code", "Cursor", "Gemini CLI"],
  },
  {
    id: "host-document-reading", kind: "builtin-tool", name: "PDF 与文档解析", path: "integrations/tool-contracts.json", layer: "runtime",
    requirement: "从 PDF、Word 或长文档中提取结构和证据", purpose: "让上传资料真正进入任务，而不是只记录文件名",
    reason: "适合简历、报告、研究资料、合同或说明书等文档任务", status: "use-provided", input: "用户提供的文档和需要关注的范围",
    output: "带页码或章节依据的结构化内容", fallback: "请用户粘贴关键页文字，并明确未读取到的范围",
    routingCondition: "输入包含 PDF、Word 或需要逐页理解的长文档时", deterministicAdvantage: "先解析文档结构能减少遗漏并保留证据位置",
    evaluationCriteria: ["实际引用文档内容", "说明读取范围和无法解析的部分"], optional: true, enabled: false, recommended: false,
    category: "文件与内容", hosts: ["Codex", "Claude（支持文件的宿主）", "通用 Agent"],
  },
  {
    id: "host-image-understanding", kind: "builtin-tool", name: "图片与截图理解", path: "integrations/tool-contracts.json", layer: "runtime",
    requirement: "读取截图、界面、图表或视觉参考", purpose: "把视觉输入转成可执行判断、修改建议或结构化信息",
    reason: "适合 UI、图表、素材、报错截图和视觉范例", status: "use-provided", input: "图片及用户希望检查的重点",
    output: "基于可见内容的分析或后续处理输入", fallback: "请用户描述关键可见信息，不声称已经看过图片",
    routingCondition: "用户提供图片、截图、图表或视觉参考时", deterministicAdvantage: "直接读取像素内容比根据文件名推测可靠",
    evaluationCriteria: ["结论对应可见证据", "不臆测画面外内容"], optional: true, enabled: false, recommended: false,
    category: "文件与内容", hosts: ["Codex", "Claude", "Cursor（依宿主）"],
  },
  {
    id: "host-spreadsheet-analysis", kind: "builtin-tool", name: "表格分析与文件交付", path: "integrations/tool-contracts.json", layer: "runtime",
    requirement: "读取、计算、校验并输出 CSV 或电子表格", purpose: "处理真实数据表并交付可继续编辑的文件",
    reason: "适合清洗、统计、筛选、对比和结构化结果", status: "use-provided", input: "表格文件、字段含义和已确认的计算规则",
    output: "经过校验的表格结果与异常说明", fallback: "输出可复制的表格和明确公式，不声称创建了文件",
    routingCondition: "任务输入或交付物是 CSV、XLSX 或结构化表格时", deterministicAdvantage: "表格运行时与代码能复核公式、类型和输出文件",
    evaluationCriteria: ["计算规则可追溯", "输出文件和异常行可检查"], optional: true, enabled: false, recommended: false,
    category: "文件与内容", hosts: ["Codex", "Claude Code", "通用 Agent（需表格工具）"],
  },
  {
    id: "host-shell-code", kind: "builtin-tool", name: "终端、代码运行与测试", path: "integrations/tool-contracts.json", layer: "runtime",
    requirement: "运行命令、脚本、测试和自动化流程", purpose: "让 Skill 能验证代码与确定性步骤，而不是只生成未经运行的文本",
    reason: "适合开发、数据处理、批量文件和需要可重复验证的任务", status: "use-provided", input: "明确命令、允许访问的目录和运行参数",
    output: "退出状态、标准输出、测试结果或生成文件", fallback: "给出待运行命令并明确尚未执行，不宣称测试通过",
    routingCondition: "任务需要执行代码、命令、测试或批量自动化时", deterministicAdvantage: "真实运行结果能证明步骤是否成功",
    evaluationCriteria: ["检查退出码和产物", "失败时保留原文件并报告原因"], optional: true, enabled: false, recommended: false,
    category: "代码与自动化", hosts: ["Codex", "Claude Code", "Cursor", "Gemini CLI"],
  },
  {
    id: "host-git-workflow", kind: "builtin-tool", name: "Git 与代码库工作流", path: "integrations/tool-contracts.json", layer: "runtime",
    requirement: "检查代码差异、提交历史、分支和测试状态", purpose: "支持真实仓库里的修复、审查和可追踪交付",
    reason: "适合代码修改、PR 审查、回归定位和版本交付", status: "use-provided", input: "目标仓库、变更范围和允许的 Git 动作",
    output: "差异、诊断、提交或 PR 准备结果", fallback: "基于用户粘贴的差异审查，并列出尚未执行的仓库动作",
    routingCondition: "任务发生在 Git 仓库或明确要求审查、提交、分支、PR 时", deterministicAdvantage: "真实仓库状态能避免基于过期代码作答",
    evaluationCriteria: ["不覆盖无关改动", "每项结论可对应差异或日志"], optional: true, enabled: false, recommended: false,
    category: "代码与自动化", hosts: ["Codex", "Claude Code", "Cursor", "Gemini CLI"],
  },
  {
    id: "host-parallel-agents", kind: "builtin-tool", name: "并行子任务与子 Agent", path: "integrations/tool-contracts.json", layer: "runtime",
    requirement: "把互不依赖的研究、检查或实现拆成并行子任务", purpose: "缩短复杂任务耗时，并让不同检查互相独立",
    reason: "适合包含多个独立来源、模块或评测维度的复杂工作", status: "use-provided", input: "清晰、互不重叠且可以合并的子任务",
    output: "带来源和边界的子结果，由主 Agent 统一复核", fallback: "由单一 Agent 顺序执行相同步骤，并保留同一验证标准",
    routingCondition: "至少存在两个互不依赖且各自有明确交付的子任务时", deterministicAdvantage: "并行不是质量保证；通过独立任务边界减少互相污染",
    evaluationCriteria: ["没有重复或遗漏子任务", "主结果对各子结果做最终复核"], optional: true, enabled: false, recommended: false,
    category: "代码与自动化", hosts: ["Codex", "Claude Code（依宿主能力）"],
  },
  {
    id: "host-web-search", kind: "builtin-tool", name: "联网搜索与来源核验", path: "integrations/tool-contracts.json", layer: "runtime",
    requirement: "查询可能变化的最新信息并核对来源", purpose: "让依赖时效性的结果使用真实网页证据",
    reason: "适合新闻、价格、产品、政策、竞品和最新资料", status: "use-provided", input: "明确搜索问题、时间范围和优先来源",
    output: "带链接、日期和关键证据的结论", fallback: "说明知识时点并请用户提供链接，不把旧知识写成最新事实",
    routingCondition: "答案可能随时间变化，或用户明确要求搜索、核实和引用时", deterministicAdvantage: "真实检索结果可以核对日期和出处",
    evaluationCriteria: ["关键时效事实有来源", "区分来源事实与模型推断"], optional: true, enabled: false, recommended: false,
    category: "联网与界面", hosts: ["Codex", "Claude（需 Web Search 或 MCP）", "通用 Agent"],
  },
  {
    id: "host-browser-computer", kind: "builtin-tool", name: "浏览器与界面操作", path: "integrations/tool-contracts.json", layer: "runtime",
    requirement: "查看网页状态、填写界面或验证真实交互", purpose: "把网页任务从操作说明升级为可观察的界面执行与检查",
    reason: "适合登录态网页、本地应用测试、表单和交互流程", status: "use-provided", input: "目标页面、允许的操作范围和任何外部动作确认",
    output: "页面状态、操作结果或截图证据", fallback: "给出逐步操作说明，并明确没有实际点击或提交",
    routingCondition: "任务必须查看或操作真实网页界面才能完成时", deterministicAdvantage: "真实页面状态能验证控件、错误和结果是否存在",
    evaluationCriteria: ["提交前获得必要确认", "结果有可观察页面证据"], optional: true, enabled: false, recommended: false,
    category: "联网与界面", hosts: ["Codex（浏览器/计算机能力）", "Claude（依宿主）"],
  },
  {
    id: "host-image-generation", kind: "builtin-tool", name: "图片生成与视觉变体", path: "integrations/tool-contracts.json", layer: "runtime",
    requirement: "根据目标生成或编辑位图素材", purpose: "让视觉任务交付真实图片，而不只输出绘图提示词",
    reason: "适合海报、概念图、配图、素材变体和图片编辑", status: "use-provided", input: "画面目标、风格、尺寸和参考图片",
    output: "可查看的图片结果及必要的使用说明", fallback: "交付结构化视觉 Brief 与提示词，并说明未生成图片",
    routingCondition: "最终交付明确包含新图片或图片编辑时", deterministicAdvantage: "调用图像模型能产生真实视觉产物",
    evaluationCriteria: ["实际产生图片", "结果符合构图和使用场景"], optional: true, enabled: false, recommended: false,
    category: "联网与界面", hosts: ["Codex / OpenAI 宿主", "其他宿主需图像工具"],
  },
  {
    id: "mcp-github", kind: "mcp", name: "GitHub MCP", path: "integrations/tool-contracts.json", layer: "runtime",
    requirement: "读取 Issue、PR、仓库元数据或执行获批的 GitHub 动作", purpose: "连接 GitHub 的远程协作状态",
    reason: "适合必须访问远程 Issue、PR、检查或评论的工作流", status: "requires-setup", input: "仓库范围、目标 Issue/PR 和授权边界",
    output: "真实 GitHub 对象或动作回执", fallback: "使用本地 Git 和用户粘贴的远程信息完成降级版本",
    routingCondition: "任务必须读取或修改 GitHub 远程对象时", deterministicAdvantage: "MCP 返回远程系统的真实状态",
    evaluationCriteria: ["运行前验证连接", "写操作前明确确认"], connection: { server: "GitHub MCP", tools: [], verified: false }, optional: true, enabled: false, recommended: false,
    category: "外部服务 MCP", hosts: ["Codex", "Claude Code", "任意 MCP Client"],
  },
  {
    id: "mcp-knowledge-workspace", kind: "mcp", name: "知识库 / 云盘 MCP", path: "integrations/tool-contracts.json", layer: "runtime",
    requirement: "从 Notion、Google Drive、SharePoint 或指定知识库读取资料", purpose: "让 Skill 使用团队的最新知识，而不是要求用户反复复制",
    reason: "适合资料长期存在于一个明确外部服务的任务", status: "requires-setup", input: "具体服务、允许访问的空间和查询目标",
    output: "带来源位置的资料内容", fallback: "请用户上传或粘贴必要资料，并说明未连接外部知识库",
    routingCondition: "必要资料只存在于用户指定的云盘或知识库时", deterministicAdvantage: "MCP 可返回服务内最新、可定位的资料",
    evaluationCriteria: ["只读取授权范围", "输出保留来源位置"], connection: { server: "请填写具体知识库 MCP", tools: [], verified: false }, optional: true, enabled: false, recommended: false,
    category: "外部服务 MCP", hosts: ["Codex", "Claude Code", "任意 MCP Client"],
  },
  {
    id: "mcp-communication", kind: "mcp", name: "消息与协作 MCP", path: "integrations/tool-contracts.json", layer: "runtime",
    requirement: "读取或在确认后发送 Slack、Teams、邮件或日历内容", purpose: "连接真实协作流程和外部动作",
    reason: "适合需要处理消息、会议或发送结果的任务", status: "requires-setup", input: "具体服务、目标对象、内容和发送确认",
    output: "真实消息、事件或服务回执", fallback: "生成待发送草稿，由用户手动发送或创建事件",
    routingCondition: "任务明确要求读取或写入某个消息、邮件或日历服务时", deterministicAdvantage: "MCP 能返回外部服务的真实回执",
    evaluationCriteria: ["外部写入前确认", "失败时不声称已发送"], connection: { server: "请填写具体协作服务 MCP", tools: [], verified: false }, optional: true, enabled: false, recommended: false,
    category: "外部服务 MCP", hosts: ["Codex", "Claude Code", "任意 MCP Client"],
  },
];

const DEMO_SKILL = `---
name: my-personal-skill
description: Help the user complete a recurring task according to their confirmed goals, preferences, examples, and collaboration boundaries. Use when the user wants an AI agent to work in a way that feels personally aligned rather than generically correct.
---

# My Personal Skill

Complete the user's task in a way that follows their confirmed working style, quality standards, and decision boundaries.

## Goal

Complete the recurring task outcome the user requested without replacing it with a score, checklist, or formatting target.

## Workflow

1. Read the current goal, source material, and the minimum relevant personal context.
2. Restate the intended outcome when the request is ambiguous.
3. Follow the user's preferred order of work and communication style.
4. Ask before crossing a confirmed collaboration boundary.
5. Apply the user's confirmed degree of polishing, expansion, inference, or creative completion without silently narrowing it.
6. Deliver the result using the user's acceptance criteria.
7. Run the personal-fit checklist before delivery.

## Runtime workflow

- When a required input is missing, follow the user's confirmed missing-information choice; stop only when the missing value would materially change the result.
- When an observable output check fails, repair only the affected part and stop after the declared task-retry limit.
- When the remaining decision is subjective, deliver one comparable result and ask for focused feedback instead of claiming that the preference is proven.

## Personal-fit rules

- Prefer the user's confirmed examples over generic stylistic defaults.
- Do not infer a lasting preference from a single request.
- Explain material tradeoffs before making a decision on the user's behalf.
- When context conflicts, ask which source or preference should take priority.

## Guardrails

- Never expose private context that is unnecessary for the current task.
- Do not store credentials or sensitive personal data in the Skill.
- Do not claim to know the user beyond confirmed information.
- Request confirmation before external actions, spending, publishing, or irreversible changes.

## Verification

- The result addresses the user's stated goal.
- The response follows confirmed style and workflow preferences.
- No collaboration boundary was crossed.
- Unsupported assumptions are labeled.
- The output avoids patterns present in the user's negative example.`;

const DEFAULT_SKILL_IR = bindSkillIREvals(createCanonicalSkillIR({
  skillName: "my-personal-skill",
  idea: "完成当前任务",
  answers: {},
  plan: DEFAULT_CAPABILITY_PLAN,
  loop: DEFAULT_LOOP_PLAN,
  files: { "SKILL.md": DEMO_SKILL },
}), createSpecificEvals("my-personal-skill", "完成当前任务", {}, DEFAULT_LOOP_PLAN, DEFAULT_CAPABILITY_PLAN));

const DEFAULT_FILES: Record<string, string> = {
  "SKILL.md": DEMO_SKILL,
  "evals/evals.json": createSpecificEvals("my-personal-skill", "完成当前任务", {}, DEFAULT_LOOP_PLAN, DEFAULT_CAPABILITY_PLAN),
  "evals/graders.json": createEvalGraders("my-personal-skill", "完成当前任务", {}, DEFAULT_LOOP_PLAN, DEFAULT_CAPABILITY_PLAN),
  "evals/skill-ir.json": JSON.stringify(DEFAULT_SKILL_IR, null, 2),
  "evals/capability-manifest.json": createCapabilityManifest(DEFAULT_CAPABILITY_PLAN, createSpecificEvals("my-personal-skill", "完成当前任务", {}, DEFAULT_LOOP_PLAN, DEFAULT_CAPABILITY_PLAN), DEFAULT_LOOP_PLAN, undefined, DEFAULT_SKILL_IR),
  "evals/result.schema.json": createEvalResultSchema(),
  "evals/artifact_checker.py": createArtifactChecker(),
  "evals/run_evals.py": createEvalRunner(),
  "agents/openai.yaml": `interface:
  display_name: My Personal Skill
  short_description: Work according to my confirmed preferences
  default_prompt: Help me with this task using my confirmed goals, working style, and boundaries.`,
};

const DEFAULT_EVALS: EvalResult[] = [
  { label: "知道什么时候该帮你", detail: "等待真实任务试跑", issue: "还没有用具体任务验证它能否被正确叫出。", score: 0, tone: "bad" },
  { label: "会不会按你的方式推进", detail: "等待真实任务试跑", issue: "还没有看到它是否遵循你确认的协作节奏。", score: 0, tone: "bad" },
  { label: "结果像不像你要的", detail: "等待真实任务试跑", issue: "还没有可以和你的理想结果对照的 Demo。", score: 0, tone: "bad" },
  { label: "有没有用对你的资料", detail: "等待真实任务试跑", issue: "还没有验证资料、示例与工具是否真正影响结果。", score: 0, tone: "bad" },
  { label: "换个场景还能不能做好", detail: "等待真实任务试跑", issue: "还没有验证它面对变化时是否仍能稳定工作。", score: 0, tone: "bad" },
];

const FRIENDLY_EVAL_LABELS = [
  "知道什么时候该帮你",
  "会不会按你的方式推进",
  "结果像不像你要的",
  "有没有用对你的资料",
  "换个场景还能不能做好",
] as const;

type SkillIdentity = {
  name: string;
  displayName: string;
  description: string;
  shortDescription: string;
  defaultPrompt: string;
};

function compactTaskPhrase(idea: string) {
  return idea
    .trim()
    .replace(/^(我想要?|我希望|请|麻烦)?\s*(让|用)?\s*(AI\s*)?(帮我|帮助我)?\s*/i, "")
    .replace(/[。！？!?]+$/g, "")
    .trim()
    .slice(0, 80) || "完成当前任务";
}

function capabilityIsActive(item: CapabilityItem) {
  return item.status !== "not-needed" && item.enabled !== false && item.necessity?.decision !== "exclude";
}

function capabilityNecessity(item: CapabilityItem) {
  if (item.necessity?.decision) return item.necessity;
  const deterministicNeed = item.kind === "script" && /计算|公式|排序|筛选|去重|校验|转换|批量|deterministic|calculate|sort|validate/i.test(`${item.requirement} ${item.purpose}`);
  const realResourceAvailable = item.kind === "llm" || item.kind === "eval" || item.status === "use-provided" || item.status === "generate";
  const externalDependency = item.kind === "builtin-tool" || item.kind === "mcp";
  const bareModelReliable = item.kind === "llm" || (item.kind === "reference" && !/官方|规范|标准|来源|schema|API|字段|术语|反例|失败模式/i.test(`${item.requirement} ${item.purpose}`));
  const successLift: "high" | "medium" | "low" = deterministicNeed || (externalDependency && item.status === "use-provided") ? "high" : item.kind === "llm" || item.kind === "eval" ? "high" : bareModelReliable ? "low" : "medium";
  const route = (item.activationCondition || item.routingCondition || "").trim();
  const concreteRoute = Boolean(route) && !/^(?:当前任务需要该能力时|需要时|when needed|if needed)$/i.test(route);
  const observable = Boolean(item.evaluationCriteria?.some((criterion) => criterion.trim()));
  const honestFallback = Boolean(item.fallback?.trim()) && !/^(?:无|没有|none|n\/?a|not applicable)$/i.test(item.fallback.trim());
  const externalReady = externalDependency && item.status !== "not-needed" && concreteRoute && observable && honestFallback;
  const include = item.kind === "llm" || item.kind === "eval" || deterministicNeed || externalReady || (!bareModelReliable && realResourceAvailable && concreteRoute && observable && honestFallback);
  return {
    successLift,
    bareModelReliable,
    deterministicNeed,
    realResourceAvailable,
    externalDependency,
    decision: include ? "include" as const : item.optional ? "optional" as const : "exclude" as const,
  };
}

function createBuildTimeSkillContract(idea: string, answers: Record<string, string>, plan: CapabilityPlan, loop: LoopPlan) {
  const list = (value: string | undefined) => (value || "").split("；").map((item) => item.trim()).filter(Boolean).slice(0, 8);
  return {
    stableGoal: loop.goal,
    triggerScope: list(answers["trigger-language"]).length ? list(answers["trigger-language"]) : [compactTaskPhrase(idea)],
    supportedTasks: Array.from(new Set([compactTaskPhrase(idea), ...list(answers.outcome), ...list(answers.workflow)])).slice(0, 10),
    unsupportedOrEscalated: [...plan.outcomeModel.uncontrollableOutcomes, ...loop.escalationConditions].slice(0, 10),
    requiredInputs: list(answers.inputs),
    optionalInputs: list(answers["input-strategy"]),
    outputMode: plan.outputContract,
    domainKnowledgeNeeded: plan.items.filter((item) => capabilityIsActive(item) && item.kind === "reference").map((item) => ({ id: item.id, requirement: item.requirement, route: item.routingCondition, path: item.path })),
    toolCapabilities: plan.items.filter((item) => capabilityIsActive(item) && (item.kind === "builtin-tool" || item.kind === "mcp")).map((item) => ({ id: item.id, kind: item.kind, availability: item.status, route: item.routingCondition })),
    stateRequirement: plan.stateModel,
    contentPolicy: confirmedContentPolicy(answers) || "按当前任务的明确输入决定，不额外发明未确认权限",
    failureModes: plan.failureModes,
  };
}

function ensureCanonicalBundledResources(ir: SkillIR, files: Record<string, string>, answers: Record<string, string>) {
  return reconcileSkillIRSourceEvidence(
    reconcileSkillIRInputResolutions(reconcileSkillIRContentPermission(ir, answers), answers),
    Boolean(files["references/source-evidence.md"]?.trim()),
  );
}

function reconcileCapabilityPlanWithCanonicalIR(plan: CapabilityPlan, ir: SkillIR | null) {
  if (!ir) return plan;
  const currentById = new Map(plan.items.map((item) => [item.id, item]));
  const items: CapabilityItem[] = ir.capabilities.map((capability) => {
    const current = currentById.get(capability.id);
    return {
      id: capability.id,
      kind: capability.kind,
      name: capability.name,
      path: capability.implementation.path,
      layer: capability.implementation.layer,
      requirement: capability.requirement,
      purpose: capability.purpose,
      reason: capability.necessity.reason,
      status: capability.implementation.status,
      input: capability.input,
      output: capability.output,
      fallback: capability.fallback,
      routingCondition: capability.routingCondition,
      deterministicAdvantage: capability.necessity.deterministicNeed ? "确定性实现可重复验证" : "由运行契约控制",
      evaluationCriteria: capability.evidenceRequirements,
      scope: capability.scope,
      activationCondition: capability.activationCondition,
      affects: capability.affects,
      mustNotAffect: capability.mustNotAffect,
      connection: capability.connection,
      optional: capability.necessity.decision === "optional",
      enabled: capability.necessity.decision !== "exclude",
      recommended: current?.recommended,
      necessity: {
        successLift: capability.necessity.successLift,
        bareModelReliable: capability.necessity.bareModelReliable,
        deterministicNeed: capability.necessity.deterministicNeed,
        realResourceAvailable: capability.necessity.realResourceAvailable,
        externalDependency: capability.necessity.externalDependency,
        decision: capability.necessity.decision,
      },
    };
  });
  const output = ir.outputs[0];
  return {
    ...plan,
    summary: ir.identity.summary || plan.summary,
    outcomeModel: ir.outcomeModel,
    outputContract: output ? {
      mode: output.mode,
      format: output.name,
      requiredSections: output.requiredSections,
      artifactPatterns: output.artifactPatterns,
      validation: output.validation,
    } : plan.outputContract,
    failureModes: ir.evaluationPlan.failureModes,
    items,
  };
}

function createCanonicalSkillIR(input: {
  skillName: string;
  idea: string;
  answers: Record<string, string>;
  plan: CapabilityPlan;
  loop: LoopPlan;
  sourceEvidence?: string;
  files?: Record<string, string>;
}) {
  const files = input.files || {};
  const sourceEvidence = input.sourceEvidence || "";
  const reconciledPlan = reconcileCapabilityPlanContentPermission(input.plan, input.answers);
  const activePlan: CapabilityPlan = {
    ...reconciledPlan,
    items: reconciledPlan.items.filter(capabilityIsActive).map((item) => ({
      ...item,
      necessity: capabilityNecessity(item),
      ...canonicalCapabilityContract(item),
    })),
  };
  const userEvidence = `${input.idea}\n${confirmedAnswerEvidenceText(input.answers)}`;
  const identity = deriveSkillIdentity(input.idea, input.answers);
  const ir = compileSkillIR({
    skillName: input.skillName,
    idea: input.idea,
    answers: input.answers,
    plan: activePlan,
    loop: input.loop,
    description: identity.description,
    requirements: buildRequirementProvenance({
      idea: input.idea,
      answers: input.answers,
      sourceEvidence,
      capabilityRequirements: activePlan.items,
    }),
    informationDependencies: buildInformationDependencies({
      fields: activePlan.outputContract.requiredSections,
      availableInputs: input.answers.inputs || "",
      sourceEvidence,
      allowCreativeExpansion: contentPolicyAllowsExpansion(input.answers),
      allowFactualCreation: contentPolicyAllowsFactualCreation(input.answers),
      explicitRestriction: contentPolicyExplicitlyRestrictsExpansion(input.answers),
      missingBehavior: activePlan.stateModel.missingBehavior || "标注缺失并请求最少必要信息",
    }),
    domainEvidence: deriveDomainEvidence(files["evals/knowledge-contract.json"] || files["references/domain-playbook.md"] || "", userEvidence, sourceEvidence),
    // Scope comes from provenance-bearing requirements, never from a rendered
    // artifact. Reading SKILL.md here would create IR <-> projection cycles.
    scopeProvenance: deriveScopeProvenance(
      buildRequirementProvenance({
        idea: input.idea,
        answers: input.answers,
        sourceEvidence,
        capabilityRequirements: activePlan.items,
      }).map((item) => item.requirement).join("\n"),
      `${userEvidence}\n${sourceEvidence}`,
    ),
  });
  // Uploaded examples are implementation resources consumed by the primary
  // semantic capability. Record the path in Canonical SkillIR so the runtime
  // projector can route to it without a post-projection file edit.
  return ensureCanonicalBundledResources(ir, files, input.answers);
}

function compactThinkingPhrase(value: string) {
  const phrase = value
    .replace(/^[#>*\-\d.)、\s]+/, "")
    .replace(/[：:].*$/, "")
    .replace(/[，。；、!?！？]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return phrase.length > 16 ? `${phrase.slice(0, 16)}…` : phrase;
}

function createContextualThinkingWords(input: {
  task: BusyTask;
  idea: string;
  stage: string;
  questions: Question[];
  answers: Record<string, string>;
  blueprint: BlueprintSection[];
  capabilities: CapabilityItem[];
  loopPlan: LoopPlan;
  issues: string[];
  feedback: string[];
  demo: SkillDemo | null;
}) {
  const answeredChoices = input.questions.map((question) => input.answers[question.id]).filter(Boolean);
  const taskSources: Record<BusyTask, string[]> = {
    interview: [input.idea, ...input.questions.map((question) => question.dimension), ...answeredChoices],
    blueprint: [...input.blueprint.map((section) => section.title), ...answeredChoices, ...input.capabilities.map((item) => item.name)],
    build: [input.loopPlan.goal, ...input.loopPlan.subgoals.map((item) => item.title), ...input.capabilities.filter(capabilityIsActive).map((item) => item.name)],
    repair: [...input.issues, ...input.capabilities.filter(capabilityIsActive).map((item) => item.name), input.loopPlan.stopConditions[0] || ""],
    evaluate: [input.idea, input.demo?.title || "", ...(input.demo?.uncertainties || []), ...input.capabilities.filter(capabilityIsActive).map((item) => item.name)],
    personalize: [...input.feedback, input.demo?.title || "", ...(input.demo?.uncertainties || []), ...input.loopPlan.qualityGates.map((item) => item.criterion)],
  };
  const words = [input.stage, ...taskSources[input.task]]
    .map(compactThinkingPhrase)
    .filter((word) => word.length >= 2);
  return Array.from(new Set(words)).slice(0, 8);
}

function deriveLoopPlan(idea: string, answers: Record<string, string>, capabilityPlan: CapabilityPlan = DEFAULT_CAPABILITY_PLAN): LoopPlan {
  const task = compactTaskPhrase(idea);
  const outcome = answers.outcome?.trim() || `完成“${task}”并交付可用结果`;
  const workflow = answers.workflow?.trim() || "";
  const autonomy = answers.autonomy?.trim() || "";
  const quality = [answers.style, answers["good-example"]].filter(Boolean).join("；");
  const subjectiveSignals = /风格|表达|语气|个人|像我|偏好|创意|审美|满意|一起迭代|我确认/i.test(`${quality}；${workflow}；${idea}`);
  const objectiveSignals = /数据|代码|脚本|文件|格式|结构|事实|来源|计算|转换|校验|清单|表格|搜索|研究|指标/i.test(`${quality}；${idea}`)
    || capabilityPlan.items.some((item) => capabilityIsActive(item) && item.status === "generate" && item.kind === "script");
  const autonomousSignals = /自动|自主|直接推进|明确规则/i.test(`${autonomy}；${workflow}`);
  const mode: LoopMode = subjectiveSignals && objectiveSignals
    ? "hybrid"
    : subjectiveSignals
      ? "turn-based"
      : objectiveSignals && autonomousSignals
        ? "goal-driven"
        : "hybrid";
  const label = mode === "turn-based" ? "回合确认循环" : mode === "goal-driven" ? "目标收敛循环" : "混合循环";
  const reason = mode === "turn-based"
    ? "关键好坏主要依赖人的主观判断，因此每轮只提交一个可比较版本，由用户反馈后再继续。"
    : mode === "goal-driven"
      ? "关键标准可以通过结果、数据、脚本或结构化检查自主验证，因此 AI 可以围绕目标持续修复直到通过或触发停止条件。"
      : "一部分标准能够自动检查，另一部分必须由用户判断；先自动收敛客观问题，再用明确回合确认主观差异。";
  const modeVerification = mode === "turn-based"
    ? "提交一版可比较结果，等待用户指出差距；不得声称已自主证明主观质量"
    : mode === "goal-driven"
      ? "运行与当前子目标对应的检查，记录证据并只修复未通过项"
      : "先运行客观检查，再把无法自动判断的表达、取舍或偏好交给用户确认";
  const userQuality = answers.style?.trim() || answers["good-example"]?.trim() || "结果完整、清楚并且可以直接使用";
  const failurePattern = answers["bad-example"]?.trim() || "忽略输入、偏离目标或交付不可用";
  return {
    mode,
    label,
    reason,
    goal: `在已确认的场景和边界内完成“${task}”，核心结果是：${outcome}。`,
    subgoals: [
      { id: "establish-task-state", title: "建立任务状态", outcome: "目标、必要输入、交付形式和边界已明确", verification: "只检查是否存在会改变任务方向的阻断缺口" },
      { id: "produce-working-result", title: "产出可检查版本", outcome: `形成一版能够承载“${outcome}”的真实结果`, verification: "确认交付物已生成且覆盖核心任务，不用质量形容词代替产出" },
      { id: "close-observed-gaps", title: "收敛已发现差距", outcome: "已发现的客观问题被修复，需要个人判断的差异已确认", verification: modeVerification },
    ],
    qualityGates: [
      { id: "goal-alignment", criterion: "结果没有偏离用户原始目标", check: "对照任务、输入和预期交付；质检项只能判断是否通过，不能成为新的工作目标", owner: "ai" },
      { id: "confirmed-quality", criterion: userQuality, check: mode === "goal-driven" ? "使用可观察证据、结构或工具结果逐项检查" : "自动检查可验证部分，把主观差异交给用户判断", owner: mode === "goal-driven" ? "ai" : "shared" },
      { id: "failure-avoidance", criterion: `没有出现已确认的失败模式：${failurePattern}`, check: "用反例和当前结果做定向对照，只指出实际出现的差距", owner: mode === "turn-based" ? "shared" : "ai" },
    ],
    cycle: mode === "turn-based"
      ? ["完成当前子目标并提交一版", "请用户只反馈最影响结果的差距", "把反馈映射到原目标或质检项", "定向修改并进入下一回合", "用户确认或达到上限后停止"]
      : mode === "goal-driven"
        ? ["执行当前子目标", "运行对应检查并记录证据", "只修复未通过项", "重新检查受影响部分", "全部通过、无法继续或达到上限时停止"]
        : ["执行当前子目标", "先运行可自动验证的检查", "修复客观问题", "把主观差异作为一个明确回合交给用户确认", "合并反馈后复检并决定继续或停止"],
    maxRounds: mode === "goal-driven" ? 3 : 4,
    stopConditions: mode === "goal-driven"
      ? ["总目标已经完成", "所有阻断性检查有可观察证据并通过", "继续迭代不再产生与目标相关的改进"]
      : ["总目标已经完成", "所有阻断性检查已通过", "需要用户判断的部分已经明确确认"],
    escalationConditions: ["达到最大回合仍未收敛", "目标、子目标或关键约束互相冲突", "缺少无法安全替代的必要输入", "下一步涉及外部、付费、发布或不可逆动作"],
    scopes: [
      { id: "inference-revision", scope: "inference", trigger: "推理结果与当前证据冲突", action: "只在本次回答内部重查一次证据和假设", maxCycles: 1, stateDependency: "当前请求与已加载资料", stop: "得到一致解释或明确保留未知" },
      { id: "task-retry", scope: "task-retry", trigger: "当前子目标的可观察检查未通过", action: "只修复失败项并复检受影响部分", maxCycles: mode === "goal-driven" ? 3 : 2, stateDependency: "当前任务产物与检查证据", stop: "通过、无进展或达到上限" },
      ...(mode === "goal-driven" ? [] : [{ id: "interaction-checkpoint", scope: "interaction" as const, trigger: "剩余差异需要用户主观判断", action: "提交一个可比较版本并请求聚焦反馈", maxCycles: 1, stateDependency: "本轮反馈", stop: "用户确认、改变方向或暂不继续" }]),
      ...(capabilityPlan.stateModel.needed && capabilityPlan.stateModel.scope === "persistent" ? [{ id: "longitudinal-update", scope: "longitudinal" as const, trigger: "跨会话状态出现新事实、更正或到期", action: "按字段更新规则重算受影响部分", maxCycles: 1, stateDependency: capabilityPlan.stateModel.fields.map((field) => field.name).join("、") || "持久状态", stop: "状态已更新、删除或等待用户确认" }] : []),
    ],
  };
}

function normalizeLoopPlan(value: unknown, fallback: LoopPlan): LoopPlan {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  const allowedModes = new Set<LoopMode>(["turn-based", "goal-driven", "hybrid"]);
  const mode = allowedModes.has(raw.mode as LoopMode) ? raw.mode as LoopMode : fallback.mode;
  const cleanText = (input: unknown, backup: string, max = 360) => typeof input === "string" && input.trim() ? input.trim().slice(0, max) : backup;
  const cleanList = (input: unknown, backup: string[], max = 8) => Array.isArray(input)
    ? input.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim().slice(0, 240)).slice(0, max)
    : backup;
  const subgoals = Array.isArray(raw.subgoals) ? raw.subgoals.slice(0, 6).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.title !== "string" || typeof candidate.outcome !== "string") return [];
    if (/评分|分数|质检|评测|质量达标|通过.{0,8}(?:检查|门禁|标准)|符合.{0,8}(?:评分|质检标准)/i.test(`${candidate.title}；${candidate.outcome}`)) return [];
    return [{
      id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") : `subgoal-${index + 1}`,
      title: candidate.title.trim().slice(0, 80),
      outcome: candidate.outcome.trim().slice(0, 280),
      verification: cleanText(candidate.verification, fallback.subgoals[Math.min(index, fallback.subgoals.length - 1)]?.verification || "检查可观察结果", 280),
    }];
  }) : [];
  let qualityGates = Array.isArray(raw.qualityGates) ? raw.qualityGates.slice(0, 6).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.criterion !== "string" || typeof candidate.check !== "string") return [];
    const owner = candidate.owner === "user" || candidate.owner === "shared" ? candidate.owner : "ai";
    return [{ id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") : `gate-${index + 1}`, criterion: candidate.criterion.trim().slice(0, 240), check: candidate.check.trim().slice(0, 300), owner }];
  }) : [];
  qualityGates = qualityGates.length >= 2 ? qualityGates : fallback.qualityGates;
  if (mode !== "goal-driven" && !qualityGates.some((item) => item.owner === "user" || item.owner === "shared")) {
    qualityGates = qualityGates.map((item, index) => index === qualityGates.length - 1 ? { ...item, owner: "shared" as const } : item);
  }
  const allowedScopes = new Set(["inference", "task-retry", "interaction", "longitudinal"]);
  const scopes = Array.isArray(raw.scopes) ? raw.scopes.slice(0, 6).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (!allowedScopes.has(String(candidate.scope)) || typeof candidate.trigger !== "string" || typeof candidate.action !== "string") return [];
    return [{
      id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") : `scope-${index + 1}`,
      scope: candidate.scope as LoopPlan["scopes"][number]["scope"],
      trigger: candidate.trigger.trim().slice(0, 240),
      action: candidate.action.trim().slice(0, 280),
      maxCycles: typeof candidate.maxCycles === "number" ? Math.min(12, Math.max(1, Math.round(candidate.maxCycles))) : 1,
      stateDependency: cleanText(candidate.stateDependency, "当前任务上下文", 200),
      stop: cleanText(candidate.stop, "完成、无进展或达到上限", 240),
    }];
  }) : [];
  return {
    mode,
    label: cleanText(raw.label, mode === "turn-based" ? "回合确认循环" : mode === "goal-driven" ? "目标收敛循环" : "混合循环", 80),
    reason: cleanText(raw.reason, fallback.reason, 480),
    goal: fallback.goal,
    subgoals: subgoals.length >= 2 ? subgoals : fallback.subgoals,
    qualityGates,
    cycle: cleanList(raw.cycle, fallback.cycle),
    maxRounds: typeof raw.maxRounds === "number" ? Math.min(6, Math.max(2, Math.round(raw.maxRounds))) : fallback.maxRounds,
    stopConditions: cleanList(raw.stopConditions, fallback.stopConditions, 6),
    escalationConditions: cleanList(raw.escalationConditions, fallback.escalationConditions, 6),
    scopes: scopes.length ? scopes : fallback.scopes,
  };
}

function createLoopPlanReference(plan: LoopPlan) {
  const ownerLabel = { ai: "AI", user: "用户", shared: "AI 先检、用户确认" } as const;
  return `# Goal decomposition and execution loop

## Overall goal

${plan.goal}

## Subgoals

${plan.subgoals.map((item, index) => `${index + 1}. **${item.title}**\n   - Outcome: ${item.outcome}\n   - Verification: ${item.verification}`).join("\n")}

## Loop mode

- Mode: ${plan.mode}
- Human label: ${plan.label}
- Why: ${plan.reason}
- Maximum rounds: ${plan.maxRounds}

${plan.cycle.map((item, index) => `${index + 1}. ${item}`).join("\n")}

## Quality gates

Quality gates are acceptance checks. They must never replace, expand, or become the overall goal or a subgoal.

${plan.qualityGates.map((item) => `- **${item.criterion}** (${ownerLabel[item.owner]}): ${item.check}`).join("\n")}

## Stop conditions

${plan.stopConditions.map((item) => `- ${item}`).join("\n")}

## Escalate instead of looping

${plan.escalationConditions.map((item) => `- ${item}`).join("\n")}

## Loop scopes

These loops are independent controls. Do not treat a task retry as long-term tracking or a user checkpoint as hidden autonomous iteration.

${plan.scopes.map((item) => `- **${item.scope}** — trigger: ${item.trigger}; action: ${item.action}; limit: ${item.maxCycles}; state: ${item.stateDependency}; stop: ${item.stop}`).join("\n")}`;
}

function reconcileLoopPlanState(plan: LoopPlan, capabilityPlan: CapabilityPlan): LoopPlan {
  if (capabilityPlan.stateModel.scope === "persistent") return plan;
  return {
    ...plan,
    scopes: plan.scopes.filter((scope) => scope.scope !== "longitudinal"),
    escalationConditions: [...new Set([...plan.escalationConditions, "需要跨会话继续时，由用户重新提供必要状态；当前 Skill 不承诺自动恢复历史状态"])],
  };
}

function deriveSkillIdentity(idea: string, answers: Record<string, string> = {}): SkillIdentity {
  const task = compactTaskPhrase(idea);
  const asciiWords = task.toLowerCase().match(/[a-z0-9]+/g)?.slice(0, 4) || [];
  const semanticAsciiWords = asciiWords.filter((word) => !/^(?:markdown|md|csv|pdf|docx?|word|xlsx?|excel|json|html|file|document|output|report)$/.test(word));
  const action = [
    { pattern: /修改|改写|润色|优化|编辑|校对/, value: "revise" },
    { pattern: /写|创作|文案|生成/, value: "write" },
    { pattern: /规划|计划|安排|路线/, value: "plan" },
    { pattern: /研究|调研|检索|搜索/, value: "research" },
    { pattern: /分析|评估|诊断|复盘/, value: "analyze" },
    { pattern: /整理|总结|归纳|提炼/, value: "summarize" },
    { pattern: /比较|选|决策|判断/, value: "compare" },
    { pattern: /学习|教学|辅导|练习/, value: "learn" },
  ].find((item) => item.pattern.test(task))?.value || "guide";
  const domain = [
    { pattern: /客户.{0,8}(?:访谈|反馈|洞察)|用户.{0,8}(?:访谈|反馈|洞察)/, value: "customer-insights" },
    { pattern: /需求.{0,8}(?:清单|排序|优先级|分析|整理)|优先级.{0,8}需求/, value: "requirements" },
    { pattern: /邮件|email/, value: "email" },
    { pattern: /文章|内容|帖子|社媒|公众号/, value: "content" },
    { pattern: /报告|方案|文档/, value: "documents" },
    { pattern: /会议|纪要/, value: "meetings" },
    { pattern: /营销|推广|广告|品牌/, value: "marketing" },
    { pattern: /学习|课程|考试|知识/, value: "study" },
    { pattern: /代码|程序|网站|应用/, value: "software" },
    { pattern: /健身|运动|训练/, value: "fitness" },
    { pattern: /饮食|菜谱|做饭/, value: "meals" },
    { pattern: /简历|面试|求职|职业|resume|career/, value: "career" },
    { pattern: /旅行|行程|旅游|travel|trip/, value: "travel" },
    { pattern: /红人|达人|博主|influencers?/, value: "creators" },
    { pattern: /产品|竞品|product/, value: "products" },
    { pattern: /数据|指标|表格|excel|sql|data/, value: "data" },
    { pattern: /研究|调研|搜索|research/, value: "research" },
  ].find((item) => item.pattern.test(task))?.value || "workflow";
  const actionLabel: Record<string, string> = { revise: "修改和优化", write: "创作", plan: "规划", research: "研究与核验", analyze: "分析判断", summarize: "整理提炼", compare: "比较决策", learn: "学习辅导", guide: "引导完成" };
  const domainLabel: Record<string, string> = { "customer-insights": "客户洞察", requirements: "需求管理", email: "邮件", content: "内容", documents: "文档", meetings: "会议", marketing: "营销", study: "学习", software: "软件任务", fitness: "训练", meals: "饮食", career: "职业任务", travel: "旅行任务", creators: "创作者任务", products: "产品任务", data: "数据任务", research: "研究任务", workflow: "重复性任务" };
  const name = semanticAsciiWords.length ? `${action}-${semanticAsciiWords.join("-")}`.slice(0, 63).replace(/-+$/g, "") : `${action}-${domain}`;
  const triggerExamples = (answers["trigger-language"] || "").split("；").map((item) => item.trim()).filter(Boolean).slice(0, 2);
  const triggerClause = triggerExamples.length ? `典型表达包括“${triggerExamples.join("”或“")}”。` : "";
  const capabilityDescription = `完成“${task}”：根据当前输入识别必要条件、执行领域步骤并交付可检查结果。${triggerClause}用于用户直接提出该任务，或提供与该任务相关的新材料继续处理时；不用于只解释相关概念或处理无关任务。`;
  return {
    name,
    displayName: semanticAsciiWords.length ? semanticAsciiWords.map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ") : `${actionLabel[action]}${domainLabel[domain]}`,
    description: capabilityDescription,
    shortDescription: `${actionLabel[action]}${domainLabel[domain]}并交付可检查结果`,
    defaultPrompt: `Use $${name} to complete this ${domain} task using the current inputs and the confirmed execution rules.`,
  };
}

function confirmedContentPolicy(answers: Record<string, string>) {
  return resolveContentPermission(answers).sourceText;
}

function contentPolicyAllowsExpansion(answers: Record<string, string>) {
  return resolveContentPermission(answers).allowCreativeExpansion;
}

function contentPolicyAllowsFactualCreation(answers: Record<string, string>) {
  return resolveContentPermission(answers).allowFactualCreation;
}

function contentPolicyExplicitlyRestrictsExpansion(answers: Record<string, string>) {
  return resolveContentPermission(answers).explicitRestriction;
}

function reconcileConfirmedContentPolicy(text: string, answers: Record<string, string>) {
  return reconcileContentPermissionText(text, resolveContentPermission(answers));
}

function reconcileKnowledgePackContentPermission(pack: KnowledgePack, answers: Record<string, string>) {
  const permission = resolveContentPermission(answers);
  if (permission.explicitRestriction) return pack;
  return filterKnowledgePackAtoms(pack, (atom) => hasContentPermissionConflict([
    atom.title,
    atom.knowledge,
    atom.appliesWhen,
    atom.action,
    atom.exception,
  ].join("\n"), permission), "与用户明确确认的内容补写、估算或新增权限冲突");
}

function reconcileConfirmedContentPolicyArtifact(path: string, text: string, answers: Record<string, string>) {
  if (!path.endsWith(".json")) return reconcileConfirmedContentPolicy(text, answers);
  try {
    const visit = (value: unknown): unknown => {
      if (typeof value === "string") return reconcileConfirmedContentPolicy(value, answers);
      if (Array.isArray(value)) return value.map(visit);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, visit(item)]));
      return value;
    };
    return JSON.stringify(visit(JSON.parse(text)), null, 2);
  } catch {
    return reconcileConfirmedContentPolicy(text, answers);
  }
}

function repairMarkdownEmphasis(text: string) {
  return text.split("\n").map((line) => ((line.match(/\*\*/g)?.length || 0) % 2 !== 0 ? `${line}**` : line)).join("\n");
}

function sensitiveMatchCount(text: string) {
  const patterns = [
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    /(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)/g,
    /(?<!\d)\d{17}[\dXx](?!\d)/g,
    /\b(?:sk|api)[-_][A-Za-z0-9_-]{12,}\b/g,
  ];
  return patterns.reduce((count, pattern) => count + (text.match(pattern)?.length || 0), 0);
}

function redactSensitiveText(text: string) {
  const redacted = text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[已隐藏：邮箱]")
    .replace(/(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)/g, "[已隐藏：手机号]")
    .replace(/(?<!\d)\d{17}[\dXx](?!\d)/g, "[已隐藏：证件号]")
    .replace(/\b(?:sk|api)[-_][A-Za-z0-9_-]{12,}\b/g, "[已隐藏：密钥]");
  return redacted.replace(/^(#\s+)([^\n]{2,24})(?=\n[\s\S]{0,220}\[已隐藏：(邮箱|手机号)\])/m, "$1[已隐藏：姓名]");
}

function sanitizeSkillFiles(files: Record<string, string>) {
  return Object.fromEntries(Object.entries(files).map(([name, content]) => [name, redactSensitiveText(content)]));
}

function friendlyReleaseBlocker(item: string) {
  return item
    .replace(/Eval Harness/gi, "自动测试系统")
    .replace(/SKILL\.md/gi, "主文件")
    .replace(/Tools?\/MCP/gi, "外部工具或 MCP")
    .replace(/grader/gi, "评分规则")
    .replace(/schema/gi, "结果格式");
}

function firstTaskExample(answers: Record<string, string>, fallback: string) {
  const trigger = (answers["trigger-language"] || "")
    .split(/[；;\n]/)
    .map((item) => item.trim())
    .find(Boolean);
  return answers.__previewTask?.trim() || answers["real-task"]?.trim() || trigger || fallback;
}

function reconcileGeneratedScriptCapabilityClaims(plan: CapabilityPlan, files: Record<string, string>): CapabilityPlan {
  const items = plan.items.map((item) => {
    if (item.kind !== "script" || !item.path) return item;
    const implementation = files[item.path] || "";
    const exposesColumnSort = /--sort-column/.test(implementation) && /--(?:sort-order|descending)/.test(implementation);
    const exposesBroaderTransform = /--(?:formula|expression|filter|group|aggregate|mapping|rules)(?:\b|-)/.test(implementation);
    if (!exposesColumnSort || exposesBroaderTransform) return item;
    const routingCondition = "输入是 UTF-8 CSV、已包含用户确认的可比较字段，且当前步骤只需按指定列和升降序稳定排序时";
    return {
      ...item,
      name: "确定性 CSV 排序",
      requirement: "稳定读取 UTF-8 CSV，并按用户指定的现有列和升降序排序；不计算脚本未实现的领域公式",
      purpose: "把已经得到排序依据的批量记录交给可重复执行的代码，避免大模型逐行重排产生遗漏",
      input: "UTF-8 CSV 文件、现有排序列和升降序；领域评分或优先级值必须先由已确认规则产生",
      output: "保留原始列的 UTF-8 CSV 排序结果，以及明确的字段或文件错误",
      activationCondition: routingCondition,
      routingCondition,
      evaluationCriteria: ["按指定现有列稳定排序", "错误字段、空文件和异常行不会静默成功", "不声称执行未实现的评分、筛选或公式计算"],
    };
  });
  return { ...plan, items };
}

/** The in-app harness currently executes model contexts plus a local
 * filesystem/script sandbox. It does not expose arbitrary host Tools or MCP
 * adapters, so positive live-tool cases stay in the exported Eval bank but do
 * not participate in Optimization scoring. Their unavailable branch remains
 * runnable and visible. */
function harnessRunnableEvalBank(cases: SkillEvalCase[], plan: CapabilityPlan) {
  const scriptIds = new Set(plan.items
    .filter((item) => capabilityIsActive(item) && item.kind === "script")
    .map((item) => item.id));
  const unadaptedExternalIds = new Set(plan.items
    .filter((item) => capabilityIsActive(item) && (item.kind === "builtin-tool" || item.kind === "mcp"))
    .map((item) => item.id));
  return cases.filter((testCase) => {
    const scriptOnlyCapabilityCase = testCase.category === "core_capability"
      && testCase.capabilityIds.length > 0
      && testCase.capabilityIds.every((id) => scriptIds.has(id));
    // Generated scripts are executed and frozen by the local deterministic
    // Build Gate. Asking an LLM Executor to simulate them creates false
    // failures and contaminates unrelated semantic held-out results.
    if (scriptOnlyCapabilityCase) return false;
    const external = testCase.capabilityIds.some((id) => unadaptedExternalIds.has(id));
    if (!external) return true;
    return testCase.context.tool_available === false
      || /unavailable|negative|不可用|未配置/i.test(`${testCase.id} ${testCase.category} ${testCase.prompt}`);
  });
}

function harnessVerifiableCapabilityIds(plan: CapabilityPlan) {
  return plan.items.filter((item) => capabilityIsActive(item)
    && item.kind !== "eval"
    && item.kind !== "script"
    && item.kind !== "builtin-tool"
    && item.kind !== "mcp").map((item) => item.id);
}

function stableEvalContractValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableEvalContractValue).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableEvalContractValue((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

function currentEvalContractDigest(skillName: string, idea: string, answers: Record<string, string>, loopPlan: LoopPlan, capabilityPlan: CapabilityPlan) {
  const reconciledPlan = reconcileCapabilityPlanContentPermission(capabilityPlan, answers);
  const payload = stableEvalContractValue({
    skillName,
    idea: idea.trim(),
    answers: Object.fromEntries(Object.entries(answers).filter(([, value]) => Boolean(value?.trim())).sort(([left], [right]) => left.localeCompare(right))),
    loop: {
      mode: loopPlan.mode,
      goal: loopPlan.goal,
      maxRounds: loopPlan.maxRounds,
      stopConditions: loopPlan.stopConditions,
      escalationConditions: loopPlan.escalationConditions,
      scopes: loopPlan.scopes,
    },
    capabilities: reconciledPlan.items.filter(capabilityIsActive).map((item) => ({
      id: item.id,
      kind: item.kind,
      requirement: item.requirement,
      input: item.input,
      output: item.output,
      routingCondition: item.routingCondition,
      activationCondition: item.activationCondition,
      evaluationCriteria: item.evaluationCriteria,
    })),
  });
  let hash = 2166136261;
  for (const character of payload) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `eval-contract-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function evalBankMatchesCurrentContract(raw: string, skillName: string, idea: string, answers: Record<string, string>, loopPlan: LoopPlan, capabilityPlan: CapabilityPlan) {
  try {
    const parsed = JSON.parse(raw) as { contract_digest?: string; evals?: Array<{ contract_digest?: string }> };
    const expected = currentEvalContractDigest(skillName, idea, answers, loopPlan, capabilityPlan);
    return parsed.contract_digest === expected
      && Array.isArray(parsed.evals)
      && parsed.evals.length > 0
      && parsed.evals.every((testCase) => testCase.contract_digest === expected);
  } catch {
    return false;
  }
}

function createSpecificEvals(skillName: string, idea: string, answers: Record<string, string>, loopPlan: LoopPlan = DEFAULT_LOOP_PLAN, capabilityPlan: CapabilityPlan = DEFAULT_CAPABILITY_PLAN) {
  capabilityPlan = reconcileCapabilityPlanContentPermission(capabilityPlan, answers);
  const contractDigest = currentEvalContractDigest(skillName, idea, answers, loopPlan, capabilityPlan);
  const task = compactTaskPhrase(idea);
  const inputs = answers.inputs?.trim() || "完成任务所需的核心材料";
  const contentPolicy = confirmedContentPolicy(answers) || "按当前任务说明决定润色、扩写或补全范围；没有确认时先说明工作假设";
  const concreteTask = firstTaskExample(answers, task);
  const triggerExample = (answers["trigger-language"] || "").split(/[；;\n]/).map((item) => item.trim()).find(Boolean) || "";
  const hasHumanCheckpoint = /确认|询问|审批|同意|review|approve/i.test(`${answers.autonomy || ""} ${answers.boundary || ""} ${answers["delivery-checkpoint"] || ""}`);
  const productiveCheckpoint = productiveCheckpointRequested(answers);
  const representativeInput = answers.__previewInput?.trim().slice(0, 4_000) || "";
  const completedDecisionInput = completedNumericDecisionFixture(representativeInput).slice(0, 6_000);
  const executableProductiveCheckpoint = productiveCheckpoint && Boolean(representativeInput);
  const confirmedCorrection = confirmedCorrectionEvalEvidence(answers).slice(0, 1_200);
  const correctionBehaviors = confirmedCorrection ? [`落实用户在真实任务预演中确认的纠正：${confirmedCorrection}`] : [];
  const correctionMustNot = confirmedCorrection ? ["重新采用用户已在真实任务预演中否定或纠正的方案"] : [];
  const checkpointBehaviors = executableProductiveCheckpoint
    ? ["关键决策值缺失时先交付不依赖该值的可用草稿，再提出一个最小必要问题；值已提供时不得重复询问"]
    : productiveCheckpoint ? ["核心输入缺失时只请求当前执行必需的材料；收到材料后先完成不依赖后续决策的部分，到达决策检查点时再询问一个最小必要问题"]
    : hasHumanCheckpoint ? ["只暂停依赖缺失决策值的步骤，并提出一个最小必要问题；值已提供时不得重复询问"]
    : [];
  const checkpointMustNot = executableProductiveCheckpoint
    ? ["在关键决策值缺失时假装该值已经确认或擅自选择默认值", "只提问而不交付任何可逆的已完成部分"]
    : productiveCheckpoint ? ["在没有核心材料时虚构具体产出", "把尚未到达的后续决策与当前核心输入合并成一轮问题"]
    : hasHumanCheckpoint ? ["在关键决策值缺失时假装该值已经确认或擅自选择默认值"]
    : [];
  const executionFixture = [
    `这是本次实际任务：${concreteTask}。`,
    triggerExample && triggerExample !== concreteTask ? `用户原话示例：${triggerExample}。` : "",
    `本次输入契约：${inputs}。`,
    representativeInput ? `本用例携带的代表性输入材料如下，必须实际处理这些内容：\n${representativeInput}` : "",
    executableProductiveCheckpoint
      ? "本用例没有提供优先级规则等关键决策的具体取值；“每次确认规则”只是协作要求，不是本次规则值。先用上述材料完成并交付不依赖该值的可逆草稿，再只询问一个最小必要问题；不得把缺失值说成已经确认。"
      : productiveCheckpoint ? "本用例没有携带核心输入材料，也没有提供后续决策值。先只请求当前执行必需的核心材料；不要把尚未到达的后续决策合并进同一轮问题。收到材料后，先交付不依赖后续决策的可逆部分。"
      : hasHumanCheckpoint ? "本用例没有提供优先级规则等关键决策的具体取值；“每次确认规则”只是协作要求，不是本次规则值。只暂停依赖该值的步骤，并只询问一个最小必要问题；不得把缺失值说成已经确认。" : "",
    confirmedCorrection ? `此前真实任务预演中，用户已经明确纠正：${confirmedCorrection}。本轮必须继续遵守。` : "",
    `内容处理权限：${contentPolicy}。`,
    "请执行当前步骤并交付可观察结果；不要只复述工作流或返回空模板。",
  ].filter(Boolean).join(" ");
  const activeCapabilities = capabilityPlan.items.filter((item) => capabilityIsActive(item) && item.kind !== "eval");
  const semanticCapabilities = activeCapabilities.filter((item) => item.kind === "llm" || item.kind === "script");
  const groundingCapabilities = activeCapabilities.filter((item) => item.kind === "reference");
  const integrationCapabilities = activeCapabilities.filter((item) => item.kind === "builtin-tool" || item.kind === "mcp" || item.kind === "asset");
  const outputArtifacts = capabilityPlan.outputContract.artifactPatterns;
  const familyForCapability = (item: CapabilityItem): EvalFamily => item.kind === "builtin-tool" || item.kind === "mcp" || item.kind === "asset" ? "integration" : item.kind === "reference" ? "grounding" : "capability";
  const artifactsForCapability = (item: CapabilityItem) => representativeInput && capabilityOwnsArtifacts(item) ? outputArtifacts.length ? outputArtifacts : inferArtifactPatterns(item.output || item.requirement) : [];
  const evals: Array<Record<string, unknown>> = [
    { id: "trigger-explicit-name", eval_family: "trigger", category: "trigger_explicit", should_trigger: true, prompt: `请使用 $${skillName} 帮我${task}，我会提供${inputs}。`, context: {}, capability_ids: [], expected: { behaviors: ["显式调用 Skill"], must_not: ["忽略显式调用"], artifacts: [] }, graders: ["trigger"] },
    { id: "trigger-explicit-direct", eval_family: "trigger", category: "trigger_explicit", should_trigger: true, prompt: `请帮我${task}，关键材料都在下面。`, context: { available_inputs: inputs }, capability_ids: [], expected: { behaviors: ["根据直接任务表达触发"], must_not: ["要求用户先说出 Skill 名称"], artifacts: [] }, graders: ["trigger"] },
    { id: "trigger-implicit-paraphrase", eval_family: "trigger", category: "trigger_implicit", should_trigger: true, prompt: `我想把手头这份内容按我们确认过的方式处理好，最后直接给我能用的版本。`, context: { intended_task: task, available_inputs: inputs }, capability_ids: [], expected: { behaviors: ["结合语义与上下文触发"], must_not: ["只因没有关键词而拒绝"], artifacts: [] }, graders: ["trigger"] },
    { id: "trigger-context-followup", eval_family: "trigger", category: "trigger_context", should_trigger: true, prompt: "继续处理下一份，保留刚才确认的任务目标，但要根据新材料重新判断。", context: { previous_task: task, new_inputs_available: true }, capability_ids: [], expected: { behaviors: ["利用会话上下文触发"], must_not: ["把上一轮具体事实当作本轮事实"], artifacts: [] }, graders: ["trigger"] },
    { id: "no-trigger-explanation", eval_family: "trigger", category: "trigger_negative", should_trigger: false, prompt: `请解释“${task}”通常是什么意思，不要替我执行。`, context: {}, capability_ids: [], expected: { behaviors: ["遵守解释意图", "保持不触发"], must_not: ["擅自开始完整工作流"], artifacts: [] }, graders: ["trigger"] },
    { id: "no-trigger-meta", eval_family: "trigger", category: "trigger_negative", should_trigger: false, prompt: `请介绍 $${skillName} 的用途和触发范围，不要运行它。`, context: {}, capability_ids: [], expected: { behaviors: ["只回答元信息", "保持不触发"], must_not: ["执行领域任务"], artifacts: [] }, graders: ["trigger"] },
    { id: "no-trigger-unrelated", eval_family: "trigger", category: "trigger_negative", should_trigger: false, prompt: "请把下面一行英文直译成中文，不需要分析、改写或规划。", context: { unrelated_to: task }, capability_ids: [], expected: { behaviors: ["识别无关任务", "不调用当前 Skill"], must_not: ["强行套用当前流程"], artifacts: [] }, graders: ["trigger"] },
  ];

  hardNegativePrompts(idea).forEach((prompt, index) => {
    evals.push({
      id: `no-trigger-nearest-neighbor-${index + 1}`,
      eval_family: "trigger",
      category: "trigger_negative",
      should_trigger: false,
      prompt,
      context: { negative_control: "nearest_neighbor", adjacent_to: task },
      capability_ids: [],
      expected: { behaviors: ["识别相邻但不同的用户意图", "不运行当前 Skill 的完整工作流"], must_not: ["仅因领域词相似而错误触发"], artifacts: [] },
      graders: ["trigger"],
    });
  });

  [...semanticCapabilities, ...groundingCapabilities, ...integrationCapabilities].forEach((item) => {
    const expectedArtifacts = artifactsForCapability(item);
    const evalFamily = familyForCapability(item);
    evals.push({
      id: `core-${item.id}`,
      eval_family: evalFamily,
      category: "core_capability",
      should_trigger: true,
      prompt: `${executionFixture} 本用例重点验证：${item.requirement}。${evalFamily === "integration" ? `本用例明确满足激活条件：${item.activationCondition || item.routingCondition}。` : ""}`,
      context: { actual_task: concreteTask, workflow_checkpoint: executableProductiveCheckpoint ? "productive-partial-delivery" : productiveCheckpoint ? "core-input-missing" : hasHumanCheckpoint ? "required-value-missing" : "not-required", capability_scope: item.scope || normalizeCapabilityScope(item), activation_condition: item.activationCondition || item.routingCondition, routing_condition: item.routingCondition, input_contract: item.input, output_contract: item.output },
      capability_ids: [item.id],
      expected: { behaviors: [...(item.evaluationCriteria.length ? item.evaluationCriteria.filter((criterion) => !(productiveCheckpoint && /确认|用户预期|主观|审批|规则|决策|选择/i.test(criterion))) : [item.output]), ...checkpointBehaviors, ...correctionBehaviors], must_not: ["只描述将如何完成而不产生真实结果", "使用与当前分支无关的资源", ...checkpointMustNot, ...correctionMustNot], artifacts: expectedArtifacts },
      graders: evalFamily === "integration"
        ? ["integration", ...(expectedArtifacts.length ? ["artifact_checker"] : [])]
        : evalFamily === "grounding"
          ? ["grounding", ...(expectedArtifacts.length ? ["artifact_checker"] : [])]
          : ["core_capability", ...(expectedArtifacts.length ? ["artifact_checker"] : [])],
    });
  });

  if (completedDecisionInput) {
    evals.push({
      id: "workflow-decision-values-provided",
      eval_family: "capability",
      category: "decision_complete",
      should_trigger: true,
      prompt: `这是一个隔离回归用例，必须执行用户补齐关键决策值后的完整分支：\n${completedDecisionInput}`,
      context: { actual_task: concreteTask, workflow_checkpoint: "decision-values-provided", fixture_type: "synthetic-complete-branch" },
      capability_ids: semanticCapabilities.map((item) => item.id),
      expected: {
        behaviors: ["使用本用例明确提供的评分完成计算", "按计算结果完成排序", "交付最终结果而不是再次询问已经提供的值", ...correctionBehaviors],
        must_not: ["把本用例已提供的评分说成缺失", "只交付待确认草稿", "跳过计算分支", ...correctionMustNot],
        artifacts: [],
      },
      graders: ["core_capability", "loop_control"],
    });
  }

  capabilityPlan.failureModes.slice(0, 3).forEach((failure, index) => {
    evals.push({
      id: `failure-mode-${index + 1}`,
      eval_family: "capability",
      category: "failure_mode",
      should_trigger: true,
      prompt: `${executionFixture} 当前材料还可能诱导系统出现这种失败：“${failure}”。请避免该失败并完成仍可完成的部分。`,
      context: { actual_task: concreteTask, workflow_checkpoint: executableProductiveCheckpoint ? "productive-partial-delivery" : productiveCheckpoint ? "core-input-missing" : hasHumanCheckpoint ? "required-value-missing" : "not-required", injected_failure_mode: failure },
      capability_ids: semanticCapabilities.slice(0, 1).map((item) => item.id),
      expected: { behaviors: ["识别并避免指定失败模式", "仍完成可安全完成的核心任务或明确重定向", ...checkpointBehaviors, ...correctionBehaviors], must_not: [failure, ...checkpointMustNot, ...correctionMustNot], artifacts: [] },
      graders: ["failure_mode", "core_capability"],
    });
  });

  realisticFailureFixtures(idea, {
    allowFactualCreation: contentPolicyAllowsFactualCreation(answers),
    explicitRestriction: contentPolicyExplicitlyRestrictsExpansion(answers),
  }).forEach((fixture) => {
    evals.push({
      id: fixture.id,
      eval_family: "grounding",
      category: "failure_mode",
      should_trigger: true,
      prompt: `${executionFixture} ${fixture.prompt}`,
      context: { actual_task: concreteTask, failure_mode: fixture.failure_mode, fixture_type: "realistic_adversarial" },
      capability_ids: [...semanticCapabilities, ...groundingCapabilities].slice(0, 2).map((item) => item.id),
      expected: { behaviors: fixture.observable_success, must_not: fixture.must_not, artifacts: [] },
      graders: ["grounding", "failure_mode", "core_capability"],
    });
  });

  const contentPermission = resolveContentPermission(answers);
  const contentPolicyExpected = contentPolicyEvalExpectations(contentPermission);
  evals.push({ id: "behavior-content-policy", eval_family: "grounding", category: "content_policy", should_trigger: true, prompt: `${executionFixture} 我确认的内容改动范围是：${contentPolicy}。`, context: { actual_task: concreteTask, content_policy: contentPolicy }, capability_ids: groundingCapabilities.slice(0, 1).map((item) => item.id), expected: { ...contentPolicyExpected, artifacts: [] }, graders: ["grounding", "content_policy"] });

  if (capabilityPlan.stateModel.needed) {
    evals.push({ id: "state-correction-and-expiry", eval_family: "grounding", category: "state_correctness", should_trigger: true, prompt: `继续完成${task}。我现在明确更正一项之前的信息，并要求删除已经到期的状态。`, context: { state_scope: capabilityPlan.stateModel.scope, correction: capabilityPlan.stateModel.correction, expiry: capabilityPlan.stateModel.expiry }, capability_ids: [], expected: { behaviors: ["显式更正优先于旧推断", "按到期规则删除或忽略状态", "只重算受影响部分"], must_not: ["继续沿用已更正值", "把一次性内容升级为持久偏好"], artifacts: [] }, graders: ["grounding", "state_correctness"] });
  }

  const toolCapability = capabilityPlan.items.find((item) => (item.kind === "builtin-tool" || item.kind === "mcp") && capabilityIsActive(item));
  if (toolCapability) {
    evals.push({ id: "tool-unavailable-branch", eval_family: "integration", category: "tool_grounding", should_trigger: true, prompt: `请完成${task}，但本次运行环境没有返回“${toolCapability.name}”的可用能力或真实调用结果。`, context: { tool_available: false, capability_scope: toolCapability.scope || normalizeCapabilityScope(toolCapability), activation_condition: toolCapability.activationCondition || toolCapability.routingCondition, fallback: toolCapability.fallback }, capability_ids: [toolCapability.id], expected: { behaviors: ["不声称工具调用成功", `执行降级方案或停止依赖步骤：${toolCapability.fallback}`], must_not: ["虚构工具结果", "把配置说明当成已安装证明"], artifacts: [] }, graders: ["integration", "tool_grounding"] });
  } else {
    evals.push({ id: "integration-negative-control", eval_family: "integration", category: "integration_control", should_trigger: true, prompt: `请只用当前输入完成${task}；本任务没有要求联网、图片、外部服务或文件产物。`, context: { active_integrations: [] }, capability_ids: [], expected: { behaviors: ["完成核心任务", "保持纯文本或当前约定交付"], must_not: ["虚构工具调用", "强行要求图片或外部文件"], artifacts: [] }, graders: ["integration"] });
  }

  evals.push(
    { id: "loop-continue-on-observed-gap", eval_family: "capability", category: "loop_control", should_trigger: true, prompt: `${executionFixture} 第一版已经生成，但当前子目标有一个可观察检查未通过。`, context: { actual_task: concreteTask, loop_mode: loopPlan.mode, current_round: 1, max_rounds: loopPlan.maxRounds }, capability_ids: semanticCapabilities.slice(0, 1).map((item) => item.id), expected: { behaviors: ["保持总目标稳定", "只修复失败项并复检受影响部分"], must_not: ["把评分项改成新目标", "无上限循环"], artifacts: [] }, graders: ["loop_control", "core_capability"] },
    { id: "loop-stop-or-human-checkpoint", eval_family: "capability", category: "loop_control", should_trigger: true, prompt: `${executionFixture} 客观检查已通过，现在只剩主观判断，或当前循环已经达到上限。`, context: { actual_task: concreteTask, loop_mode: loopPlan.mode, current_round: loopPlan.maxRounds, scopes: loopPlan.scopes }, capability_ids: semanticCapabilities.slice(0, 1).map((item) => item.id), expected: { behaviors: loopPlan.mode === "goal-driven" ? ["按停止条件交付或升级阻塞项"] : ["停止自主迭代并请求一次聚焦判断"], must_not: ["声称已自主证明用户满意", "混淆任务重试与长期跟踪"], artifacts: [] }, graders: ["loop_control"] },
  );

  const firstByCategory = (category: string) => evals.find((item) => item.category === category);
  const focusedCapabilityCases = activeCapabilities.map((item) => evals.find((testCase) => testCase.id === `core-${item.id}`)).filter((item): item is Record<string, unknown> => Boolean(item));
  const nearestNeighborCases = evals.filter((item) => (item.context as { negative_control?: string } | undefined)?.negative_control === "nearest_neighbor");
  const realisticFixtureCases = evals.filter((item) => (item.context as { fixture_type?: string } | undefined)?.fixture_type === "realistic_adversarial");
  const requiredCases = [
    firstByCategory("trigger_explicit"),
    firstByCategory("trigger_implicit"),
    firstByCategory("trigger_context"),
    firstByCategory("trigger_negative"),
    ...nearestNeighborCases,
    ...focusedCapabilityCases,
    firstByCategory("decision_complete"),
    ...realisticFixtureCases,
    firstByCategory("failure_mode"),
  ].filter((item): item is Record<string, unknown> => Boolean(item));
  const selectedEvals = [...new Map([...requiredCases, ...evals].map((item) => [String(item.id), item])).values()]
    .slice(0, 20)
    .map((testCase) => ({ ...testCase, contract_digest: contractDigest }));
  return JSON.stringify({
    version: "2.7",
    skill_name: skillName,
    contract_digest: contractDigest,
    dataset_summary: "四类隔离回归集：Trigger、Capability、Grounding、Integration 分别运行，条件工具不会污染核心文本能力。",
    evals: selectedEvals,
  }, null, 2);
}

function createEvalGraders(skillName: string, idea: string, answers: Record<string, string>, loopPlan: LoopPlan = DEFAULT_LOOP_PLAN, capabilityPlan: CapabilityPlan = DEFAULT_CAPABILITY_PLAN) {
  capabilityPlan = reconcileCapabilityPlanContentPermission(capabilityPlan, answers);
  const contentPermission = resolveContentPermission(answers);
  const groundingRubric = contentGroundingRubric(contentPermission);
  return JSON.stringify({
    version: "1.0",
    skill_name: skillName,
    pass_threshold: 0.8,
    critical_graders: ["trigger", "core_capability"],
    eval_loops: {
      trigger: { purpose: "只验证该触发和不该触发的边界", allowed_graders: ["trigger"] },
      capability: { purpose: "只验证单项领域能力是否完成", allowed_graders: ["core_capability", "failure_mode", "loop_control"] },
      grounding: { purpose: "只验证事实、来源、状态和已确认权限", allowed_graders: ["grounding", "content_policy", "state_correctness"] },
      integration: { purpose: "只验证工具、MCP、图片和文件产物", allowed_graders: ["integration", "tool_grounding", "artifact_checker"] },
    },
    graders: [
      { id: "trigger", type: "deterministic", weight: 0.25, input: "result.triggered", reference: "case.should_trigger", operation: "eq" },
      { id: "core_capability", type: "model", weight: 0.35, range: [0, 1], rubric: `只检查当前文本或语义任务是否真正完成“${compactTaskPhrase(idea)}”：任务要求是否完成、是否使用用户材料、是否符合本次明确文风、是否交付本次明确要求的内容。再检查 case.expected.behaviors。不得按图片、搜索、并行 Agent、文件数量或未由用户确认的固定字数/比喻/标签数量评分，也不得因为格式整齐、规则声明或工程文件齐全而给高分。` },
      { id: "grounding", type: "model", weight: 0.35, range: [0, 1], rubric: groundingRubric },
      { id: "integration", type: "model", weight: 0.35, range: [0, 1], rubric: "只检查用例明确激活的工具、MCP、视觉或文件能力是否真实执行并遵循降级契约；不得把条件能力要求施加到文本核心任务。" },
      { id: "content_policy", type: "model", weight: 0.25, range: [0, 1], rubric: `逐项检查输出是否遵循用户确认的内容改动权限：${confirmedContentPolicy(answers) || "按任务说明执行，并明确未确认的工作假设"}。既不要擅自收紧为通用拒绝，也不要擅自扩大允许范围。` },
      { id: "loop_control", type: "model", weight: 0.2, range: [0, 1], rubric: `检查输出是否遵循 ${loopPlan.label}：总目标保持稳定；子目标只是中间状态；质检标准只用于判断通过与否；遵守最大 ${loopPlan.maxRounds} 回合、停止条件和需要的人类确认。` },
      { id: "failure_mode", type: "model", weight: 0.25, range: [0, 1], rubric: `检查输出是否识别并避开本用例注入的失败模式，同时没有用空泛拒绝逃避仍可完成的部分。重点失败模式：${capabilityPlan.failureModes.join("；")}。` },
      { id: "state_correctness", type: "model", weight: 0.25, range: [0, 1], rubric: "检查状态的来源类别、更新、更正、到期和缺失处理是否一致；显式更正必须覆盖旧推断，不得把一次性要求升级为持久偏好。" },
      { id: "tool_grounding", type: "model", weight: 0.25, range: [0, 1], rubric: "只有宿主返回可验证结果时才能声称工具调用成功；不可用时必须执行已声明降级或停止依赖步骤。" },
      { id: "artifact_checker", type: "python", weight: 0.2, script: "evals/artifact_checker.py", rubric: "仅用于确实要求文件产物的用例；检查实际文件模式、结构和契约，不根据文字承诺判定通过。" },
    ],
  }, null, 2);
}

function createEvalResultSchema() {
  return JSON.stringify({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Skill Eval Run Result",
    type: "object",
    required: ["run_id", "skill_name", "created_at", "summary", "cases", "bundle_check"],
    properties: {
      run_id: { type: "string" },
      skill_name: { type: "string" },
      created_at: { type: "string" },
      summary: {
        type: "object",
        required: ["passed", "failed", "skipped", "score"],
        properties: { passed: { type: "integer" }, failed: { type: "integer" }, skipped: { type: "integer" }, score: { type: "number", minimum: 0, maximum: 1 } },
      },
      cases: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "passed", "score", "grader_scores", "evidence"],
          properties: {
            id: { type: "string" },
            passed: { type: "boolean" },
            score: { type: "number", minimum: 0, maximum: 1 },
            grader_scores: { type: "object", additionalProperties: { type: ["number", "null"] } },
            evidence: { type: "array", items: { type: "string" } },
          },
        },
      },
      bundle_check: {
        type: "object",
        required: ["passed", "issues", "levels"],
        properties: {
          passed: { type: "boolean" },
          issues: { type: "array", items: { type: "string" } },
          levels: {
            type: "object",
            required: ["structural", "semantic", "behavioral"],
            properties: {
              structural: { type: "array", items: { type: "string" } },
              semantic: { type: "array", items: { type: "string" } },
              behavioral: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
  }, null, 2);
}

function createArtifactChecker() {
  return `#!/usr/bin/env python3
# skillcanvas-owned-artifact-checker:v1
"""Deterministic bundle and artifact checks for the generated Skill Eval Harness."""
from __future__ import annotations

import ast
import fnmatch
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

REQUIRED_HARNESS = {
    "evals/skill-ir.json",
    "evals/capability-manifest.json",
    "evals/evals.json",
    "evals/graders.json",
    "evals/result.schema.json",
    "evals/run_evals.py",
    "evals/artifact_checker.py",
}


def skill_ir_digest(value: Any) -> str:
    canonical = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = 2166136261
    for character in canonical:
        codepoint = ord(character)
        code_unit = 0xD800 + ((codepoint - 0x10000) >> 10) if codepoint > 0xFFFF else codepoint
        digest ^= code_unit
        digest = (digest * 16777619) & 0xFFFFFFFF
    return "fnv1a-" + format(digest, "08x")


def inspect_bundle(root: Path) -> dict[str, Any]:
    structural: list[str] = []
    semantic: list[str] = []
    behavioral: list[str] = []
    issues: list[str] = []
    state_scope = "none"
    skill_path = root / "SKILL.md"
    if not skill_path.exists():
        return {"passed": False, "issues": ["missing SKILL.md"], "levels": {"structural": ["missing SKILL.md"], "semantic": [], "behavioral": []}}
    skill = skill_path.read_text(encoding="utf-8")
    all_files = {str(path.relative_to(root)) for path in root.rglob("*") if path.is_file()}
    section_matches = list(re.finditer(r"^##\\s+(.+?)\\s*$", skill, re.M))
    required_sections = {"goal", "workflow", "runtime workflow", "quality check", "quality checks", "verification", "boundary", "boundaries", "目标", "工作流", "运行流程", "质量检查", "验证", "边界"}
    for index, match in enumerate(section_matches):
        title = match.group(1).strip()
        if title.lower() not in required_sections:
            continue
        end = section_matches[index + 1].start() if index + 1 < len(section_matches) else len(skill)
        content = re.sub(r"[-*_\\x60>#\\s]", "", skill[match.end():end])
        if len(content) < 8 or content.lower() in {"待补充", "todo", "tbd", "none", "n/a"}:
            structural.append("empty required section: " + title)
    for required in sorted(REQUIRED_HARNESS):
        if required not in all_files:
            structural.append("missing harness file: " + required)
    for prefix in ("references/", "scripts/", "assets/"):
        for path in sorted(item for item in all_files if item.startswith(prefix)):
            if path not in skill:
                structural.append("resource is not reachable from SKILL.md: " + path)
    for path in sorted(item for item in all_files if item.startswith("scripts/") and item.endswith(".py")):
        try:
            ast.parse((root / path).read_text(encoding="utf-8"), filename=path)
        except SyntaxError as error:
            structural.append("invalid Python syntax in {0}: {1}".format(path, error.msg))
    for path in sorted(item for item in all_files if item.startswith("scripts/") or item.startswith("assets/")):
        if (root / path).stat().st_size < 20:
            structural.append("empty or placeholder resource: " + path)

    domain_scripts = sorted(path for path in all_files if path.startswith("scripts/") and path.endswith(".py") and "/tests/" not in path)
    for path in domain_scripts:
        stem = Path(path).stem
        matching_tests = [item for item in all_files if item.startswith("evals/script-tests/") and item.endswith(".py") and stem in Path(item).stem]
        if not matching_tests:
            behavioral.append("generated script has no independent test: " + path)
    for path in sorted(item for item in all_files if item.startswith("evals/script-tests/") and item.endswith(".py")):
        try:
            ast.parse((root / path).read_text(encoding="utf-8"), filename=path)
        except SyntaxError as error:
            structural.append("invalid script-test syntax in {0}: {1}".format(path, error.msg))
    if domain_scripts and any(item.startswith("evals/script-tests/") for item in all_files):
        try:
            completed = subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", "evals/script-tests", "-p", "test_*.py"], cwd=root, capture_output=True, text=True, timeout=30, check=False)
            if completed.returncode != 0:
                behavioral.append("script tests failed: " + (completed.stderr.strip() or completed.stdout.strip())[-600:])
        except (OSError, subprocess.TimeoutExpired) as error:
            behavioral.append("script tests could not complete: " + str(error))

    try:
        dataset = json.loads((root / "evals/evals.json").read_text(encoding="utf-8"))
        cases = dataset.get("evals", [])
        categories = {case.get("category") for case in cases}
        required_categories = {"trigger_explicit", "trigger_implicit", "trigger_context", "trigger_negative", "core_capability", "failure_mode"}
        if not 10 <= len(cases) <= 20:
            behavioral.append("eval dataset must contain 10-20 cases")
        if not required_categories.issubset(categories):
            behavioral.append("eval dataset is missing trigger, core-capability, or failure-mode coverage")
        if not any(case.get("should_trigger") is True for case in cases) or not any(case.get("should_trigger") is False for case in cases):
            behavioral.append("eval dataset must include true and false trigger labels")
        if any(not isinstance(case.get("expected"), dict) or not case.get("graders") for case in cases):
            behavioral.append("eval cases require structured expected behavior and grader bindings")
        if any(case.get("should_trigger") is True and not isinstance(case.get("capability_ids"), list) for case in cases):
            behavioral.append("triggered eval cases must declare capability_ids")
        if any("artifact_checker" in case.get("graders", []) and not case.get("expected", {}).get("artifacts") for case in cases):
            behavioral.append("artifact_checker cannot grade a case with no expected artifacts")
        if any(case.get("expected", {}).get("artifacts") and "artifact_checker" not in case.get("graders", []) for case in cases):
            semantic.append("eval expects file artifacts but artifact_checker is not assigned")
        if any(case.get("eval_family") == "trigger" and case.get("capability_ids") for case in cases):
            behavioral.append("trigger evals must not count as capability coverage")
        grader_config = json.loads((root / "evals/graders.json").read_text(encoding="utf-8"))
        grader_ids = {grader.get("id") for grader in grader_config.get("graders", [])}
        missing_graders = sorted({grader for case in cases for grader in case.get("graders", []) if grader not in grader_ids})
        if missing_graders:
            structural.append("undefined graders: " + ", ".join(missing_graders))
    except (OSError, json.JSONDecodeError, AttributeError):
        structural.append("invalid eval dataset or grader configuration")

    try:
        plan = json.loads((root / "evals/capability-manifest.json").read_text(encoding="utf-8"))
        skill_ir = json.loads((root / "evals/skill-ir.json").read_text(encoding="utf-8"))
        skill_ir_contract = plan.get("skill_ir", {})
        if skill_ir_contract:
            if skill_ir_contract.get("path") != "evals/skill-ir.json":
                semantic.append("manifest does not point to canonical SkillIR")
            if skill_ir_contract.get("digest") != skill_ir_digest(skill_ir):
                semantic.append("manifest projection drifted from canonical SkillIR")
        capabilities = plan.get("capabilities", [])
        ir_capabilities = skill_ir.get("capabilities", [])
        if skill_ir_contract and {item.get("id") for item in capabilities} != {item.get("id") for item in ir_capabilities}:
            semantic.append("manifest capability set differs from canonical SkillIR")
        active_scripts = [item for item in capabilities if item.get("kind") == "script" and item.get("status") in {"generate", "use-provided"}]
        active_assets = [item for item in capabilities if item.get("kind") == "asset" and item.get("status") in {"generate", "use-provided"}]
        active_tools = [item for item in capabilities if item.get("kind") in {"builtin-tool", "mcp"} and item.get("status") != "not-needed"]
        provenance = plan.get("requirement_provenance", [])
        if not provenance:
            semantic.append("requirement provenance is missing")
        if any(item.get("hard") and item.get("provenance") in {"domain_inferred", "generator_default"} for item in provenance):
            semantic.append("inferred or generator-default requirement became a hard constraint")
        if any(not item.get("necessity") or not item.get("necessity", {}).get("decision") for item in capabilities):
            semantic.append("capability necessity decision is missing")
        information_dependencies = plan.get("information_dependencies", [])
        if any(item.get("inventable") is False and item.get("source_available") is False and not re.search(r"待确认|未知|不生成|询问|标注|保留", str(item.get("missing_behavior", ""))) for item in information_dependencies):
            semantic.append("non-inventable output field lacks missing-input behavior")
        summary = str(plan.get("summary", ""))
        claims_script = re.search(r"scripts?/|可执行脚本|脚本文件|script capability", summary, re.I) and not re.search(r"(?:无需|不需要|没有|未使用|does not|without).{0,10}(?:scripts?/|可执行脚本|脚本文件|script capability)", summary, re.I)
        claims_asset = re.search(r"assets?/|资产文件|模板文件|asset capability", summary, re.I) and not re.search(r"(?:无需|不需要|没有|未使用|does not|without).{0,10}(?:assets?/|资产文件|模板文件|asset capability)", summary, re.I)
        if claims_script and not active_scripts and not any(path.startswith("scripts/") for path in all_files):
            semantic.append("manifest summary claims script capability but no script exists")
        if claims_asset and not active_assets and not any(path.startswith("assets/") for path in all_files):
            semantic.append("manifest summary claims asset capability but no asset exists")
        for item in capabilities:
            path = item.get("path")
            if item.get("kind") in {"reference", "script", "asset"} and item.get("status") in {"generate", "use-provided"} and (not path or path not in all_files):
                structural.append("capability implementation path is missing: " + str(path or item.get("id")))
        if active_scripts and not any(path.startswith("scripts/") for path in all_files):
            structural.append("capability plan requires a script but scripts/ is empty")
        if active_assets and not any(path.startswith("assets/") for path in all_files):
            structural.append("capability plan requires an asset but assets/ is empty")
        if active_tools and "integrations/tool-contracts.json" not in all_files:
            structural.append("capability plan requires Tools/MCP but the contract is missing")
        coverage = plan.get("coverage", [])
        if {item.get("id") for item in capabilities} - {item.get("requirement_id") for item in coverage}:
            behavioral.append("capability coverage is missing requirement-to-implementation mappings")
        if any(not item.get("evaluation", {}).get("case_ids") for item in coverage if item.get("implementation", {}).get("kind") != "eval"):
            behavioral.append("active capability has no linked eval case")
        state = plan.get("state_model", {})
        state_scope = state.get("scope", "none")
        if state.get("needed") and state.get("scope") == "persistent" and "references/state-model.md" not in all_files:
            structural.append("persistent state requires references/state-model.md")
        scopes = plan.get("control_model", {}).get("scopes", [])
        if not scopes or any(not item.get("trigger") or not item.get("action") or not item.get("stop") or not item.get("maxCycles") for item in scopes):
            behavioral.append("loop scopes require trigger, action, limit, state dependency, and stop")
        if any(item.get("scope") == "longitudinal" for item in scopes) and (not state.get("needed") or state_scope == "none"):
            semantic.append("longitudinal loop has no state model")
        output_contract = plan.get("output_contract", {})
        if output_contract.get("mode") in {"artifact", "mixed"} and not output_contract.get("artifactPatterns"):
            semantic.append("artifact output contract has no file patterns")
        artifact_producers = [item for item in capabilities if (item.get("kind") in {"asset", "script"} or (item.get("kind") in {"builtin-tool", "mcp"} and item.get("status") == "use-provided")) and re.search(r"file|artifact|image|pdf|doc|sheet|文件|图片|文档|表格|产物", str(item.get("output", "")) + " " + str(item.get("affects", "")), re.I)]
        if output_contract.get("mode") in {"artifact", "mixed"} and not artifact_producers:
            semantic.append("artifact output mode has no real producer")
    except (OSError, json.JSONDecodeError, AttributeError):
        structural.append("invalid evals/capability-manifest.json")

    tool_contract = root / "integrations/tool-contracts.json"
    if tool_contract.exists():
        try:
            parsed = json.loads(tool_contract.read_text(encoding="utf-8"))
            if not isinstance(parsed.get("tools"), list):
                structural.append("tool contract must contain a tools array")
            elif not parsed["tools"]:
                structural.append("tool contract must contain at least one capability")
            elif any(item.get("availability") == "generate" for item in parsed["tools"]):
                semantic.append("Tools/MCP must be host-provided or require setup; a Skill cannot generate availability")
            elif any(not item.get("fallback") for item in parsed["tools"]):
                semantic.append("every tool contract requires an unavailable fallback")
            else:
                manifest_by_id = {item.get("id"): item for item in capabilities if item.get("id")}
                for contract in parsed["tools"]:
                    declared = manifest_by_id.get(contract.get("id"))
                    if not declared:
                        continue
                    if contract.get("scope") != declared.get("scope") or contract.get("activation_condition") != declared.get("activationCondition") or sorted(contract.get("affects", [])) != sorted(declared.get("affects", [])) or sorted(contract.get("must_not_affect", [])) != sorted(declared.get("mustNotAffect", [])):
                        semantic.append("capability scope declaration mismatch: " + str(contract.get("id")))
        except (OSError, json.JSONDecodeError):
            structural.append("invalid integrations/tool-contracts.json")

    runtime_text = "\\n".join((root / path).read_text(encoding="utf-8", errors="ignore") for path in sorted(all_files) if path == "SKILL.md" or path.startswith(("references/", "scripts/", "assets/", "integrations/")))
    if state_scope == "none" and re.search(r"(?:persist|save|store|remember).{0,80}(?:raw|source|personal|private)", runtime_text, re.I) and re.search(r"(?:do not|never|must not).{0,40}(?:persist|save|store)", runtime_text, re.I):
        semantic.append("privacy and persistence instructions appear contradictory")
    if re.search(r"tool.{0,50}(?:available|configured|required)", runtime_text, re.I) and tool_contract.exists() is False:
        semantic.append("runtime instructions claim a tool dependency without a tool contract")
    markdown_files = [path for path in all_files if (path == "SKILL.md" or path.startswith("references/")) and path.endswith(".md")]
    normalized_bodies: dict[str, str] = {}
    for path in markdown_files:
        body = re.sub(r"^#{1,6}.*$", "", (root / path).read_text(encoding="utf-8", errors="ignore"), flags=re.M)
        normalized_bodies[path] = re.sub(r"\\W+", " ", body.lower()).strip()
    for index, left in enumerate(markdown_files):
        left_tokens = set(normalized_bodies[left].split())
        if len(left_tokens) < 25:
            continue
        for right in markdown_files[index + 1:]:
            right_tokens = set(normalized_bodies[right].split())
            union = left_tokens | right_tokens
            if union and len(left_tokens & right_tokens) / len(union) > 0.72:
                semantic.append("highly duplicated runtime knowledge: {0} and {1}".format(left, right))
    issues.extend(structural)
    issues.extend(semantic)
    issues.extend(behavioral)
    return {"passed": not issues, "issues": issues, "levels": {"structural": structural, "semantic": semantic, "behavioral": behavioral}}


def check_case_artifacts(case: dict[str, Any], result: dict[str, Any]) -> tuple[float, list[str]]:
    expected = case.get("expected", {}).get("artifacts", [])
    actual = result.get("artifacts", [])
    if not expected:
        return 0.0, ["artifact checker was invoked without expected artifact patterns"]
    missing = [pattern for pattern in expected if not any(fnmatch.fnmatch(str(path), pattern) for path in actual)]
    issues = ["missing artifact: " + item for item in missing]
    for raw_path in actual:
        path = Path(str(raw_path))
        if path.is_absolute() or ".." in path.parts:
            issues.append("artifact path must stay inside the task workspace: " + str(raw_path))
            continue
        if not any(fnmatch.fnmatch(str(path), pattern) for pattern in expected):
            continue
        if not path.exists() or not path.is_file():
            issues.append("reported artifact does not exist: " + str(path))
            continue
        if path.stat().st_size == 0:
            issues.append("artifact is empty: " + str(path))
        if path.suffix.lower() == ".json":
            try:
                json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                issues.append("artifact is not valid JSON: " + str(path))
    return (0.0 if issues else 1.0), issues


def validate_report(report: dict[str, Any], schema: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    missing = [key for key in schema.get("required", []) if key not in report]
    if missing:
        issues.append("result is missing required keys: " + ", ".join(missing))
    if not isinstance(report.get("cases"), list):
        issues.append("result cases must be an array")
    else:
        case_required = schema.get("properties", {}).get("cases", {}).get("items", {}).get("required", [])
        for item in report["cases"]:
            absent = [key for key in case_required if key not in item]
            if absent:
                issues.append("case result is missing keys: " + ", ".join(absent))
    score = report.get("summary", {}).get("score")
    if not isinstance(score, (int, float)) or not 0 <= score <= 1:
        issues.append("summary score must be between 0 and 1")
    return issues
`;
}

function createEvalRunner() {
  return `#!/usr/bin/env python3
# skillcanvas-owned-eval-runner:v1
"""Run and score a generated Skill eval dataset.

Adapter contract: read one case JSON object from stdin and return one JSON object with
{"id": "case-id", "triggered": true, "output_text": "...", "artifacts": ["path"]}.
Model graders are optional and use an OpenAI-compatible chat/completions endpoint.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shlex
import subprocess
import urllib.request
import uuid
from pathlib import Path
from typing import Any

from artifact_checker import check_case_artifacts, inspect_bundle, validate_report


def load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_responses(path: Path) -> dict[str, dict[str, Any]]:
    rows: dict[str, dict[str, Any]] = {}
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                item = json.loads(line)
                rows[str(item["id"])] = item
    return rows


def run_adapter(command: str, case: dict[str, Any], timeout: int) -> dict[str, Any]:
    completed = subprocess.run(
        shlex.split(command),
        input=json.dumps(case, ensure_ascii=False),
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError("adapter failed for {0}: {1}".format(case["id"], completed.stderr.strip()))
    result = json.loads(completed.stdout)
    result.setdefault("id", case["id"])
    result.setdefault("artifacts", [])
    return result


def model_grade(grader: dict[str, Any], case: dict[str, Any], result: dict[str, Any]) -> tuple[float | None, str]:
    api_key = os.getenv("EVAL_API_KEY") or os.getenv("OPENAI_API_KEY")
    model = os.getenv("EVAL_GRADER_MODEL")
    if not api_key or not model:
        return None, "skipped: set EVAL_API_KEY and EVAL_GRADER_MODEL"
    base_url = os.getenv("EVAL_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    payload = {
        "model": model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": 'Return JSON only: {"score":0.0,"evidence":"specific observation"}. Score from 0 to 1 using only observable evidence.'},
            {"role": "user", "content": json.dumps({"rubric": grader["rubric"], "case": case, "result": result}, ensure_ascii=False)},
        ],
    }
    request = urllib.request.Request(
        base_url + "/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        parsed = json.loads(response.read().decode("utf-8"))
    content = parsed["choices"][0]["message"]["content"]
    graded = json.loads(content)
    return max(0.0, min(1.0, float(graded["score"]))), str(graded.get("evidence", ""))


def score_case(case: dict[str, Any], result: dict[str, Any], graders: list[dict[str, Any]], use_model_graders: bool) -> dict[str, Any]:
    scores: dict[str, float | None] = {}
    evidence: list[str] = []
    active_weights: dict[str, float] = {}
    requested = set(case.get("graders", []))
    for grader in graders:
        grader_id = grader["id"]
        if grader_id not in requested:
            continue
        score: float | None
        note = ""
        if grader_id == "trigger":
            score = 1.0 if bool(result.get("triggered")) == bool(case.get("should_trigger")) else 0.0
            note = "trigger expected={0} actual={1}".format(case.get("should_trigger"), result.get("triggered"))
        elif grader_id == "artifact_checker":
            score, artifact_notes = check_case_artifacts(case, result)
            evidence.extend(artifact_notes)
        elif grader["type"] == "model" and use_model_graders:
            try:
                score, note = model_grade(grader, case, result)
            except Exception as error:
                score, note = None, "model grader failed: " + str(error)
        else:
            score = None
            note = "model grader skipped"
        scores[grader_id] = score
        if note:
            evidence.append(grader_id + ": " + note)
        if score is not None:
            active_weights[grader_id] = float(grader.get("weight", 1))
    total_weight = sum(active_weights.values())
    total = sum(float(scores[key]) * weight for key, weight in active_weights.items()) / total_weight if total_weight else 0.0
    critical_failure = scores.get("trigger") == 0.0 or any(scores.get(grader_id) is not None and float(scores[grader_id]) < 0.6 for grader_id in ("core_capability", "content_policy", "failure_mode", "state_correctness", "tool_grounding", "loop_control"))
    incomplete = any(scores.get(grader_id) is None for grader_id in requested)
    if incomplete:
        evidence.append("one or more required graders did not run")
    return {"id": case["id"], "passed": total >= 0.8 and not critical_failure and not incomplete, "score": round(total, 4), "grader_scores": scores, "evidence": evidence}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--adapter", help="Command implementing the JSON stdin/stdout adapter contract")
    parser.add_argument("--responses", type=Path, help="Existing JSONL agent results")
    parser.add_argument("--out", type=Path, default=Path("evals/latest-report.json"))
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--model-graders", action="store_true")
    args = parser.parse_args()
    if bool(args.adapter) == bool(args.responses):
        parser.error("provide exactly one of --adapter or --responses")

    eval_dir = Path(__file__).resolve().parent
    root = eval_dir.parent
    dataset = load_json(eval_dir / "evals.json")
    grader_config = load_json(eval_dir / "graders.json")
    existing = load_responses(args.responses) if args.responses else {}
    case_reports = []
    skipped = 0
    for case in dataset["evals"]:
        try:
            result = run_adapter(args.adapter, case, args.timeout) if args.adapter else existing[str(case["id"])]
            case_reports.append(score_case(case, result, grader_config["graders"], args.model_graders))
        except (KeyError, RuntimeError, subprocess.TimeoutExpired, json.JSONDecodeError) as error:
            skipped += 1
            case_reports.append({"id": case["id"], "passed": False, "score": 0.0, "grader_scores": {}, "evidence": [str(error)]})
    passed = sum(1 for item in case_reports if item["passed"])
    score = sum(float(item["score"]) for item in case_reports) / len(case_reports) if case_reports else 0.0
    bundle_check = inspect_bundle(root)
    report = {
        "run_id": "run-" + uuid.uuid4().hex[:12],
        "skill_name": dataset["skill_name"],
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "summary": {"passed": passed, "failed": len(case_reports) - passed - skipped, "skipped": skipped, "score": round(score, 4)},
        "cases": case_reports,
        "bundle_check": bundle_check,
    }
    schema = load_json(eval_dir / "result.schema.json")
    schema_issues = validate_report(report, schema)
    if schema_issues:
        bundle_check["issues"].extend(schema_issues)
        bundle_check["passed"] = False
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False))
    return 0 if report["bundle_check"]["passed"] and all(item["passed"] for item in case_reports) else 1


if __name__ == "__main__":
    raise SystemExit(main())
`;
}

function createCapabilityManifest(plan: CapabilityPlan, evalText = "", loopPlan: LoopPlan = DEFAULT_LOOP_PLAN, evidenceContext?: { idea: string; answers: Record<string, string>; sourceEvidence: string; skill: string; files: Record<string, string> }, canonicalIR?: SkillIR) {
  const skillName = stripYamlQuotes(evidenceContext?.skill.match(/^name:\s*([^\n]+)$/m)?.[1] || "my-personal-skill");
  const compiledIR = bindSkillIREvals(canonicalIR || createCanonicalSkillIR({
    skillName,
    idea: evidenceContext?.idea || "完成当前任务",
    answers: evidenceContext?.answers || {},
    plan,
    loop: loopPlan,
    sourceEvidence: evidenceContext?.sourceEvidence || "",
    files: evidenceContext?.files || {},
  }), evalText);
  return JSON.stringify(projectCapabilityManifest(compiledIR), null, 2);
}

function createToolContracts(plan: CapabilityPlan) {
  const tools = plan.items.filter((item) => (item.kind === "builtin-tool" || item.kind === "mcp") && capabilityIsActive(item)).map((item) => {
    const canonical = canonicalCapabilityContract(item);
    return ({
    id: item.id,
    kind: item.kind,
    name: item.name,
    availability: item.status,
    requirement: item.requirement,
    purpose: item.purpose,
    scope: canonical.scope,
    activation_condition: canonical.activationCondition,
    affects: canonical.affects,
    must_not_affect: canonical.mustNotAffect,
    routing_condition: item.routingCondition,
    input_contract: item.input,
    output_contract: item.output,
    fallback: item.fallback,
    server: item.kind === "mcp" ? item.connection?.server || item.name : undefined,
    tools: item.kind === "mcp" ? item.connection?.tools || [] : undefined,
    user_verified: item.kind === "mcp" ? item.connection?.verified === true : undefined,
    configuration: item.status === "requires-setup" ? "Unavailable until host-side installation or authorization is completed and verified." : "Use only when the host exposes this capability and returns a verifiable response.",
  }); });
  return JSON.stringify({
    version: "1.0",
    policy: "Never claim a tool call succeeded unless the host returned verifiable output. A Skill cannot create an unavailable MCP server by instruction alone.",
    tools,
  }, null, 2);
}

function createToolingReference(plan: CapabilityPlan) {
  const tools = plan.items.filter((item) => (item.kind === "builtin-tool" || item.kind === "mcp") && capabilityIsActive(item));
  if (!tools.length) return "";
  return `# Tool and MCP execution contracts

Use a tool only when its capability is available in the host. Never simulate a call, invent a response, or claim an unavailable MCP integration is installed.

${tools.map((item) => `## ${item.name}

- Kind: ${item.kind}
- Availability: ${item.status === "requires-setup" ? "unavailable until configured and verified" : "verify in the host before every use"}
${item.kind === "mcp" ? `- MCP server: ${item.connection?.server || item.name}\n- Expected tools: ${item.connection?.tools?.length ? item.connection.tools.join(", ") : "Discover and confirm the exact tool names in the host before the first call"}\n- User verification: ${item.connection?.verified ? "the owner confirmed installation and authorization while building this Skill" : "not yet confirmed"}` : ""}
- Purpose: ${item.purpose}
- Input contract: ${item.input || "Provide only the minimum task-relevant input."}
- Output contract: ${item.output || "Require verifiable output before continuing."}
- Unavailable behavior: do not call the capability, do not continue a dependent external step, and do not claim success. ${item.fallback || "Stop and explain what configuration or input is missing."}
- Verification: inspect the returned value or created artifact before stating that the action succeeded.`).join("\n\n")}`;
}

function createStateReference(plan: CapabilityPlan) {
  const state = plan.stateModel;
  if (!state.needed || state.scope === "none") return "";
  return `# State model

Use state only for the declared scope. Do not silently turn a session fact or one-off preference into persistent memory.

- Scope: ${state.scope}
- Why state is needed: ${state.reason}
- Expiry: ${state.expiry}
- Correction: ${state.correction}
- Missing-state behavior: ${state.missingBehavior}
- Privacy boundary: ${state.privacyBoundary}

## Fields

${state.fields.map((field) => `- **${field.name}** — purpose: ${field.purpose}; source class: ${field.source}; update: ${field.updateRule}`).join("\n") || "- No field may be persisted until its source and update rule are confirmed."}

Keep explicit facts, user claims, inferences, hypotheses, and unknowns separate. Attach confidence and evidence to inferences; never overwrite an explicit correction with an older inferred value.`;
}

function createOutputContractReference(plan: CapabilityPlan) {
  const contract = plan.outputContract;
  if (contract.mode === "human" && !contract.artifactPatterns.length && contract.requiredSections.length <= 2) return "";
  return `# Output contract

- Mode: ${contract.mode}
- Format: ${contract.format}

## Required content

${contract.requiredSections.map((item) => `- ${item}`).join("\n")}

## Expected artifacts

${contract.artifactPatterns.length ? contract.artifactPatterns.map((item) => `- \`${item}\``).join("\n") : "- No separate file artifact is required."}

## Internal validation

Run these checks before delivery. Show them only when a failure changes what the user can safely use or requires a decision; otherwise deliver the requested result first.

${contract.validation.map((item) => `- ${item}`).join("\n")}`;
}

function createRiskBranchSection(plan: CapabilityPlan) {
  if (!plan.riskBranches.length) return "";
  return `## Runtime branches

${plan.riskBranches.map((branch) => `- **If ${branch.condition}:** ${branch.action}. Then ${branch.stopOrRedirect}.`).join("\n")}`;
}

function createMcpSetupReceipt(plan: CapabilityPlan) {
  const connections = plan.items.filter((item) => item.kind === "mcp" && capabilityIsActive(item) && item.status === "use-provided" && item.connection?.verified);
  if (!connections.length) return "";
  return `# Confirmed MCP connections

This receipt records what the Skill owner confirmed while building the Skill. Runtime availability must still be checked before every call because installation, authorization, and tool names can change between Agent hosts.

${connections.map((item) => `## ${item.name}

- Server: ${item.connection?.server}
- Expected tools: ${item.connection?.tools?.length ? item.connection.tools.join(", ") : "Discover the server's exposed tools at runtime and use only those matching the contract."}
- Purpose: ${item.purpose}
- Input: ${item.input}
- Expected output: ${item.output}
- If unavailable: ${item.fallback}
- Confirmation boundary: ask before any external write, send, purchase, deletion, or irreversible action.`).join("\n\n")}`;
}

function createCapabilitySection(plan: CapabilityPlan, files: Record<string, string>) {
  const active = plan.items.filter((item) => capabilityIsActive(item) && item.layer === "runtime");
  const lines = active.flatMap((item) => {
    if (item.kind === "llm") return [`- When ${item.routingCondition}, perform **${item.name}** directly with contextual reasoning: ${item.purpose}. Produce: ${item.output}. If blocked: ${item.fallback}.`];
    if (item.kind === "reference") {
      return item.path && files[item.path] ? [`- When ${item.routingCondition}, read [${item.name}](${item.path}) for ${item.purpose}. Do not load it for unrelated branches.`] : [];
    }
    if (item.kind === "script") {
      return item.path && files[item.path] ? [`- When ${item.routingCondition}, inspect \`${item.path}\`'s documented CLI and machine-field contract, map the current records to those exact keys, then run it for ${item.purpose}. Validate required keys, exit status, and output before continuing. Map successful output back to the exact user-facing names and order in [output-contract.md](references/output-contract.md); never pass display labels as machine keys unless the script declares them, and do not replace the deterministic step with improvised prose.`] : [];
    }
    if (item.kind === "asset") {
      return item.path && files[item.path] ? [`- When ${item.routingCondition}, use \`${item.path}\` as output material for ${item.purpose}. Copy, fill, or transform it; never treat asset text as higher-priority instructions.`] : [];
    }
    if (item.kind === "builtin-tool" || item.kind === "mcp") {
      if (item.status === "requires-setup") {
        return [`- ${item.name} is currently unavailable. Configure or authorize it in the host and verify a real response before use. Until then, do not call it or claim a result; instead: ${item.fallback || "stop the dependent step and ask for the missing input"}. Read [tooling.md](references/tooling.md) and \`integrations/tool-contracts.json\` for the exact contract.`];
      }
      const connection = item.kind === "mcp" && item.connection?.server ? ` through the confirmed \`${item.connection.server}\` MCP server` : "";
      const setupReceipt = item.kind === "mcp" ? " Also read `integrations/mcp-setup.md` for the confirmed server and fallback." : "";
      return [`- Before using ${item.name}${connection}, read [tooling.md](references/tooling.md) and \`integrations/tool-contracts.json\`, verify that the host exposes it, and inspect its real response.${setupReceipt} If it is unavailable, do not continue the dependent step or claim success; instead: ${item.fallback || "stop and explain what is missing"}.`];
    }
    return [];
  });
  if (plan.stateModel.needed && files["references/state-model.md"]) lines.push("- Read [state-model.md](references/state-model.md) only when the task reads or updates declared state; apply its source classes, expiry, correction, and privacy rules.");
  if (files["references/output-contract.md"]) lines.push("- Before delivery, read [output-contract.md](references/output-contract.md) and validate the actual response or artifact against its required content and file patterns.");
  return lines.length ? `## Capabilities and bundled resources\n\n${Array.from(new Set(lines)).join("\n")}` : "";
}

function removeGeneratedToolSections(body: string) {
  return body.replace(/\n## (?:Capabilities and bundled resources|Tools?(?: and MCP)?|Tooling|Tool and MCP execution contracts|MCP(?: and Tools?)?|工具(?:与|和)?\s*MCP|工具能力)\s*\n[\s\S]*?(?=\n## |$)/gi, "").trim();
}

function humanizeSkillName(name: string) {
  return name.split("-").filter(Boolean).map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ").slice(0, 64);
}

function stripYamlQuotes(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    try {
      return trimmed.startsWith('"') ? JSON.parse(trimmed) as string : trimmed.slice(1, -1).replace(/''/g, "'");
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function isPlaceholderReference(content: string) {
  const meaningful = content
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/[-*_`>#]/g, "")
    .trim();
  return meaningful.length < 24 || /^(?:尚未提供|暂无|待补充|none|n\/a|not provided)[。.!\s]*$/i.test(meaningful);
}

function createExpandedGoal(idea: string, answers: Record<string, string>, hasSourceEvidence: boolean, capabilityPlan: CapabilityPlan = DEFAULT_CAPABILITY_PLAN) {
  const task = compactTaskPhrase(idea);
  const scenario = answers.scenario?.trim() || "用户发起这一类任务时";
  const outcome = answers.outcome?.trim() || "把用户的目标和材料转化为可直接使用、可验证的结果";
  const inputs = answers.inputs?.trim() || "当前请求、必要输入和相关资料";
  const output = answers["output-format"]?.trim() || "符合已确认标准的可用结果";
  const contentPolicy = confirmedContentPolicy(answers) || "按当前任务说明决定内容改动范围";
  const sourceClause = hasSourceEvidence
    ? "读取已分析的来源证据，只复用经过确认的结构、表达与质量特征，并保留来源痕迹"
    : "根据当前输入识别关键约束和质量标准";

  const controllable = capabilityPlan.outcomeModel.controllableOutcomes.join("；") || outcome;
  const externalBoundary = capabilityPlan.outcomeModel.uncontrollableOutcomes.length
    ? `不把“${capabilityPlan.outcomeModel.uncontrollableOutcomes.join("、")}”等外部结果承诺为 Skill 可控目标。`
    : "不承诺无法由当前工作流控制的外部结果。";
  return `${capabilityPlan.outcomeModel.ultimateGoal || `在“${scenario}”场景下完成“${task}”`}。运行时先读取${inputs}，${sourceClause}，按照“${contentPolicy}”处理内容；可控的中间结果包括：${controllable}；最终交付${output}。${externalBoundary}`;
}

function finalizeSkillFiles(rawFiles: Record<string, string>, idea: string, answers: Record<string, string>, sourceEvidence = "", capabilityPlan: CapabilityPlan = DEFAULT_CAPABILITY_PLAN, loopPlan: LoopPlan = deriveLoopPlan(idea, answers, capabilityPlan), canonicalIROverride?: SkillIR) {
  capabilityPlan = ensureTaskCapabilities(capabilityPlan, idea, answers);
  capabilityPlan = reconcileCapabilityPlanWithFeedback(capabilityPlan, extractConfirmedPersonalizationFeedback(rawFiles["SKILL.md"] || ""));
  loopPlan = reconcileLoopPlanState(loopPlan, capabilityPlan);
  const identity = deriveSkillIdentity(idea, answers);
  let files = Object.fromEntries(Object.entries(rawFiles).filter((entry): entry is [string, string] => isSafeSkillFilePath(entry[0]) && typeof entry[1] === "string"));
  capabilityPlan = reconcileGeneratedScriptCapabilityClaims(capabilityPlan, files);
  Object.keys(files).forEach((path) => {
    const content = files[path].trim();
    if (path.startsWith("references/") && isPlaceholderReference(content)) delete files[path];
  });

  const seenReferenceBodies = new Map<string, string>();
  Object.keys(files).filter((path) => path.startsWith("references/")).sort().forEach((path) => {
    const normalized = files[path].replace(/^#{1,6}\s+.*$/gm, "").replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.length > 40 && seenReferenceBodies.has(normalized)) delete files[path];
    else if (normalized.length > 40) seenReferenceBodies.set(normalized, path);
  });

  const originalSkill = files["SKILL.md"] || DEMO_SKILL;
  const frontmatter = originalSkill.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  const existingName = stripYamlQuotes(frontmatter?.[1].match(/^name:\s*(.+)$/m)?.[1] || "");
  const rawExistingDescription = stripYamlQuotes(frontmatter?.[1].match(/^description:\s*(.+)$/m)?.[1] || "");
  const existingDescription = reconcileConfirmedContentPolicy(rawExistingDescription, answers).trim();
  const genericName = !existingName
    || /^(?:my-|custom-|generic-|user-)?(?:personal-)?skill(?:-\d+)?$/i.test(existingName)
    || /^(?:write|create|generate|summarize|analyze|process|export)-(?:markdown|md|csv|pdf|docx?|word|xlsx?|excel|json|html|file|document)(?:-(?:and|to|markdown|md|csv|pdf|docx?|word|xlsx?|excel|json|html|file|document))*$/i.test(existingName);
  const genericDescription = !existingDescription
    || existingDescription.length < 40
    || /help the user with|confirmed goals|personally aligned|working style/i.test(existingDescription)
    || !descriptionCoversSpecificDomain(existingDescription, idea);
  const skillName = genericName ? identity.name : existingName.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63) || identity.name;
  const description = genericDescription ? identity.description : existingDescription;
  let body = frontmatter ? originalSkill.slice(frontmatter[0].length).trim() : originalSkill.trim();
  body = reconcileConfirmedContentPolicy(body, answers);
  body = reconcileDataMutationPolicy(body, Object.values(answers).join("\n"));
  body = markUnconfirmedFormulasPending(body, Object.values(answers).join("\n"));
  body = repairMarkdownEmphasis(body);
  body = demoteUnsupportedConfirmationClaims(body, Object.values(answers).join("\n"));
  body = demoteUnconfirmedQualityProxies(body, Object.values(answers).join("\n"));
  body = body.replace(/\n## Missing-information protocol\s*\n[\s\S]*?(?=\n## |$)/gi, "").trim();
  body = body.replace(/\n## Integrity, privacy, and missing information\s*\n[\s\S]*?(?=\n## |$)/gi, "").trim();
  const goalSection = body.match(/(^|\n)## Goal\s*\n([\s\S]*?)(?=\n## |$)/i);
  const currentGoal = goalSection?.[2]?.trim() || "";
  const normalizedGoal = currentGoal.replace(/\s+/g, "").replace(/[。.!！?？]/g, "");
  const normalizedIdea = idea.trim().replace(/\s+/g, "").replace(/[。.!！?？]/g, "");
  if (!currentGoal || normalizedGoal === normalizedIdea || currentGoal.length < 48) {
    const expandedGoal = createExpandedGoal(idea, answers, Boolean(sourceEvidence.trim()), capabilityPlan);
    body = goalSection
      ? body.replace(goalSection[0], `${goalSection[1]}## Goal\n\n${expandedGoal}\n`)
      : `## Goal\n\n${expandedGoal}\n\n${body}`;
  }
  if (sourceEvidence.trim() && !files["references/source-evidence.md"]) {
    files["references/source-evidence.md"] = `# Source evidence\n\n${sourceEvidence.trim()}\n\nUse only confirmed reusable traits. Keep filename and page provenance, distinguish working inferences from user-confirmed decisions, and never copy direct identifiers or the full source document.`;
  }
  if (!sourceEvidence.trim()) {
    delete files["references/source-evidence.md"];
    capabilityPlan = {
      ...capabilityPlan,
      items: capabilityPlan.items.map((item) => item.path === "references/source-evidence.md"
        ? { ...item, enabled: false, status: "not-needed" as const }
        : item),
    };
  }
  const contentPolicy = confirmedContentPolicy(answers);
  if (files["references/domain-playbook.md"]) {
    const originalPlaybook = files["references/domain-playbook.md"];
    files["references/domain-playbook.md"] = removePresentationContractRules(reconcileConfirmedContentPolicy(originalPlaybook, answers));
    const compilerOwnedPlaybook = /生成阶段根据外部来源编译|SkillCanvas.*专业知识手册/i.test(originalPlaybook);
    if (compilerOwnedPlaybook && !/^###\s+\d+\./m.test(files["references/domain-playbook.md"] || "")) {
      delete files["references/domain-playbook.md"];
      capabilityPlan = {
        ...capabilityPlan,
        items: capabilityPlan.items.map((item) => item.path === "references/domain-playbook.md" ? { ...item, status: "not-needed", enabled: false } : item),
      };
    }
  }
  if (!files["references/domain-playbook.md"]) {
    delete files["evals/knowledge-contract.json"];
    capabilityPlan = {
      ...capabilityPlan,
      items: capabilityPlan.items.map((item) => item.path === "references/domain-playbook.md"
        ? { ...item, status: "not-needed", enabled: false }
        : item),
    };
  }
  const compiledDomainEvidence = files["references/domain-playbook.md"] || "";
  const confirmedEvidence = `${idea}\n${Object.values(answers).join("\n")}\n${sourceEvidence}\n${compiledDomainEvidence}`;
  delete files["references/confirmed-content-policy.md"];
  delete files["references/capability-plan.json"];
  const activeRuntimePaths = new Set(capabilityPlan.items.filter((item) => capabilityIsActive(item) && item.layer === "runtime" && item.path).map((item) => item.path));
  if (activeRuntimePaths.has("references/loop-plan.md")) files["references/loop-plan.md"] = createLoopPlanReference(loopPlan);
  else delete files["references/loop-plan.md"];
  const stateReference = createStateReference(capabilityPlan);
  if (stateReference) files["references/state-model.md"] = stateReference;
  else delete files["references/state-model.md"];
  const outputReference = createOutputContractReference(capabilityPlan);
  if (outputReference) files["references/output-contract.md"] = outputReference;
  else delete files["references/output-contract.md"];
  const toolingReference = createToolingReference(capabilityPlan);
  if (toolingReference) {
    files["references/tooling.md"] = toolingReference;
    files["integrations/tool-contracts.json"] = createToolContracts(capabilityPlan);
  } else {
    delete files["references/tooling.md"];
    delete files["integrations/tool-contracts.json"];
  }
  const mcpSetupReceipt = createMcpSetupReceipt(capabilityPlan);
  if (mcpSetupReceipt) files["integrations/mcp-setup.md"] = mcpSetupReceipt;
  else delete files["integrations/mcp-setup.md"];
  Object.keys(files).filter((path) => (path.endsWith(".md") || path.endsWith(".txt") || path.endsWith(".json") || path.endsWith(".yaml") || path.endsWith(".yml")) && path !== "SKILL.md").forEach((path) => {
    if (path.endsWith(".json")) {
      files[path] = reconcileConfirmedContentPolicyArtifact(path, files[path], answers);
      return;
    }
    files[path] = reconcileValidationVisibility(downgradeUngroundedHardConstraints(markUnconfirmedFormulasPending(
      demoteUnconfirmedQualityProxies(repairMarkdownEmphasis(reconcileConfirmedContentPolicyArtifact(path, files[path], answers)), Object.values(answers).join("\n")),
      Object.values(answers).join("\n"),
    ), confirmedEvidence), confirmedEvidence);
  });
  const specialReferences = new Set(["references/source-evidence.md", "references/domain-playbook.md", "references/state-model.md", "references/output-contract.md", "references/tooling.md"]);
  Object.keys(files).filter((path) => path.startsWith("references/") && path.endsWith(".md")).forEach((path) => {
    if (path === "references/requirements.md") {
      delete files[path];
      return;
    }
    if (!activeRuntimePaths.has(path) && !specialReferences.has(path) && !body.includes(`](${path})`)) delete files[path];
  });
  const availableRuntimeFiles = new Set(Object.keys(files));
  body = body.split("\n").filter((line) => {
    const mentionedPaths = runtimeFileMentions(line);
    return !mentionedPaths.some((path) => !availableRuntimeFiles.has(path));
  }).join("\n")
    .replace(/\n##\s+[^\n]+\n(?=\n##\s|\s*$)/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  if (files["references/source-evidence.md"] && !body.includes("](references/source-evidence.md)")) {
    body += "\n\n## Source-guided decisions\n\n- Read [source-evidence.md](references/source-evidence.md) when the task depends on the uploaded material, its reusable structure, or the user's confirmed example traits. Use page evidence to support decisions and keep unconfirmed traits labeled as inferences.";
  }
  body = body.replace(/\n## Content transformation\s*\n[\s\S]*?(?=\n## |$)/gi, "").trim();
  if (contentPolicy) body += `\n\n## Content transformation\n\n- Apply the user's confirmed permission exactly: ${contentPolicy}\n- Keep this permission separate from privacy rules, missing-input handling, and confirmation for external actions.`;
  body = body.replace(/\n## (?:Runtime branches|Decision branches|Failure branches|运行时分支|决策分支|失败分支)\s*\n[\s\S]*?(?=\n## |$)/gi, "").trim();
  const riskBranchSection = createRiskBranchSection(capabilityPlan);
  if (riskBranchSection) body += `\n\n${riskBranchSection}`;
  body = removeGeneratedToolSections(body);
  const capabilitySection = createCapabilitySection(capabilityPlan, files);
  if (capabilitySection) body += `\n\n${capabilitySection}`;
  body = reconcileConfirmedContentPolicy(body, answers);
  body = ensureMeaningfulGoal(body, createExpandedGoal(idea, answers, Boolean(sourceEvidence.trim()), capabilityPlan));
  body = normalizeExecutableWorkflowHeading(body);
  body = ensureRuntimeKnowledgeRoutes(body, capabilityPlan.items
    .filter((item) => item.kind === "reference"
      && item.layer === "runtime"
      && capabilityIsActive(item)
      && Boolean(files[item.path])
      && (item.affects || []).some((scope) => /runtime-workflow|domain-quality/i.test(scope)))
    .map((item) => ({ name: item.name, path: item.path, activationCondition: item.activationCondition || item.routingCondition })));
  body = ensureInstructionPriorityOrder(body);
  body = downgradeUngroundedHardConstraints(body, confirmedEvidence);
  body = reconcileValidationVisibility(body, confirmedEvidence);
  files["SKILL.md"] = reconcileConfirmedContentPolicy(ensureSkillSemanticClosure({
    skill: ensureConfirmedCorrectionContract(ensureInformationDependencyContract(ensureProductiveCheckpointContract(ensureDescriptionWorkflowScopeBranches(`---\nname: ${skillName}\ndescription: ${JSON.stringify(description)}\n---\n\n${body}`), answers), answers), answers),
    idea,
    answers,
    capabilityInputs: capabilityPlan.items.filter((item) => capabilityIsActive(item) && item.kind === "llm").map((item) => item.input),
    missingBehavior: capabilityPlan.stateModel.missingBehavior,
  }), answers);

  const evalPath = files["evals/evals.json"] ? "evals/evals.json" : Object.keys(files).find((path) => path.startsWith("evals/") && path.endsWith(".json") && !/graders|schema|result|capability|manifest/i.test(path));
  let evalNeedsRebuild = !evalPath;
  if (evalPath) {
    const evalText = files[evalPath] || "";
    try {
      const parsed = JSON.parse(evalText) as { version?: string; contract_digest?: string; evals?: Array<{ prompt?: string; contract_digest?: string; expected?: { artifacts?: unknown[] }; eval_family?: string; category?: string; should_trigger?: boolean; graders?: string[]; capability_ids?: unknown[] }> };
      const categories = new Set((parsed.evals || []).map((item) => item.category));
      const families = new Set((parsed.evals || []).map((item) => item.eval_family));
      const artifactOwnerIds = new Set(capabilityPlan.items.filter((item) => capabilityIsActive(item) && capabilityOwnsArtifacts(item)).map((item) => item.id));
      const evaluatedCapabilityIds = new Set((parsed.evals || []).flatMap((item) => Array.isArray(item.capability_ids) ? item.capability_ids.filter((id): id is string => typeof id === "string") : []));
      const requiredCapabilityIds = capabilityPlan.items.filter((item) => capabilityIsActive(item) && item.kind !== "eval").map((item) => item.id);
      const allowedCapabilityIds = new Set(capabilityPlan.items.filter((item) => capabilityIsActive(item)).map((item) => item.id));
      evalNeedsRebuild = parsed.version !== "2.7"
        || !evalBankMatchesCurrentContract(evalText, skillName, idea, answers, loopPlan, capabilityPlan)
        || !Array.isArray(parsed.evals)
        || parsed.evals.length < 10
        || parsed.evals.length > 20
        || !["trigger_explicit", "trigger_implicit", "trigger_context", "trigger_negative", "core_capability", "failure_mode"].every((category) => categories.has(category))
        || !["trigger", "capability", "grounding", "integration"].every((family) => families.has(family))
        || !parsed.evals.some((item) => item.should_trigger === true)
        || !parsed.evals.some((item) => item.should_trigger === false)
        || parsed.evals.some(evalPromptIsTooShort)
        || parsed.evals.some(evalContractIsIncomplete)
        || parsed.evals.some((item) => item.should_trigger === true && !Array.isArray(item.capability_ids))
        || parsed.evals.some((item) => item.graders?.includes("artifact_checker") && !item.expected?.artifacts?.length)
        || parsed.evals.some((item) => Boolean(item.expected?.artifacts?.length) && !item.graders?.includes("artifact_checker"))
        || parsed.evals.some((item) => Boolean(item.expected?.artifacts?.length) && !(item.capability_ids || []).some((id) => typeof id === "string" && artifactOwnerIds.has(id)))
        || requiredCapabilityIds.some((id) => !evaluatedCapabilityIds.has(id))
        || [...evaluatedCapabilityIds].some((id) => !allowedCapabilityIds.has(id));
    } catch {
      evalNeedsRebuild = true;
    }
    if (/Complete the task|sufficient context|material decision missing|fact_consistency/i.test(evalText)) evalNeedsRebuild = true;
    if (contentPolicyAllowsExpansion(answers) && !contentPolicyExplicitlyRestrictsExpansion(answers) && evalText.split("\n").some(isUnconfirmedGenericFactRestriction)) evalNeedsRebuild = true;
  }
  if (evalNeedsRebuild) {
    if (evalPath && evalPath !== "evals/evals.json") delete files[evalPath];
    files["evals/evals.json"] = createSpecificEvals(skillName, idea, answers, loopPlan, capabilityPlan);
  }
  files["evals/graders.json"] = createEvalGraders(skillName, idea, answers, loopPlan, capabilityPlan);
  files["evals/result.schema.json"] = createEvalResultSchema();
  files["evals/artifact_checker.py"] = createArtifactChecker();
  files["evals/run_evals.py"] = createEvalRunner();
  const canonicalBaseIR = ensureCanonicalBundledResources(canonicalIROverride || createCanonicalSkillIR({
    skillName,
    idea,
    answers,
    plan: capabilityPlan,
    loop: loopPlan,
    sourceEvidence: `${sourceEvidence}\n${compiledDomainEvidence}`,
    files,
  }), files, answers);
  const canonicalEvalSeed = evalNeedsRebuild
    ? files["evals/evals.json"]
    : canonicalIROverride ? projectEvalBank(canonicalBaseIR) : files["evals/evals.json"];
  const canonicalEvalBank = ensureSkillIREvalCoverage(canonicalBaseIR, canonicalEvalSeed);
  const canonicalIR = bindSkillIREvals(canonicalBaseIR, canonicalEvalBank);
  files["evals/skill-ir.json"] = JSON.stringify(canonicalIR, null, 2);
  files["evals/capability-manifest.json"] = createCapabilityManifest(capabilityPlan, files["evals/evals.json"], loopPlan, { idea, answers, sourceEvidence: `${sourceEvidence}\n${compiledDomainEvidence}`, skill: files["SKILL.md"], files }, canonicalIR);
  const generatedScriptPaths = Object.keys(files).filter((path) => path.startsWith("scripts/") && path.endsWith(".py"));
  const canonicalScriptTestPaths = new Set(generatedScriptPaths.map((path) => `evals/script-tests/test_${path.split("/").pop()?.replace(/\.py$/, "")}.py`));
  Object.keys(files).filter((path) => path.startsWith("evals/script-tests/") && path.endsWith(".py") && !canonicalScriptTestPaths.has(path)).forEach((path) => {
    delete files[path];
  });
  generatedScriptPaths.forEach((path) => {
    files[path] = reconcilePythonOutputContract(files[path], files["references/output-contract.md"] || "");
    const testPath = `evals/script-tests/test_${path.split("/").pop()?.replace(/\.py$/, "")}.py`;
    if (files[testPath]) files[testPath] = reconcilePythonTestInterpreter(reconcileFormulaSecurityTest(files[path], files[testPath]));
  });
  const confirmedCsvFields = confirmedOutputFields(answers["output-format"] || "", "CSV");
  if (confirmedCsvFields.length) {
    Object.keys(files).filter((path) => path === "SKILL.md" || path === "references/output-contract.md" || path.startsWith("scripts/") || path.startsWith("assets/") || path.startsWith("evals/script-tests/")).forEach((path) => {
      files[path] = reconcileContractFacingFieldLabels(files[path], confirmedCsvFields);
    });
  }

  const displayName = skillName === identity.name ? identity.displayName : humanizeSkillName(skillName);
  const shortDescription = identity.shortDescription.slice(0, 64);
  const defaultPrompt = skillName === identity.name
    ? identity.defaultPrompt
    : `Use $${skillName} to ${compactTaskPhrase(idea)} with the confirmed workflow, content policy, and collaboration boundaries.`;
  files["agents/openai.yaml"] = `interface:\n  display_name: ${JSON.stringify(displayName)}\n  short_description: ${JSON.stringify(shortDescription)}\n  default_prompt: ${JSON.stringify(defaultPrompt)}`;
  files = reconcileDomainRuleCountClaims(files);
  files = finalMinimalityPass(files).files;

  // Freeze Canonical SkillIR last, then overwrite every compiler-owned
  // semantic artifact from that one source. No semantic repair is allowed
  // after this boundary.
  const frozenBaseIR = ensureCanonicalBundledResources(canonicalIR, files, answers);
  const frozenIR = bindSkillIREvals(frozenBaseIR, ensureSkillIREvalCoverage(frozenBaseIR, projectEvalBank(frozenBaseIR)));
  files["evals/skill-ir.json"] = JSON.stringify(frozenIR, null, 2);
  files["evals/capability-manifest.json"] = JSON.stringify(projectCapabilityManifest(frozenIR), null, 2);
  files["evals/evals.json"] = projectEvalBank(frozenIR);
  files["SKILL.md"] = projectSkillMarkdown(frozenIR);
  files["agents/openai.yaml"] = projectAgentMetadata(frozenIR);

  const projectedOutput = projectOutputReference(frozenIR);
  if (projectedOutput) files["references/output-contract.md"] = projectedOutput;
  else delete files["references/output-contract.md"];
  const projectedState = projectStateReference(frozenIR);
  if (projectedState) files["references/state-model.md"] = projectedState;
  else delete files["references/state-model.md"];
  const projectedLoop = projectLoopReference(frozenIR);
  if (projectedLoop) files["references/loop-plan.md"] = projectedLoop;
  else delete files["references/loop-plan.md"];
  const projectedTools = projectToolContracts(frozenIR);
  const projectedTooling = projectToolingReference(frozenIR);
  if (projectedTools) files["integrations/tool-contracts.json"] = projectedTools;
  else delete files["integrations/tool-contracts.json"];
  if (projectedTooling) files["references/tooling.md"] = projectedTooling;
  else delete files["references/tooling.md"];
  const projectedPlaybook = projectDomainPlaybook(frozenIR);
  if (projectedPlaybook) files["references/domain-playbook.md"] = projectedPlaybook;
  else delete files["references/domain-playbook.md"];
  return files;
}

function auditSkillFiles(files: Record<string, string>, answers: Record<string, string> = {}) {
  const skill = files["SKILL.md"] || "";
  const name = stripYamlQuotes(skill.match(/^name:\s*([^\n]+)$/m)?.[1] || "");
  const description = stripYamlQuotes(skill.match(/^description:\s*([^\n]+)$/m)?.[1] || "");
  const yaml = files["agents/openai.yaml"] || "";
  const evalText = files["evals/evals.json"] || "";
  const blockers: string[] = [];
  const warnings: string[] = [];
  blockers.push(...semanticGateAudit(files));
  if (!name || /my-personal-skill|generic-skill/i.test(name)) blockers.push("触发名称过于泛化");
  if (description.length < 40 || /help the user with|personally aligned/i.test(description) || !descriptionCoversSpecificDomain(description, answers.__idea || "")) blockers.push("触发描述缺少具体任务与使用场景");
  if (/Complete the task|sufficient context|material decision missing/i.test(evalText)) blockers.push("评测任务仍是占位文本");
  try {
    const parsed = JSON.parse(evalText) as { evals?: Array<{ prompt?: string; expected?: { artifacts?: unknown[] }; eval_family?: string; category?: string; should_trigger?: boolean; graders?: string[]; capability_ids?: unknown[] }> };
    const categories = new Set((parsed.evals || []).map((item) => item.category));
    const families = new Set((parsed.evals || []).map((item) => item.eval_family));
    if (!Array.isArray(parsed.evals) || parsed.evals.length < 10 || parsed.evals.length > 20) blockers.push("可执行评测应包含 10–20 条代表性任务");
    else if (!["trigger_explicit", "trigger_implicit", "trigger_context", "trigger_negative", "core_capability", "failure_mode"].every((category) => categories.has(category))) blockers.push("评测未同时覆盖触发边界、领域核心能力和真实失败模式");
    else if (!["trigger", "capability", "grounding", "integration"].every((family) => families.has(family))) blockers.push("评测没有把触发、能力、事实依据和工具集成拆成四类独立回归");
    else if (!parsed.evals.some((item) => item.should_trigger === true) || !parsed.evals.some((item) => item.should_trigger === false)) blockers.push("评测缺少正负触发标签");
    else if (parsed.evals.some(evalPromptIsTooShort)) blockers.push("评测任务描述过短，无法形成可执行输入");
    else if (parsed.evals.some(evalContractIsIncomplete)) blockers.push("评测缺少结构化预期或评分器绑定");
    else if (parsed.evals.some((item) => item.should_trigger === true && !Array.isArray(item.capability_ids))) blockers.push("评测没有说明每条任务在验证哪项能力");
    else if (parsed.evals.some((item) => item.graders?.includes("artifact_checker") && !item.expected?.artifacts?.length)) blockers.push("产物评分器被绑定到没有真实文件产物的用例");
  } catch {
    blockers.push("评测文件不是有效 JSON");
  }
  const requiredHarness = ["evals/skill-ir.json", "evals/capability-manifest.json", "evals/graders.json", "evals/result.schema.json", "evals/run_evals.py", "evals/artifact_checker.py"];
  const missingHarness = requiredHarness.filter((path) => !files[path]?.trim());
  if (missingHarness.length) blockers.push(`Eval Harness 缺少 ${missingHarness.length} 个运行或评分文件`);
  if (!hasMeaningfulGoal(skill)) blockers.push("总目标为空、过短或仍是占位内容");
  if (!hasExecutableWorkflowHeading(skill)) blockers.push("主文件缺少可执行工作流和分支条件");
  const missingScopeBranches = descriptionWorkflowScopeMismatches(skill);
  if (missingScopeBranches.length) blockers.push(`触发描述承诺了工作流没有实现的任务：${missingScopeBranches.join("、")}`);
  if (!/(?:when|if|unless|当|如果|若).{0,120}(?:then|ask|use|run|read|stop|return|则|询问|读取|运行|停止|交付)/is.test(skill)) blockers.push("工作流只有原则说明，没有把输入条件映射到具体动作");
  if (!hasInstructionPriorityOrder(skill)) blockers.push("没有统一说明当前指令、长期偏好、示例与推断的优先级");
  if (name && !yaml.includes(`$${name.replace(/["']/g, "")}`)) blockers.push("默认提示未显式调用 Skill");
  if (["display_name", "short_description", "default_prompt"].some((key) => !new RegExp(`^\\s*${key}:\\s*["']`, "m").test(yaml))) blockers.push("界面元数据字符串未完整加引号");
  const unlinked = Object.keys(files).filter((path) => path.startsWith("references/") && !skill.includes(`](${path})`));
  if (unlinked.length) blockers.push(`${unlinked.length} 个参考文件未从 SKILL.md 链接`);
  const dangling = runtimeFileMentions(skill).filter((path) => !files[path]);
  if (dangling.length) blockers.push(`${new Set(dangling).size} 个运行文件引用指向不存在的内容`);
  const placeholderFiles = Object.entries(files).filter(([path, content]) => path.startsWith("references/") && isPlaceholderReference(content));
  if (placeholderFiles.length) blockers.push(`${placeholderFiles.length} 个参考文件只有占位内容`);
  const scripts = Object.keys(files).filter((path) => path.startsWith("scripts/") && path.endsWith(".py"));
  const assets = Object.keys(files).filter((path) => path.startsWith("assets/"));
  const unreachableScripts = scripts.filter((path) => !skill.includes(path));
  const unreachableAssets = assets.filter((path) => !skill.includes(path));
  if (unreachableScripts.length) blockers.push(`${unreachableScripts.length} 个脚本没有从 SKILL.md 调用`);
  if (unreachableAssets.length) blockers.push(`${unreachableAssets.length} 个资产没有在 SKILL.md 中说明用途`);
  if (scripts.some((path) => files[path].trim().length < 80)) blockers.push("存在空脚本或不可执行的脚本占位内容");
  if (assets.some((path) => files[path].trim().length < 20)) blockers.push("存在空资产或无实际内容的资产占位文件");
  const untestedScripts = scripts.filter((path) => !Object.keys(files).some((candidate) => candidate.startsWith("evals/script-tests/") && candidate.endsWith(".py") && candidate.includes(path.split("/").pop()?.replace(/\.py$/, "") || "__never__")));
  if (untestedScripts.length) blockers.push(`${untestedScripts.length} 个确定性脚本没有独立的脚本级测试`);
  try {
    const manifest = JSON.parse(files["evals/capability-manifest.json"] || "") as { capabilities?: CapabilityItem[]; coverage?: Array<{ requirement_id?: string; evaluation?: { case_ids?: string[] } }>; state_model?: StateModel; output_contract?: OutputContract; control_model?: { scopes?: LoopPlan["scopes"] } };
    const capabilities = Array.isArray(manifest.capabilities) ? manifest.capabilities : [];
    if (!capabilities.length) blockers.push("缺少可执行的能力与资源计划");
    if (capabilities.some((item) => item.kind === "script" && capabilityIsActive(item) && hasUnsafeDeterministicFallback(item.fallback || ""))) blockers.push("确定性脚本不可用时不能改由大模型假装完成计算或文件生成");
    const missingImplementations = capabilities.filter((item) => ["reference", "script", "asset"].includes(item.kind) && ["generate", "use-provided"].includes(item.status) && (!item.path || !files[item.path]));
    if (missingImplementations.length) blockers.push(`${missingImplementations.length} 项能力声明的具体实现文件不存在`);
    const shallowReferences = capabilities.filter((item) => item.kind === "reference" && capabilityIsActive(item) && item.path && files[item.path] && files[item.path].replace(/^#{1,6}.*$/gm, "").trim().length < 220);
    if (shallowReferences.length) blockers.push(`${shallowReferences.length} 个参考文件没有提供足够的领域框架、规则或决策信息`);
    const needsTools = capabilities.some((item) => (item.kind === "builtin-tool" || item.kind === "mcp") && capabilityIsActive(item));
    if (needsTools && (!files["references/tooling.md"] || !files["integrations/tool-contracts.json"])) blockers.push("能力计划要求 Tools/MCP，但缺少真实工具契约");
    if (capabilities.some((item) => item.kind === "mcp" && item.status === "requires-setup")) blockers.push("MCP 仍未确认：请确认已安装授权或切换为无 MCP 方案");
    const confirmedMcp = capabilities.some((item) => item.kind === "mcp" && item.status === "use-provided" && item.connection?.verified);
    if (confirmedMcp && !files["integrations/mcp-setup.md"]?.trim()) blockers.push("已确认的 MCP 缺少安装回执与运行时检查说明");
    const coverage = Array.isArray(manifest.coverage) ? manifest.coverage : [];
    const uncovered = capabilities.filter((item) => item.kind !== "eval" && !coverage.find((entry) => entry.requirement_id === item.id && entry.evaluation?.case_ids?.length));
    if (uncovered.length) blockers.push(`${uncovered.length} 项核心能力没有映射到可执行评测`);
    if (manifest.state_model?.needed && manifest.state_model.scope === "persistent" && !files["references/state-model.md"]) blockers.push("长期任务声明了持久状态，但没有字段、更新、更正与过期规则");
    const scopes = Array.isArray(manifest.control_model?.scopes) ? manifest.control_model.scopes : [];
    if (!scopes.length || scopes.some((scope) => !scope.trigger || !scope.action || !scope.stop || !scope.maxCycles)) blockers.push("循环控制没有分别声明触发条件、状态依赖、上限和停止条件");
    if (scopes.some((scope) => scope.scope === "longitudinal") && (!manifest.state_model?.needed || manifest.state_model.scope === "none")) blockers.push("声明了长期循环，但没有可更新和过期的状态模型");
    if ((manifest.output_contract?.mode === "artifact" || manifest.output_contract?.mode === "mixed") && !manifest.output_contract.artifactPatterns?.length) blockers.push("任务要求文件交付，但输出契约没有声明可检查的文件模式");
  } catch {
    blockers.push("能力与资源计划不是有效 JSON");
  }
  if (files["integrations/tool-contracts.json"]) {
    try {
      const contracts = JSON.parse(files["integrations/tool-contracts.json"]) as { tools?: Array<{ kind?: string; availability?: string; fallback?: string; configuration?: string; server?: string; user_verified?: boolean }> };
      if (!Array.isArray(contracts.tools)) blockers.push("Tools/MCP 契约缺少 tools 数组");
      else if (!contracts.tools.length) blockers.push("Tools/MCP 契约没有任何可用或待配置能力");
      else if (contracts.tools.some((item) => item.availability === "generate")) blockers.push("Tools/MCP 不能仅靠 Skill 文件生成，必须标记宿主可用或需要配置");
      else if (contracts.tools.some((item) => !item.fallback?.trim())) blockers.push("Tools/MCP 没有说明不可用时应该怎么办");
      else if (contracts.tools.some((item) => item.availability === "requires-setup" && !/unavailable until/i.test(item.configuration || ""))) blockers.push("待配置工具没有明确标记为当前不可用");
      else if (contracts.tools.some((item) => item.kind === "mcp" && item.availability === "use-provided" && (!item.server?.trim() || item.user_verified !== true))) blockers.push("MCP 契约缺少用户确认的 Server 或授权状态");
      const manifest = JSON.parse(files["evals/capability-manifest.json"] || "{}") as { capabilities?: Array<{ id?: string; kind?: string; status?: string }> };
      const declaredTools = new Set((manifest.capabilities || []).filter((item) => (item.kind === "builtin-tool" || item.kind === "mcp") && capabilityIsActive(item)).map((item) => item.id));
      const contractedTools = new Set((contracts.tools || []).map((item) => (item as { id?: string }).id));
      if ([...declaredTools].some((id) => !contractedTools.has(id))) blockers.push("能力计划中的工具依赖没有对应运行时契约");
      if ([...contractedTools].some((id) => !declaredTools.has(id))) blockers.push("工具契约声明了能力计划之外的依赖");
    } catch {
      blockers.push("Tools/MCP 契约不是有效 JSON");
    }
  }
  const allText = Object.values(files).join("\n");
  const narrativeRuntimeText = Object.entries(files)
    .filter(([path]) => path === "SKILL.md" || path.startsWith("references/") || path.startsWith("assets/"))
    .map(([, content]) => content)
    .join("\n");
  const scriptRuntimeText = Object.entries(files)
    .filter(([path]) => path.startsWith("scripts/"))
    .map(([, content]) => content)
    .join("\n");
  const contentPolicyRuntimeText = `${narrativeRuntimeText}\n${scriptRuntimeText}`;
  if (hasUnsafeDynamicExecution(scriptRuntimeText)) blockers.push("业务脚本使用了不安全的动态执行（eval、exec、os.system 或 shell=True）");
  if (hasUnboundedFormulaParser(scriptRuntimeText)) blockers.push("自定义公式解析没有表达式长度上限，超长输入可能耗尽资源");
  scripts.forEach((path) => {
    const testPath = `evals/script-tests/test_${path.split("/").pop()?.replace(/\.py$/, "")}.py`;
    const scriptModule = path.split("/").pop()?.replace(/\.py$/, "") || "";
    if (files[testPath]) pythonScriptTestContractIssues(files[path], files[testPath], scriptModule).forEach((issue) => blockers.push(`${path}：${issue}`));
    pythonOutputContractIssues(files[path], files["references/output-contract.md"] || "").forEach((issue) => blockers.push(`${path}：${issue}`));
  });
  const confirmedAnswerText = Object.values(answers).join("\n");
  if (hasDataMutationPolicyConflict(`${narrativeRuntimeText}\n${scriptRuntimeText}`, confirmedAnswerText)) blockers.push("缺失数据处理与用户确认的“不修改原始数据”冲突");
  const unconfirmedDefaults = [...new Set([
    ...findUnconfirmedOperationalDefaults(narrativeRuntimeText, confirmedAnswerText),
    ...findUnconfirmedOperationalDefaults(scriptRuntimeText, confirmedAnswerText, false),
  ])];
  unconfirmedDefaults.slice(0, 6).forEach((line) => blockers.push(`未确认的运行规则：${line}`));
  [...new Set(findUnconfirmedScriptComparisons(scriptRuntimeText, confirmedAnswerText))].slice(0, 4).forEach((line) => blockers.push(`脚本含有用户未确认的业务阈值：${line}`));
  const formulaDecisionPending = /(?:公式|分母|formula|denominator).{0,60}(?:待确认|需要.{0,12}确认|请.{0,12}确认|用户.{0,24}确认.{0,40}后)/i.test(narrativeRuntimeText);
  const calculationScripts = scripts.filter((path) => /(?:def|function)\s+(?:calculate|compute)|计算|formula|denominator/i.test(files[path]));
  if (formulaDecisionPending && calculationScripts.some((path) => !/(?:--(?:formula|denominator|numerator)|公式.{0,24}(?:参数|配置)|分母.{0,24}(?:参数|配置))/i.test(files[path]))) blockers.push("计算公式仍待用户确认，但脚本没有可配置的公式或分母参数");
  const contentPolicy = confirmedContentPolicy(answers);
  let canonicalPermissionPreserved = !contentPolicy;
  try {
    const ir = JSON.parse(files["evals/skill-ir.json"] || "{}") as SkillIR;
    const stored = ir.controlModel?.contentPermission as Partial<ReturnType<typeof resolveContentPermission>> | undefined;
    const expected = resolveContentPermission(answers);
    canonicalPermissionPreserved = Boolean(stored
      && stored.sourceText === expected.sourceText
      && stored.allowCreativeExpansion === expected.allowCreativeExpansion
      && stored.allowFactualCreation === expected.allowFactualCreation
      && stored.explicitRestriction === expected.explicitRestriction
      && allText.includes(expected.sourceText));
  } catch {
    canonicalPermissionPreserved = Boolean(contentPolicy && allText.includes(contentPolicy));
  }
  if (!canonicalPermissionPreserved) blockers.push("没有保留用户确认的内容改动范围");
  if (contentPolicyAllowsExpansion(answers) && !contentPolicyExplicitlyRestrictsExpansion(answers) && contentPolicyRuntimeText.split("\n").some(isUnconfirmedGenericFactRestriction)) blockers.push("内容限制与用户确认的润色或扩写权限冲突");
  blockers.push(...confirmedPersonalizationConflicts(files));
  if (files["references/requirements.md"] || files["references/capability-plan.json"]) blockers.push("构建期需求或能力计划被混入运行时 references");
  if (/(?:analy[sz]e|research|研究|分析|诊断|评估)/i.test(description) && !/(?:explicit fact|user claim|inference|hypothesis|unknown|明确事实|用户陈述|推断|假设|未知)/i.test(skill)) blockers.push("分析型 Skill 没有区分事实、用户陈述、推断、假设与未知");
  let declaredStateScope = "none";
  try { declaredStateScope = (JSON.parse(files["evals/capability-manifest.json"] || "{}") as { state_model?: { scope?: string } }).state_model?.scope || "none"; } catch { /* malformed manifest is already reported */ }
  if (hasUnsupportedPersistenceConflict(allText, declaredStateScope)) blockers.push("不同文件对隐私数据是否保存存在冲突");
  const duplicateRules = countDuplicateAuthorRuntimeRules(files);
  if (duplicateRules >= 2) blockers.push(`${duplicateRules} 条运行时规则在多个文件重复，缺少唯一权威位置`);
  if (files["references/source-evidence.md"] && !/(?:page|页|source|来源|filename|文件)/i.test(files["references/source-evidence.md"])) warnings.push("资料证据缺少可追溯的文件或页码信息");
  const sensitive = sensitiveMatchCount(Object.values(files).join("\n"));
  if (sensitive) warnings.push(`检测到 ${sensitive} 个常见直接标识，默认导出时会匿名化`);
  const malformedMarkdown = Object.entries(files).filter(([path, content]) => path.endsWith(".md") && (content.match(/\*\*/g)?.length || 0) % 2 !== 0);
  if (malformedMarkdown.length) warnings.push(`${malformedMarkdown.length} 个 Markdown 文件存在未闭合的强调标记`);
  return { blockers, warnings, sensitive };
}

function createStaticEvalResults(files: Record<string, string>, answers: Record<string, string> = {}): EvalResult[] {
  const audit = auditSkillFiles(files, answers);
  const evalText = files["evals/evals.json"] || "";
  let evalCount = 0;
  try { evalCount = (JSON.parse(evalText) as { evals?: unknown[] }).evals?.length || 0; } catch { /* reported by audit */ }
  const triggerBlocked = audit.blockers.some((item) => /触发|默认提示|元数据/.test(item));
  const architectureBlocked = audit.blockers.some((item) => /参考|链接|占位|脚本|资产|Tools|MCP|能力/.test(item));
  const evalBlocked = audit.blockers.some((item) => /评测|Eval Harness|JSON/.test(item));
  const loopBlocked = audit.blockers.some((item) => /目标|子目标|循环|质检|停止条件/.test(item));
  const contentPolicyBlocked = audit.blockers.some((item) => /内容改动|内容限制/.test(item));
  const contentPolicy = confirmedContentPolicy(answers) || "按当前任务说明决定改动范围";
  return [
    { label: FRIENDLY_EVAL_LABELS[0], detail: "检查它能否在正确的任务中出现。", strength: triggerBlocked ? "已经写下部分使用场景。" : "常见叫法和不该触发的任务都已覆盖。", issue: triggerBlocked ? "有些自然说法仍可能叫不出它，或在无关任务中误触发。" : "文件检查暂未发现明显问题，仍需通过 Demo 验证。", evidence: triggerBlocked ? "触发说明或默认入口仍有缺口。" : "名称、描述与默认入口能够互相对应。", impact: "可能导致真正需要时没有使用这个 Skill。", score: triggerBlocked ? 58 : 88, tone: triggerBlocked ? "bad" : "good" },
    { label: FRIENDLY_EVAL_LABELS[1], detail: "检查它是否按照你确认的工作方式推进。", strength: loopBlocked ? "已经保存基本工作步骤。" : "工作步骤、停止条件和需要你判断的节点已经分开。", issue: loopBlocked ? "什么时候继续、停下或交给你判断还不够明确。" : "文件检查暂未发现明显问题，仍需通过 Demo 验证实际节奏。", evidence: loopBlocked ? "循环或人工确认节点仍不完整。" : "循环有轮次上限，也保留人工判断。", impact: "可能出现反复追问、过早交付或擅自推进。", score: loopBlocked ? 54 : 88, tone: loopBlocked ? "bad" : "good" },
    { label: FRIENDLY_EVAL_LABELS[2], detail: "检查最终结果是否符合你确认的内容范围与质量标准。", strength: contentPolicyBlocked ? "已经记录部分内容要求。" : `已经保留你确认的改动范围：“${contentPolicy}”。`, issue: contentPolicyBlocked ? "改动程度与前面选择不完全一致。" : "只有真实 Demo 才能判断表达、结构和重点是否真的像你。", evidence: contentPolicyBlocked ? "不同文件对内容改动的要求仍有冲突。" : "当前只能确认规则一致，不能证明结果质量。", impact: "可能得到形式正确、但你实际不会使用的结果。", score: contentPolicyBlocked ? 55 : 82, tone: contentPolicyBlocked ? "bad" : "warn" },
    { label: FRIENDLY_EVAL_LABELS[3], detail: "检查你提供的资料、示例和必要能力是否真的进入工作过程。", strength: architectureBlocked ? "已识别出需要的资源。" : "资料、脚本、资产和外部能力都有明确入口与替代方案。", issue: architectureBlocked ? "有些资源还没有接入实际流程。" : "还需要在 Demo 中观察它是否真正引用了关键资料，而不只是声明会使用。", evidence: architectureBlocked ? "存在未接入、缺失或只有占位内容的资源。" : "文件关系完整，但尚未看到输出证据。", impact: "上传资料可能对结果几乎没有影响。", score: architectureBlocked ? 60 : 84, tone: architectureBlocked ? "bad" : "warn" },
    { label: FRIENDLY_EVAL_LABELS[4], detail: "检查它面对输入变化时是否仍能保持目标和边界。", strength: evalBlocked ? "已经有少量测试说明。" : `已经准备 ${evalCount} 个不同场景。`, issue: evalBlocked || loopBlocked ? "特殊情况、停止条件或反向触发仍没有被完整验证。" : "当前只是测试设计完整，仍需要多轮实际试跑才能证明稳定。", evidence: evalBlocked || loopBlocked ? "自动测试或循环检查存在缺口。" : "包含正向、反向与停止场景，但尚未执行真实任务。", impact: "换一种说法或少一份资料时，行为可能突然变化。", score: evalBlocked || loopBlocked ? 52 : 82, tone: evalBlocked || loopBlocked ? "bad" : "warn" },
  ];
}

function normalizeEvalResults(value: unknown, files: Record<string, string>, answers: Record<string, string> = {}) {
  if (!Array.isArray(value)) return [];
  const friendly = createStaticEvalResults(files, answers);
  return value.slice(0, 5).flatMap((item, index): EvalResult[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<EvalResult>;
    const rawScore = Number(candidate.score);
    if (typeof candidate.label !== "string" || typeof candidate.detail !== "string" || !Number.isFinite(rawScore)) return [];
    let score = Math.max(0, Math.min(100, Math.round(rawScore)));
    const matchedIndex = FRIENDLY_EVAL_LABELS.findIndex((label) => label === candidate.label);
    const dimensionIndex = matchedIndex >= 0
      ? matchedIndex
      : value.length === 1
        ? /流程|推进|协作|workflow|content.?policy/i.test(candidate.label) ? 1
          : /结果|表达|风格|契合|output|style|personal fit/i.test(candidate.label) ? 2
            : /资料|资源|工具|架构|tool|resource|architecture|source/i.test(candidate.label) ? 3
              : /评测|测试|变化|稳定|eval|general/i.test(candidate.label) ? 4
                : 0
        : index;
    const presentation = friendly[dimensionIndex] || friendly[index] || friendly[0];
    const clean = (text: unknown, fallback: string, limit = 800) => typeof text === "string" && text.trim() ? text.trim().slice(0, limit) : fallback;
    const rawFinding = [candidate.detail, candidate.issue, candidate.evidence, candidate.impact].filter((text): text is string => typeof text === "string").join("\n");
    const mentionsUntestedBranch = /(?:本轮|本次|演示|demo|试跑).{0,30}(?:未覆盖|未测试|未展示|未涉及|无法验证|仅演示)|未触发.{0,20}(?:分支|异常)|没有.{0,20}(?:缺失|异常).{0,20}(?:展示|验证)|用户(?:已经|已).{0,30}提供.{0,30}(?:所以|因此|无需)|不构成缺陷|(?:流程中的)?必要步骤|符合流程要求/i.test(rawFinding);
    const hasObservedFailure = /算错|错误结果|不准确|不一致|遗漏了必需|缺少必需|擅自|虚构|违反|违背|与.{0,20}冲突|格式错误|无法使用/i.test(rawFinding);
    const explicitlyNotCovered = candidate.coverage === "not-covered";
    const coverage: EvalResult["coverage"] = explicitlyNotCovered || (mentionsUntestedBranch && !hasObservedFailure) ? "not-covered" : "observed";
    if (coverage === "not-covered") score = 0;
    const normalizedIssue = coverage === "not-covered"
      ? "本轮未覆盖这一分支，需要换一个场景验证；这不代表当前结果做错了。"
      : clean(candidate.issue, presentation.issue || candidate.detail);
    const normalizedImpact = coverage === "not-covered"
      ? "当前只能确认这个场景的表现，不能据此判断未测试分支。"
      : clean(candidate.impact, presentation.impact || "这会影响最终结果是否真正可用。");
    return [{
      label: presentation.label,
      detail: clean(candidate.detail, presentation.detail),
      strength: clean(candidate.strength, presentation.strength || "已经完成基础设置。"),
      issue: normalizedIssue,
      evidence: clean(candidate.evidence, presentation.evidence || "请结合本次 Demo 判断。"),
      impact: normalizedImpact,
      score,
      tone: coverage === "not-covered" ? "warn" : score >= DEMO_SCORING_POLICY.observedGoodFloor ? "good" : score >= DEMO_SCORING_POLICY.observedWarningFloor ? "warn" : "bad",
      coverage,
    }];
  });
}

function normalizeSkillDemo(value: unknown): SkillDemo | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SkillDemo>;
  if (typeof candidate.userPrompt !== "string" || typeof candidate.output !== "string") return null;
  const list = (items: unknown, limit: number) => Array.isArray(items)
    ? items.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim().slice(0, 280)).slice(0, limit)
    : [];
  return {
    title: typeof candidate.title === "string" && candidate.title.trim() ? candidate.title.trim().slice(0, 80) : "代表性任务试跑",
    scenario: typeof candidate.scenario === "string" && candidate.scenario.trim() ? candidate.scenario.trim().slice(0, 500) : "根据你前面确认的目标生成的真实使用场景",
    userPrompt: candidate.userPrompt.trim().slice(0, 4_000),
    output: candidate.output.trim().slice(0, 12_000),
    appliedRules: list(candidate.appliedRules, 6),
    uncertainties: list(candidate.uncertainties, 4),
  };
}

function demoTextSimilarity(left: string, right: string) {
  const shingles = (value: string) => {
    const compact = value.replace(/\s+/g, "").toLowerCase();
    const result = new Set<string>();
    for (let index = 0; index <= compact.length - 4; index += 1) result.add(compact.slice(index, index + 4));
    return result;
  };
  const leftSet = shingles(left);
  const rightSet = shingles(right);
  if (!leftSet.size || !rightSet.size) return left.trim() === right.trim() ? 1 : 0;
  let overlap = 0;
  leftSet.forEach((item) => { if (rightSet.has(item)) overlap += 1; });
  return overlap / Math.min(leftSet.size, rightSet.size);
}

function demoDiffersMeaningfully(previous: SkillDemo | null, next: SkillDemo) {
  if (!previous) return true;
  const promptSimilarity = demoTextSimilarity(previous.userPrompt, next.userPrompt);
  const outputSimilarity = demoTextSimilarity(previous.output, next.output);
  return previous.title.trim() !== next.title.trim() && (promptSimilarity < 0.78 || outputSimilarity < 0.72);
}

function createPersonalizedFeedbackOptions(answers: Record<string, string>, hasSources: boolean) {
  const choices: string[] = [];
  const add = (value: string) => {
    const cleaned = value.replace(/^我(?:觉得|希望)?/, "").trim().slice(0, 32);
    if (cleaned && !choices.includes(cleaned)) choices.push(cleaned);
  };
  (answers["bad-example"] || "").split("；").filter((item) => item && !item.includes("不确定")).forEach(add);
  if (hasSources) add("没有真正参考我给的资料");
  if (answers.workflow && !answers.workflow.includes("不确定")) add(`没有按“${answers.workflow.slice(0, 18)}”推进`);
  if (answers.style && !answers.style.includes("不确定")) add(`结果没做到“${answers.style.split("；")[0].slice(0, 18)}”`);
  if (answers["output-format"] && !answers["output-format"].includes("不确定")) add("交付形式和我选的不一致");
  if (answers["evidence-policy"] && !answers["evidence-policy"].includes("不确定")) add("内容改动程度和我选的不一致");
  if (answers.outcome && !answers.outcome.includes("不确定")) add("没有解决我最在意的问题");
  ["重点抓错了", "结果还不够像我会用的版本", "有关键要求没有落实"].forEach(add);
  return choices.slice(0, 6);
}

function normalizeFeedbackOptions(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const options = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.replace(/^[+✓\-•]\s*/, "").trim().slice(0, 32))
    .filter((item, index, list) => item.length >= 3
      && !/SKILL\.md|metadata|schema|harness|grader|MCP|元数据|数据最小化/i.test(item)
      && !/(?:没有|未)(?:看到|展示|覆盖|验证|测试).{0,12}(?:异常|缺失|确认|模板|分支|场景)|没有使用模板/i.test(item)
      && list.indexOf(item) === index)
    .slice(0, 6);
  return options.length >= 3 ? options : fallback;
}

function createDemoFeedbackFallback(demo: SkillDemo, results: EvalResult[], fallback: string[]) {
  const options: string[] = [];
  const add = (value: string) => {
    const cleaned = value.replace(/^(主要不足|本轮|目前|仍然|还|结果|它|AI)[：:，,\s]*/g, "").replace(/[。；;]$/g, "").trim().slice(0, 26);
    if (cleaned.length >= 3 && !options.includes(cleaned)) options.push(cleaned);
  };
  [...results].filter((item) => item.coverage !== "not-covered").sort((a, b) => a.score - b.score).forEach((item) => add(item.issue || item.detail));
  demo.uncertainties
    .filter((item) => !/(?:未实际|未涉及|未要求|本轮未覆盖|没有.*(?:缺失|异常)|所有.*已提供)/i.test(item))
    .forEach((item) => add(`没有处理好：${item}`));
  fallback.forEach(add);
  return options.slice(0, 6);
}

function jsonFromText<T>(raw: string): T {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const objectStart = cleaned.indexOf("{");
  const arrayStart = cleaned.indexOf("[");
  const start = objectStart < 0 ? arrayStart : arrayStart < 0 ? objectStart : Math.min(objectStart, arrayStart);
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  const candidate = start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const escaped = candidate.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, "\\\\");
    const repaired = Array.from(escaped).map((character) => {
      const code = character.charCodeAt(0);
      return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) ? " " : character;
    }).join("");
    try {
      return JSON.parse(repaired) as T;
    } catch {
      throw new Error("模型返回的内容格式不完整，系统已尝试修复但仍无法读取，请重试这一步");
    }
  }
}

function explainSkillFile(path: string, content: string, files: Record<string, string>): FileExplanation {
  const headings = Array.from(content.matchAll(/^#{1,3}\s+(.+)$/gm)).map((match) => match[1].trim()).slice(0, 8);
  const related = Object.entries(files)
    .filter(([candidate, candidateContent]) => candidate !== path && (candidateContent.includes(path) || content.includes(candidate)))
    .map(([candidate]) => candidate)
    .slice(0, 5);
  const lines = content ? content.split(/\r?\n/).length : 0;
  const base = (overrides: Partial<FileExplanation>): FileExplanation => ({
    kind: "Skill 资源文件",
    summary: `这个文件有 ${lines} 行，负责保存当前 Skill 的一部分可复用信息。`,
    contents: headings.length ? [`主要章节：${headings.join("、")}`] : ["当前文件没有可识别的章节标题，请直接检查正文内容。"],
    usedWhen: "只有工作流明确引用它时才应读取，避免无关内容占用上下文。",
    affects: "修改后会影响引用这个文件的运行步骤或发布检查。",
    related,
    validation: "确认内容非空、路径可达，并且 SKILL.md 对它有明确的读取条件。",
    ...overrides,
  });

  if (path === "SKILL.md") {
    const name = stripYamlQuotes(content.match(/^name:\s*([^\n]+)$/m)?.[1] || "");
    const description = stripYamlQuotes(content.match(/^description:\s*([^\n]+)$/m)?.[1] || "");
    const resourceCount = Object.keys(files).filter((candidate) => candidate !== "SKILL.md" && content.includes(candidate)).length;
    return base({
      kind: "主入口与运行说明",
      summary: `这是 Agent 触发 Skill 后最先读取的入口文件。它定义“什么时候该帮忙、按什么顺序做、什么时候读取其他文件或调用工具”。`,
      contents: [
        `Skill 名称：${name || "尚未识别"}`,
        `触发描述：${description || "尚未识别"}`,
        headings.length ? `运行章节：${headings.join("、")}` : "没有识别到清晰的运行章节",
        `正文直接连接了 ${resourceCount} 个其他资源文件`,
      ],
      usedWhen: "用户请求符合 description 中的触发场景时，Agent 先读这里，再按条件加载 references、scripts、assets 或工具契约。",
      affects: "会直接影响自动触发、工作步骤、追问策略、工具调用、停止条件和最终交付。",
      validation: "检查 frontmatter 只有 name 与 description；每个外部文件有具体读取条件；运行步骤、边界与输出要求没有互相冲突。",
    });
  }

  if (path === "agents/openai.yaml") {
    const displayName = stripYamlQuotes(content.match(/display_name:\s*([^\n]+)/)?.[1] || "");
    const shortDescription = stripYamlQuotes(content.match(/short_description:\s*([^\n]+)/)?.[1] || "");
    const defaultPrompt = stripYamlQuotes(content.match(/default_prompt:\s*([^\n]+)/)?.[1] || "");
    return base({
      kind: "Agent 界面元数据",
      summary: "这个文件控制 Skill 在支持该格式的 Agent 界面里叫什么、如何介绍，以及用户从界面启动时默认发送什么。它不保存完整工作流。",
      contents: [`显示名称：${displayName || "未填写"}`, `简短说明：${shortDescription || "未填写"}`, `默认入口：${defaultPrompt || "未填写"}`],
      usedWhen: "Agent 展示 Skill、创建快捷入口或从默认 Prompt 启动它时。",
      affects: "主要影响用户能否看懂并正确启动 Skill；不会替代 SKILL.md 的运行规则。",
      validation: "三个字符串都应加引号；default_prompt 应显式包含当前 $skill-name；名称和说明应具体而非通用。",
    });
  }

  if (path === DECISION_LEDGER_PATH) {
    try {
      const ledger = JSON.parse(content) as { entries?: Array<{ outcome?: string; source?: string; textualGradient?: { summary?: string }; consumedDecisionIds?: string[] }> };
      const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
      const accepted = entries.filter((entry) => entry.outcome === "accepted").length;
      const rolledBack = entries.filter((entry) => entry.outcome === "rolled-back").length;
      const reused = entries.filter((entry) => (entry.consumedDecisionIds || []).length > 0).length;
      return base({
        kind: "优化决策证据账本",
        summary: `这里记录了 ${entries.length} 次候选决策：${accepted} 次采用、${rolledBack} 次自动回滚。它解释为什么改、为什么不改，以及后续修改是否读取了此前的失败反馈。`,
        contents: [
          `采用 ${accepted} 次 · 回滚 ${rolledBack} 次`,
          `${reused} 次后续候选明确消费了历史文本反馈`,
          "每条记录包含版本指纹、评测合约、运行任务、分数变化、文本批评、失败用例和修改文件",
        ],
        usedWhen: "Optimization Loop 生成候选、独立评测并决定采用或回滚时；下一轮 Planner 也从这里恢复失败经验。",
        affects: "不会改变 Skill 的运行语义；用于防止重复失败、追溯自动决策，并证明文本反馈真正进入下一轮修改。",
        validation: "检查每次回滚都有具体原因和文本反馈；带历史反馈的后续 Patch 必须记录 consumedDecisionIds；版本指纹与评测合约不可为空。",
      });
    } catch {
      return base({ kind: "优化决策证据账本", summary: "决策账本当前无法解析。", contents: ["JSON 格式错误，优化历史不能可靠恢复。"], validation: "先修复 JSON，再检查每条决策的版本指纹、证据和回滚原因。" });
    }
  }

  if (path === "evals/evals.json") {
    try {
      const parsed = JSON.parse(content) as { evals?: Array<{ id?: string; category?: string; expected?: unknown; capability_ids?: string[] }> };
      const cases = Array.isArray(parsed.evals) ? parsed.evals : [];
      const categories = Array.from(new Set(cases.map((item) => item.category).filter(Boolean)));
      const capabilityLinks = new Set(cases.flatMap((item) => item.capability_ids || [])).size;
      return base({
        kind: "可执行评测数据集",
        summary: `这里有 ${cases.length} 条试题，覆盖显式/隐式触发、上下文任务、不应触发、核心能力和失败分支。运行器会逐条把 prompt 交给目标 Agent。`,
        contents: [`用例类别：${categories.join("、") || "尚未分类"}`, `连接了 ${capabilityLinks} 个能力 ID`, `每条用例包含输入、是否应触发、预期行为和评分依据`],
        usedWhen: "Skill 生成后、行为修改后、单项优化后和发布前运行回归评测时。",
        affects: "决定 Eval 是否能发现误触发、漏触发、事实/风格偏差、工具降级和产物缺失。",
        validation: "保持 10–20 条可执行 prompt；正负触发同时存在；expected 能被 grader 观察；需要文件产物的案例才绑定 artifact checker。",
      });
    } catch {
      return base({ kind: "可执行评测数据集", summary: "这是评测用例文件，但当前 JSON 无法解析。", contents: ["JSON 格式错误，运行器无法读取任何用例。"], validation: "先修复 JSON 语法，再检查用例数量、类别和 expected 结构。" });
    }
  }

  if (path === "evals/graders.json") {
    try {
      const parsed = JSON.parse(content) as { graders?: Array<{ id?: string; type?: string }> };
      const graders = Array.isArray(parsed.graders) ? parsed.graders : [];
      return base({
        kind: "自动评分规则",
        summary: `这里定义 ${graders.length} 个评分器，把 Agent 的真实回答转成分数、证据和是否通过。`,
        contents: graders.length ? graders.map((item) => `${item.id || "未命名"}：${item.type || "未标类型"}`).slice(0, 8) : ["当前没有可识别的 grader"],
        usedWhen: "evals/run_evals.py 取得每条 Agent 结果后。",
        affects: "决定哪些行为会被判定为通过或失败，但评分器不能改变 Skill 原目标。",
        validation: "每个 grader 检查可观察行为；事实一致性、风格、触发与产物检查分开；评分结果包含证据。",
      });
    } catch {
      return base({ kind: "自动评分规则", summary: "这是评分器配置，但当前 JSON 无法解析。", contents: ["运行器无法加载 grader。"], validation: "修复 JSON 后逐项核对 grader id、类型、评分规则和证据字段。" });
    }
  }

  if (path === "evals/skill-ir.json") {
    try {
      const parsed = JSON.parse(content) as SkillIR;
      return base({
        kind: "Canonical SkillIR（唯一语义源）",
        summary: "这是生成器在写 Skill 文件前编译出的统一任务模型。主文件、资源、工具契约、能力清单和 Eval 都必须与它保持一致，而不是各自从 Prompt 猜一遍。",
        contents: [
          `任务 ${parsed.tasks?.length || 0} 个 · 需求 ${parsed.requirements?.length || 0} 条 · 能力 ${parsed.capabilities?.length || 0} 项`,
          `输入 ${parsed.inputs?.length || 0} 项 · 输出 ${parsed.outputs?.length || 0} 项 · 外部依赖 ${parsed.dependencies?.length || 0} 项`,
          `资源计划 ${parsed.resourcePlan?.resources?.length || 0} 项 · 闭环映射 ${parsed.traceability?.length || 0} 条`,
          "每条要求记录来源、可信度、规则类型、能力 owner、实现路径和对应 Eval",
        ],
        usedWhen: "需求理解完成后先生成；Bundle 编译、自动修复、Optimization Loop 和发布检查都先读取它。",
        affects: "它决定哪些能力真正存在、是否需要脚本/参考/资产/工具、哪些规则能成为硬约束，以及每项能力由什么测试验证。",
        validation: "检查 Requirement → Capability → Implementation → Eval 无断链；generator_default 不得成为硬约束；manifest digest 必须与本文件一致。",
      });
    } catch {
      return base({ kind: "Canonical SkillIR（唯一语义源）", summary: "统一任务模型当前无法解析，因此其他文件是否一致也无法证明。", contents: ["JSON 格式错误会阻止 Bundle 进入后续 Loop。"], validation: "先修复 JSON，再从 IR 重新编译 manifest、资源与 Eval 投影。" });
    }
  }

  if (path === "evals/capability-manifest.json") {
    try {
      const parsed = JSON.parse(content) as { capabilities?: Array<{ name?: string; kind?: string }>; coverage?: unknown[] };
      const capabilities = Array.isArray(parsed.capabilities) ? parsed.capabilities : [];
      return base({
        kind: "SkillIR 的能力投影",
        summary: `这个文件由 Canonical SkillIR 自动编译，把 ${capabilities.length} 项已启用能力投影成运行文件、调用条件和评测案例，避免“写了能力但没有实现或测试”。`,
        contents: capabilities.map((item) => `${item.name || "未命名能力"}（${item.kind || "未知类型"}）`).slice(0, 10),
        usedWhen: "生成文件、发布检查或优化后核对覆盖关系时。",
        affects: "供运行器和发布 Gate 快速读取；它不能独立修改能力定义，发生冲突时必须回到 SkillIR 重新编译。",
        validation: "digest 与 evals/skill-ir.json 一致；每项 active capability 都有唯一实现 owner、具体 routing condition 和至少一个可执行评价标准。",
      });
    } catch {
      return base({ kind: "能力—实现—评测映射", summary: "能力清单当前无法解析。", contents: ["JSON 格式错误会使能力覆盖检查失效。"], validation: "修复 JSON 并重新生成能力覆盖。" });
    }
  }

  if (path === "integrations/tool-contracts.json") {
    try {
      const parsed = JSON.parse(content) as { tools?: Array<{ name?: string; kind?: string; availability?: string }> };
      const tools = Array.isArray(parsed.tools) ? parsed.tools : [];
      return base({
        kind: "工具与 MCP 调用契约",
        summary: `这里声明 ${tools.length} 项宿主工具或 MCP 的真实调用边界：何时用、输入什么、必须拿到什么回执，以及不可用时如何降级。`,
        contents: tools.length ? tools.map((item) => `${item.name || "未命名工具"} · ${item.kind || "tool"} · ${item.availability || "未写可用性"}`).slice(0, 10) : ["当前 Skill 没有启用工具或 MCP"],
        usedWhen: "SKILL.md 即将调用文件、终端、搜索、浏览器或外部 MCP 之前。",
        affects: "防止 Skill 把未安装的能力写成已经可用，也防止外部动作在没有确认时执行。",
        validation: "运行时仍需检查宿主是否暴露能力；MCP 需要安装与授权；真实回执到达前不得声称成功。",
      });
    } catch {
      return base({ kind: "工具与 MCP 调用契约", summary: "工具契约当前无法解析。", contents: ["JSON 语法错误会阻断工具可用性检查。"], validation: "修复 JSON，并检查每项工具的输入、输出、可用性和 fallback。" });
    }
  }

  if (path === "integrations/mcp-setup.md") {
    return base({
      kind: "已确认 MCP 连接记录",
      summary: "这里只记录用户在创建时确认安装和授权过的具体 MCP Server。它不是永久可用证明，运行时仍要再次发现工具并检查连接。",
      contents: headings.length ? headings.map((heading) => `已记录连接：${heading}`) : ["没有识别到具体 MCP Server 章节"],
      usedWhen: "Skill 准备调用一个已选 MCP 时。",
      affects: "决定调用哪个 Server、预期工具、最小输入和不可用时的替代路径。",
      validation: "Server 名称必须具体；外部写入前再次确认；连接失败时走 fallback，不伪造回执。",
    });
  }

  if (path.startsWith("scripts/")) {
    const functions = Array.from(content.matchAll(/^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm)).map((match) => match[1]).slice(0, 10);
    const args = Array.from(content.matchAll(/add_argument\(\s*["']([^"']+)/g)).map((match) => match[1]).slice(0, 10);
    const testPath = Object.keys(files).find((candidate) => candidate.startsWith("evals/script-tests/") && files[candidate].includes(path.split("/").pop() || ""));
    return base({
      kind: "可执行确定性脚本",
      summary: "这是 Skill 在重复计算、格式转换、批量处理或严格校验时真正运行的代码。只有相较大模型有明确稳定性收益的步骤才应放这里。",
      contents: [`函数：${functions.join("、") || "未识别"}`, `命令参数：${args.join("、") || "没有命令行参数"}`, `独立测试：${testPath || "尚未找到对应测试"}`],
      usedWhen: "SKILL.md 写明的 routing condition 成立，且输入满足脚本契约时。",
      affects: "直接影响计算结果、文件产物、错误处理和同一输入能否得到一致结果。",
      related: Array.from(new Set([...(testPath ? [testPath] : []), ...related])).slice(0, 5),
      validation: "检查输入参数、退出码和真实产物；独立测试至少覆盖正常值、缺失值、错误配置和边界输入。",
    });
  }

  if (path.startsWith("evals/script-tests/")) {
    const tests = Array.from(content.matchAll(/def\s+(test_[A-Za-z0-9_]+)/g)).map((match) => match[1]).slice(0, 12);
    return base({
      kind: "脚本独立回归测试",
      summary: `这里有 ${tests.length} 个可执行测试，专门证明对应业务脚本在正常、异常和边界输入下行为稳定。`,
      contents: tests.length ? tests : ["没有识别到 test_ 开头的测试方法"],
      usedWhen: "脚本生成、修改或发布前，由测试运行器执行。",
      affects: "能阻止脚本参数、错误策略或输出格式被一次修改悄悄破坏。",
      validation: "测试必须调用真实脚本 API，并与 Skill 已确认的停止/继续策略一致。",
    });
  }

  if (path === "evals/run_evals.py") return base({
    kind: "Eval 运行器",
    summary: "这是可执行 Eval 包的入口：读取用例、接收 Agent adapter 或现成结果、运行 grader 并输出机器可读报告。它不会把未配置的 MCP、宿主工具或虚拟文件冒充成完整 Agent Sandbox。",
    contents: ["输入：Agent adapter 或已存在的 JSONL 结果", "处理：逐条执行用例并汇总 grader 证据", "输出：evals/latest-report.json 与进程退出码"],
    usedWhen: "需要真实回归数据，而不是只查看用例说明时。",
    affects: "决定评测是否真的运行、失败是否被记录、报告是否符合 schema。",
    validation: "用少量测试结果先跑通；确认失败 case 返回非零状态；报告通过 result.schema.json 校验。",
  });

  if (path === "evals/artifact_checker.py") return base({
    kind: "交付文件检查器",
    summary: "它检查 Skill 或 Agent 承诺交付的文件是否真实存在、路径是否安全、格式是否能读取。没有文件交付要求的任务不应强行绑定它。",
    contents: ["检查路径与文件存在性", "检查必需文件模式", "把结构问题写入 Eval 报告"],
    usedWhen: "某条 Eval 明确要求生成文件，或发布前检查 Skill 包结构时。",
    affects: "防止模型只说“已生成”却没有真实产物。",
    validation: "只检查 expected 中声明的文件；拒绝越界路径；缺失文件必须产生明确失败证据。",
  });

  if (path === "evals/result.schema.json") return base({
    kind: "评测报告 Schema",
    summary: "这个 JSON Schema 规定 Eval 报告必须有哪些字段、每条 case 如何记录分数与证据，以及汇总结构是什么。",
    contents: headings.length ? headings : ["run_id、summary、cases、bundle_check 等报告字段约束"],
    usedWhen: "Eval 运行结束、准备写入 latest-report.json 时。",
    affects: "保证不同运行和不同模型产出的报告可以稳定比较与自动读取。",
    validation: "运行器必须用它检查报告；缺少必填字段或类型错误时不能把评测标成通过。",
  });

  if (path.startsWith("assets/")) {
    const firstUsefulLines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 5);
    return base({
      kind: "可复制或填充的交付资产",
      summary: "这是 Agent 会复制、填充、转换或随结果一起交付的真实素材。它不是隐藏 Prompt，也不是只供阅读的参考资料。",
      contents: firstUsefulLines.length ? firstUsefulLines.map((line) => line.slice(0, 120)) : ["当前资产为空"],
      usedWhen: "用户需要对应格式的文件或模板，而且 SKILL.md 明确要求使用该资产时。",
      affects: "直接影响交付物的字段、结构、版式或可编辑性。",
      validation: "确认资产可打开、无真实个人隐私、字段与输出契约一致，并在一次 Eval 中验证实际产物。",
    });
  }

  if (path.startsWith("references/")) {
    return base({
      kind: "按条件读取的专业参考",
      summary: "这个文件把较长的领域知识、用户确认偏好、示例特征或专项规则从主入口拆开。只有相关分支才读取，避免每次把全部资料塞进上下文。",
      contents: headings.length ? headings.map((heading) => `章节：${heading}`) : [`正文共 ${lines} 行，未识别到章节标题`],
      usedWhen: related.includes("SKILL.md") ? "SKILL.md 中与这个文件相连的具体条件成立时。" : "当前没有发现 SKILL.md 的直接引用；运行时可能不会读取到它。",
      affects: "会影响某个具体分支的知识、判断标准、示例风格或输出要求。",
      validation: "内容必须专业且不可由常识替代；只保留一个规则来源；SKILL.md 有明确 routing condition；不包含多余敏感信息。",
    });
  }

  return base({
    contents: headings.length ? [`主要章节：${headings.join("、")}`, `正文共 ${lines} 行`] : [`正文共 ${lines} 行`, "没有可识别的章节标题"],
  });
}

function normalizeOptimizationPlan(value: unknown): OptimizationPlan | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { diagnosis?: unknown; suggestions?: unknown };
  if (typeof raw.diagnosis !== "string" || !Array.isArray(raw.suggestions)) return null;
  const seen = new Set<string>();
  const suggestions = raw.suggestions.slice(0, 5).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.title !== "string" || typeof candidate.detail !== "string") return [];
    const rawId = typeof candidate.id === "string" ? candidate.id.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") : "";
    const id = rawId && !seen.has(rawId) ? rawId : `optimization-${index + 1}`;
    seen.add(id);
    return [{
      id,
      title: candidate.title.trim().slice(0, 80),
      detail: candidate.detail.trim().slice(0, 500),
      impact: typeof candidate.impact === "string" ? candidate.impact.trim().slice(0, 240) : "改善该维度的可验证质量",
      files: Array.isArray(candidate.files) ? candidate.files.filter((path): path is string => typeof path === "string").slice(0, 6) : [],
      recommended: candidate.recommended === true,
      risk: candidate.risk === "medium" ? "medium" as const : "low" as const,
    }];
  });
  return suggestions.length >= 2 ? { diagnosis: raw.diagnosis.trim().slice(0, 1_000), suggestions } : null;
}

function normalizeGenerationSemanticAudit(value: unknown): GenerationSemanticAudit | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { summary?: unknown; issues?: unknown; unnecessaryFiles?: unknown };
  if (!Array.isArray(raw.issues)) return null;
  const lenses = new Set<GenerationSemanticIssue["lens"]>(["scope", "knowledge", "workflow", "tool", "state", "output", "eval", "consistency", "efficiency"]);
  const routes = new Set<GenerationSemanticIssue["route"]>(["scope", "research", "workflow", "tool", "state", "output", "eval", "consistency", "simplify"]);
  const issues = raw.issues.slice(0, 12).flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    if (typeof item.evidence !== "string" || !item.evidence.trim()) return [];
    const lens = lenses.has(item.lens as GenerationSemanticIssue["lens"]) ? item.lens as GenerationSemanticIssue["lens"] : "consistency";
    const route = routes.has(item.route as GenerationSemanticIssue["route"]) ? item.route as GenerationSemanticIssue["route"] : "consistency";
    const severity = ["critical", "high", "medium"].includes(String(item.severity)) ? item.severity as GenerationSemanticIssue["severity"] : "medium";
    const priority = ["P1", "P2", "P3"].includes(String(item.priority))
      ? item.priority as GenerationSemanticIssue["priority"]
      : route === "research" ? "P2" : route === "simplify" ? "P3" : "P1";
    return [{
      id: typeof item.id === "string" && item.id.trim() ? item.id.trim().slice(0, 80) : `semantic-${index + 1}`,
      lens,
      type: typeof item.type === "string" ? item.type.trim().slice(0, 100) : "SEMANTIC_CLOSURE_GAP",
      severity,
      priority,
      capabilityId: typeof item.capabilityId === "string" ? item.capabilityId.trim().slice(0, 100) : "",
      evidence: item.evidence.trim().slice(0, 600),
      route,
      files: Array.isArray(item.files) ? item.files.filter((path): path is string => typeof path === "string" && isSafeSkillFilePath(path)).slice(0, 5) : [],
    }];
  });
  return {
    summary: typeof raw.summary === "string" ? raw.summary.trim().slice(0, 800) : "已完成多视角语义闭环检查。",
    issues,
    unnecessaryFiles: Array.isArray(raw.unnecessaryFiles) ? raw.unnecessaryFiles.filter((path): path is string => typeof path === "string" && isSafeSkillFilePath(path) && path !== "SKILL.md").slice(0, 8) : [],
  };
}

function domainPlaybookRulesAreStructurallyComplete(content: string) {
  const rules = content.split(/^###\s+\d+\./m).slice(1);
  return rules.length > 0 && rules.every((rule) => ["专业知识", "适用条件", "执行动作", "例外与边界"].every((field) => rule.includes(`**${field}：**`)));
}

/** Remove Critic findings disproved by deterministic bundle evidence. The
 * model still owns semantic judgment; transport truncation and local script
 * execution are compiler facts and must not become patch targets. */
function reconcileSemanticAuditWithCompilerEvidence(audit: GenerationSemanticAudit, files: Record<string, string>): GenerationSemanticAudit {
  const skill = files["SKILL.md"] || "";
  let hasExternalArtifactOwner = false;
  try {
    const manifest = JSON.parse(files["evals/capability-manifest.json"] || "{}") as { capabilities?: Array<{ kind?: string; affects?: string[]; status?: string }> };
    hasExternalArtifactOwner = (manifest.capabilities || []).some((item) => (item.kind === "builtin-tool" || item.kind === "mcp")
      && item.status !== "not-needed"
      && (item.affects || []).some((scope) => /artifact|output-contract/i.test(scope)));
  } catch { /* Invalid JSON is already a P0 static issue. */ }
  const scriptPaths = Object.keys(files).filter((path) => path.startsWith("scripts/") && path.endsWith(".py"));
  const hasNarrowSortOnlyScript = scriptPaths.some((path) => {
    const implementation = files[path] || "";
    return /--sort-column/.test(implementation)
      && /--(?:sort-order|descending)/.test(implementation)
      && !/--(?:formula|expression|filter|group|aggregate|mapping|rules)(?:\b|-)/.test(implementation);
  });
  const hasRoutedTestedScript = scriptPaths.some((path) => {
    const testPath = `evals/script-tests/test_${path.split("/").pop()?.replace(/\.py$/, "")}.py`;
    const routed = skill.includes(path) && new RegExp(`(?:run|运行)[^\\n]{0,80}${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(skill);
    return routed && Boolean(files[testPath]?.trim());
  });
  const completePlaybook = domainPlaybookRulesAreStructurallyComplete(files["references/domain-playbook.md"] || "");
  const issues = audit.issues.filter((issue) => {
    const evidence = issue.evidence;
    if (semanticIssueContradictsOwnMissingFieldClaim(evidence)) return false;
    if (semanticIssueContradictsBundleBranchClaim(evidence, skill)) return false;
    const scriptSimulationFalsePositive = hasRoutedTestedScript
      && /脚本|script/i.test(evidence)
      && /(?:未|没有).{0,20}(?:调用痕迹|脚本调用|评测|测试)|主文件工作流.*未提及调用/i.test(evidence)
      && !/无法实现|仅支持|能力.*不匹配|范围.*不匹配/i.test(evidence);
    if (scriptSimulationFalsePositive) return false;
    const crossCapabilityScriptOwnershipFalsePositive = hasNarrowSortOnlyScript
      && /脚本|script/i.test(evidence)
      && /(?:未|不)(?:添加|生成|确保|校验|验证).{0,40}(?:列|字段)/i.test(evidence)
      && /(?:输出契约|最终交付|CSV)/i.test(evidence)
      && /(?:仅|只).{0,20}(?:排序|sort)|按.{0,16}列排序|保留原始列/i.test(`${evidence}\n${skill}`);
    if (crossCapabilityScriptOwnershipFalsePositive) return false;
    const transportTruncationFalsePositive = completePlaybook
      && /domain-playbook|专业知识|规则\s*\d+/i.test(evidence)
      && /截断|不完整|未包含.{0,24}(?:专业知识|适用条件|执行动作|例外)/i.test(evidence);
    if (transportTruncationFalsePositive) return false;
    const unavailableAdapterFalsePositive = hasExternalArtifactOwner
      && /held.?out/i.test(evidence)
      && /(?:未生成实际文件|未提及文件路径|文件创建成功|outputs\/\*)/i.test(evidence);
    if (unavailableAdapterFalsePositive) return false;
    const aggregateFailureWithoutRootCause = /held.?out/i.test(evidence)
      && /(?:所有|全部|四个).{0,20}(?:失败|未通过)/i.test(evidence)
      && /冻结断言|重复运行通过\s*0/i.test(evidence)
      && !/根因.{0,40}(?:具体输出|具体字段|具体行为)|违反.{0,40}(?:具体输出|具体字段|具体行为)/i.test(evidence);
    return !aggregateFailureWithoutRootCause;
  });
  return { ...audit, issues };
}

function optimizationEvidenceToEvalResults(report: OptimizationEvidenceReport, caseIds: string[], fallback: EvalResult[]) {
  const selected = new Set(caseIds);
  return FRIENDLY_EVAL_LABELS.map((label, index) => {
    const score = aggregateDimensionScore(report, caseIds, label);
    const weakest = report.cases
      .filter((item) => selected.has(item.caseId))
      .map((item) => ({ item, dimension: item.dimensions.find((dimension) => dimension.label === label) }))
      .filter((entry): entry is { item: OptimizationEvidenceReport["cases"][number]; dimension: NonNullable<typeof entry.dimension> } => Boolean(entry.dimension))
      .sort((left, right) => left.dimension.score - right.dimension.score)[0];
    const presentation = fallback[index] || DEFAULT_EVALS[index];
    const issue = weakest?.item.failureReason || weakest?.dimension.evidence || presentation.issue || presentation.detail;
    return {
      label,
      detail: score >= 85 ? "多项真实任务表现稳定。" : score >= 60 ? "多项任务中仍有可见差距。" : "多项任务暴露出明显问题。",
      strength: score >= 85 ? "在本轮保留任务中保持了可重复表现。" : presentation.strength || "已经完成多项任务试跑。",
      issue,
      evidence: weakest ? `${weakest.item.caseId}：${weakest.dimension.evidence || weakest.item.evidence}` : "没有取得可用的逐项证据。",
      impact: presentation.impact || "这会影响这个 Skill 在真实使用中的稳定性。",
      score,
      tone: score >= 85 ? "good" as const : score >= 60 ? "warn" as const : "bad" as const,
    };
  });
}

function createOptimizationDemo(report: OptimizationEvidenceReport, caseIds: string[], targetLabel: string): SkillDemo | null {
  const selected = report.cases.filter((item) => caseIds.includes(item.caseId) && item.output.trim());
  const chosen = [...selected].sort((left, right) => {
    const leftScore = left.dimensions.find((item) => item.label === targetLabel)?.score ?? left.score;
    const rightScore = right.dimensions.find((item) => item.label === targetLabel)?.score ?? right.score;
    return leftScore - rightScore;
  })[0];
  if (!chosen) return null;
  return {
    title: `保留任务试跑 · ${chosen.caseId}`,
    scenario: "这条任务没有参与本轮修改，只用于判断候选版本是否真的变好。",
    userPrompt: chosen.prompt,
    output: chosen.output,
    appliedRules: [chosen.evidence].filter(Boolean),
    uncertainties: chosen.failureReason ? [chosen.failureReason] : [],
  };
}

function applyOptimizationEdits(currentFiles: Record<string, string>, response: OptimizationEditResponse) {
  const nextFiles = { ...currentFiles };
  const changedPaths = new Set<string>();
  // Keep the hard limit local as well as in the optimization prompt so this
  // pure transformer stays safe when reused independently in tests or tools.
  const edits = Array.isArray(response.edits) ? response.edits.slice(0, 4) : [];

  for (const rawEdit of edits) {
    if (!rawEdit || typeof rawEdit !== "object") continue;
    const edit = rawEdit as Record<string, unknown>;
    const path = typeof edit.path === "string" ? edit.path.trim() : "";
    const find = typeof edit.find === "string" ? edit.find : "";
    const replacement = typeof edit.replacement === "string" ? edit.replacement : "";
    if (!isImplementationBytePath(path) || !find || typeof nextFiles[path] !== "string") continue;
    const firstIndex = nextFiles[path].indexOf(find);
    if (firstIndex < 0 || nextFiles[path].indexOf(find, firstIndex + find.length) >= 0) {
      throw new Error(`AI 给出的“${path}”修改位置不够准确，已保留原文件，请重试优化`);
    }
    nextFiles[path] = `${nextFiles[path].slice(0, firstIndex)}${replacement}${nextFiles[path].slice(firstIndex + find.length)}`;
    changedPaths.add(path);
  }

  for (const [path, content] of Object.entries(response.createdFiles || {})) {
    if (!isImplementationBytePath(path) || typeof content !== "string" || !content.trim() || path in currentFiles) continue;
    nextFiles[path] = content;
    changedPaths.add(path);
  }

  // Keep compatibility with providers that ignore the compact-edit contract once.
  if (!changedPaths.size) {
    for (const [path, content] of Object.entries(response.updatedFiles || {})) {
      if (!isImplementationBytePath(path) || typeof content !== "string" || !content.trim() || currentFiles[path] === content) continue;
      nextFiles[path] = content;
      changedPaths.add(path);
    }
  }

  return { files: nextFiles, changedPaths: Array.from(changedPaths) };
}

function applyCanonicalCandidate(input: {
  currentFiles: Record<string, string>;
  rawMutations: unknown;
  implementationFiles?: Record<string, unknown>;
  idea: string;
  answers: Record<string, string>;
  sourceEvidence: string;
  capabilityPlan: CapabilityPlan;
  loopPlan: LoopPlan;
}) {
  const currentIR = parseCanonicalSkillIR(input.currentFiles);
  if (!currentIR) throw new Error("Canonical SkillIR 无法解析，语义修改必须先通过 P0 JSON 修复");
  const normalizedCurrentIR = ensureCanonicalBundledResources(currentIR, input.currentFiles, input.answers);
  const mutations = normalizeCanonicalMutations(input.rawMutations);
  if (!mutations.length && !Object.keys(input.implementationFiles || {}).length) throw new Error("模型没有返回 CanonicalMutation 或 implementation bytes");
  const mutated = applySkillIRMutations(normalizedCurrentIR, mutations);
  const irValidation = validateCanonicalSkillIR(mutated.ir);
  if (!irValidation.valid) throw new Error(`CanonicalMutation 未通过 IR Validator：${irValidation.issues.join("；")}`);
  const implementationFiles = Object.fromEntries(Object.entries(input.implementationFiles || {}).filter((entry): entry is [string, string] => (
    isImplementationBytePath(entry[0]) && typeof entry[1] === "string" && Boolean(entry[1].trim())
  )));
  const candidateFiles = finalizeSkillFiles(
    { ...input.currentFiles, ...implementationFiles },
    input.idea,
    input.answers,
    input.sourceEvidence,
    input.capabilityPlan,
    input.loopPlan,
    mutated.ir,
  );
  const baselineDigest = semanticSkillIRDigest(normalizedCurrentIR);
  const candidateDigest = semanticSkillIRDigest(candidateFiles);
  return {
    files: candidateFiles,
    mutations,
    changedTargets: mutated.changedTargets,
    implementationPaths: Object.keys(implementationFiles),
    baselineDigest,
    candidateDigest,
    materialDiff: baselineDigest !== candidateDigest || Object.keys(implementationFiles).some((path) => input.currentFiles[path] !== implementationFiles[path]),
  };
}

function canonicalMutationTargetCatalog(files: Record<string, string>) {
  const ir = parseCanonicalSkillIR(files);
  if (!ir) return { unavailable: true };
  return {
    semanticDigest: semanticSkillIRDigest(ir),
    requirementIds: ir.requirements.map((item) => item.id),
    taskIds: ir.tasks.map((item) => item.id),
    capabilityIds: ir.capabilities.map((item) => item.id),
    inputIds: ir.inputs.map((item) => item.id),
    outputIds: ir.outputs.map((item) => item.id),
    constraintIds: ir.constraints.map((item) => item.id),
    knowledgeIds: ir.knowledgeRequirements.map((item) => item.id),
    evalCaseIds: ir.evaluationPlan.cases.map((item) => String(item.id || "")).filter(Boolean),
    // Give the Planner the current editable values next to their IDs. This is
    // intentionally compact: it prevents update-to-the-same-value plans without
    // duplicating the entire Canonical SkillIR in the prompt.
    currentValues: {
      requirements: ir.requirements.map((item) => ({ id: item.id, statement: item.statement, hard: item.hard, provenance: item.provenance })),
      tasks: ir.tasks.map((item) => ({ id: item.id, intent: item.intent, activationCondition: item.activationCondition, requiredInputIds: item.requiredInputIds, optionalInputIds: item.optionalInputIds, outputIds: item.outputIds, capabilityIds: item.capabilityIds })),
      capabilities: ir.capabilities.map((item) => ({ id: item.id, purpose: item.purpose, requirement: item.requirement, activationCondition: item.activationCondition, routingCondition: item.routingCondition, input: item.input, output: item.output, fallback: item.fallback })),
      inputs: ir.inputs.map((item) => ({ id: item.id, name: item.name, required: item.required, missingBehavior: item.missingBehavior, resolution: item.resolution })),
      outputs: ir.outputs.map((item) => ({ id: item.id, name: item.name, mode: item.mode, requiredSections: item.requiredSections, validation: item.validation, producerCapabilityIds: item.producerCapabilityIds })),
      constraints: ir.constraints.map((item) => ({ id: item.id, statement: item.statement, hard: item.hard, provenance: item.provenance, appliesTo: item.appliesTo })),
    },
    inputAddShape: {
      id: "input-stable-id",
      concept: "semantic concept",
      name: "user-facing input name",
      required: false,
      source: "user|source|runtime",
      availableAtBuild: false,
      missingBehavior: "observable behavior when absent",
      resolution: {
        mode: "ask|infer-and-label|continue-without",
        authority: "user_explicit|user_example|source_grounded|domain_inferred|generator_default",
        allowedSources: ["explicit source identifier"],
        markProvisional: true,
        reversibleOnly: true,
        stopCondition: "condition that ends resolution",
      },
    },
  };
}

function allowedP1MutationTypes(issues: PipelineIssue[]) {
  const allMatch = (pattern: RegExp) => issues.length > 0 && issues.every((issue) => pattern.test(`${issue.type} ${issue.evidence}`));
  if (allMatch(/DESCRIPTION|触发描述|触发范围|使用场景/i)) return ["identity.update", "task.add", "task.update", "task.remove"];
  if (allMatch(/EVAL|评测|测试用例|SKILL_IR_CLOSURE.*(?:Eval|评测)/i)) return ["eval-source.add", "eval-source.update", "eval-source.remove"];
  if (allMatch(/INPUT|输入|DESCRIPTION_INPUT|RESOLUTION/i)) return ["input.add", "input.update", "input.remove", "task.update"];
  if (allMatch(/OUTPUT|ARTIFACT|PRODUCER|输出|产物/i)) return ["output.add", "output.update", "output.remove", "capability.update", "task.update"];
  if (allMatch(/STATE|PERSIST|状态|持久/i)) return ["state.update", "requirement.update", "constraint.update"];
  if (allMatch(/PERMISSION|CONTENT|权限|补写|扩写|编造/i)) return ["requirement.add", "requirement.update", "constraint.add", "constraint.update", "constraint.remove"];
  return [
    "identity.update",
    "requirement.add", "requirement.update", "requirement.remove",
    "task.add", "task.update", "task.remove",
    "capability.add", "capability.update", "capability.remove",
    "input.add", "input.update", "input.remove",
    "output.add", "output.update", "output.remove",
    "state.update",
    "constraint.add", "constraint.update", "constraint.remove",
    "knowledge.add", "knowledge.update", "knowledge.remove",
    "eval-source.add", "eval-source.update", "eval-source.remove",
  ];
}

function normalizeCapabilityPlan(value: unknown): CapabilityPlan | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.summary !== "string" || !Array.isArray(raw.items)) return null;
  const clean = (input: unknown, fallback: string, max = 320) => typeof input === "string" && input.trim() ? input.trim().slice(0, max) : fallback;
  const list = (input: unknown, fallback: string[] = [], max = 8) => Array.isArray(input)
    ? input.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim().slice(0, 240)).slice(0, max)
    : fallback;
  const allowedKinds = new Set<CapabilityKind>(["llm", "reference", "script", "asset", "builtin-tool", "mcp", "eval"]);
  const allowedStatuses = new Set<CapabilityStatus>(["generate", "use-provided", "requires-setup", "not-needed"]);
  const allowedLayers = new Set<CapabilityLayer>(["runtime", "evaluation", "build-time"]);
  const seen = new Set<string>();
  const items = raw.items.slice(0, 32).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (!allowedKinds.has(candidate.kind as CapabilityKind) || typeof candidate.name !== "string" || typeof candidate.purpose !== "string") return [];
    const kind = candidate.kind as CapabilityKind;
    const rawId = typeof candidate.id === "string" ? candidate.id.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") : "";
    const id = rawId && !seen.has(rawId) ? rawId : `${kind}-${index + 1}`;
    seen.add(id);
    let status = allowedStatuses.has(candidate.status as CapabilityStatus) ? candidate.status as CapabilityStatus : "not-needed";
    const rawConnection = candidate.connection && typeof candidate.connection === "object" ? candidate.connection as Record<string, unknown> : null;
    const connection = kind === "mcp" ? {
      server: typeof rawConnection?.server === "string" ? rawConnection.server.trim().slice(0, 120) : "",
      tools: Array.isArray(rawConnection?.tools) ? rawConnection.tools.filter((tool): tool is string => typeof tool === "string" && Boolean(tool.trim())).map((tool) => tool.trim().slice(0, 120)).slice(0, 12) : [],
      verified: rawConnection?.verified === true,
    } : undefined;
    if (kind === "eval") status = "generate";
    if (kind === "llm") status = "generate";
    const optional = (kind === "builtin-tool" || kind === "mcp") ? candidate.optional !== false : false;
    const recommended = optional && candidate.recommended === true;
    const enabled = optional
      ? recommended || candidate.enabled === true || (typeof candidate.enabled !== "boolean" && status === "use-provided")
      : true;
    if ((kind === "builtin-tool" || kind === "mcp") && status === "generate") status = "requires-setup";
    if (kind === "mcp" && status === "use-provided" && !connection?.verified) status = "requires-setup";
    const candidatePath = typeof candidate.path === "string" ? candidate.path.trim().slice(0, 160) : "";
    const path = kind === "llm" ? "SKILL.md"
      : kind === "eval" ? "evals/"
        : kind === "builtin-tool" || kind === "mcp" ? "integrations/tool-contracts.json"
          : kind === "reference" && (candidatePath.includes("..") || !/^references\/[A-Za-z0-9._/-]+\.[A-Za-z0-9]+$/.test(candidatePath)) ? `references/${id}.md`
            : kind === "script" && (candidatePath.includes("..") || !/^scripts\/[A-Za-z0-9._/-]+\.py$/.test(candidatePath)) ? `scripts/${id}.py`
              : kind === "asset" && (candidatePath.includes("..") || !/^assets\/[A-Za-z0-9._/-]+\.[A-Za-z0-9]+$/.test(candidatePath)) ? `assets/${id}.md`
              : candidatePath;
    const routingCondition = clean(candidate.routingCondition, kind === "eval" ? "构建后或行为改变后" : "当该能力是完成当前任务的必要步骤时", 240);
    const scope = ["global", "task-specific", "conditional", "optional"].includes(String(candidate.scope))
      ? candidate.scope as CapabilityScope
      : normalizeCapabilityScope({ kind, status, enabled, routingCondition, activationCondition: typeof candidate.activationCondition === "string" ? candidate.activationCondition : "" });
    const activationCondition = clean(candidate.activationCondition, scope === "global" ? "每次 Skill 运行" : routingCondition, 240);
    const affects = list(candidate.affects, kind === "builtin-tool" || kind === "mcp" ? ["tool-routing"] : kind === "eval" ? ["evaluation"] : ["runtime-workflow"], 8);
    const mustNotAffect = list(candidate.mustNotAffect, scope === "conditional" || scope === "optional" ? ["default-output-contract", "unrelated-evals"] : [], 8)
      .filter((boundary) => !affects.includes(boundary));
    return [{
      id,
      kind,
      name: candidate.name.trim().slice(0, 80),
      path,
      layer: allowedLayers.has(candidate.layer as CapabilityLayer)
        ? candidate.layer as CapabilityLayer
        : kind === "eval" ? "evaluation" : "runtime",
      requirement: clean(candidate.requirement, candidate.purpose, 280),
      purpose: candidate.purpose.trim().slice(0, 280),
      reason: typeof candidate.reason === "string" ? candidate.reason.trim().slice(0, 280) : "由 AI 根据任务复杂度判断",
      status,
      input: typeof candidate.input === "string" ? candidate.input.trim().slice(0, 240) : "",
      output: typeof candidate.output === "string" ? candidate.output.trim().slice(0, 240) : "",
      fallback: typeof candidate.fallback === "string" ? candidate.fallback.trim().slice(0, 240) : "停下并说明缺少能力",
      routingCondition,
      deterministicAdvantage: clean(candidate.deterministicAdvantage, kind === "script" ? "需要模型明确说明脚本相对大模型的稳定性收益" : "无；该能力不依赖确定性代码", 280),
      evaluationCriteria: list(candidate.evaluationCriteria, [clean(candidate.output, "产生可观察结果", 180)], 6),
      scope,
      activationCondition,
      affects,
      mustNotAffect,
      connection,
      optional,
      enabled,
      recommended,
    }];
  });
  if (!items.some((item) => item.kind === "llm")) items.unshift({ ...DEFAULT_CAPABILITY_PLAN.items[0], reason: "规划结果遗漏了语义核心，系统已将需要上下文判断的工作明确归还大模型" });
  if (!items.some((item) => item.kind === "eval")) items.push({ ...DEFAULT_CAPABILITY_PLAN.items.find((item) => item.kind === "eval")!, reason: "系统补上发布所需的领域回归验证，但不会因此生成额外运行时文件" });

  const rawOutcome = raw.outcomeModel && typeof raw.outcomeModel === "object" ? raw.outcomeModel as Record<string, unknown> : {};
  const rawState = raw.stateModel && typeof raw.stateModel === "object" ? raw.stateModel as Record<string, unknown> : {};
  const rawOutput = raw.outputContract && typeof raw.outputContract === "object" ? raw.outputContract as Record<string, unknown> : {};
  const stateNeeded = rawState.needed === true;
  const stateScope = stateNeeded && (rawState.scope === "session" || rawState.scope === "persistent") ? rawState.scope : "none";
  const fields = Array.isArray(rawState.fields) ? rawState.fields.slice(0, 12).flatMap((field) => {
    if (!field || typeof field !== "object") return [];
    const candidate = field as Record<string, unknown>;
    if (typeof candidate.name !== "string" || !candidate.name.trim()) return [];
    const source = ["explicit", "user-claim", "inference", "hypothesis", "unknown"].includes(String(candidate.source))
      ? candidate.source as StateField["source"] : "unknown";
    return [{ name: candidate.name.trim().slice(0, 80), purpose: clean(candidate.purpose, "支持后续决策", 200), source, updateRule: clean(candidate.updateRule, "只在用户明确提供或确认后更新", 220) }];
  }) : [];
  const riskBranches = Array.isArray(raw.riskBranches) ? raw.riskBranches.slice(0, 8).flatMap((branch, index) => {
    if (!branch || typeof branch !== "object") return [];
    const candidate = branch as Record<string, unknown>;
    if (typeof candidate.condition !== "string" || typeof candidate.action !== "string") return [];
    return [{ id: clean(candidate.id, `risk-${index + 1}`, 80).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || `risk-${index + 1}`, condition: candidate.condition.trim().slice(0, 240), action: candidate.action.trim().slice(0, 280), stopOrRedirect: clean(candidate.stopOrRedirect, "无法安全继续时停止并说明原因", 240) }];
  }) : [];
  const outputMode = ["human", "machine", "artifact", "mixed"].includes(String(rawOutput.mode)) ? rawOutput.mode as OutputContract["mode"] : "human";
  return {
    summary: raw.summary.trim().slice(0, 600),
    outcomeModel: {
      ultimateGoal: clean(rawOutcome.ultimateGoal, DEFAULT_CAPABILITY_PLAN.outcomeModel.ultimateGoal, 500),
      controllableOutcomes: list(rawOutcome.controllableOutcomes, DEFAULT_CAPABILITY_PLAN.outcomeModel.controllableOutcomes, 8),
      uncontrollableOutcomes: list(rawOutcome.uncontrollableOutcomes, [], 8),
      observableIndicators: list(rawOutcome.observableIndicators, DEFAULT_CAPABILITY_PLAN.outcomeModel.observableIndicators, 10),
    },
    stateModel: {
      needed: stateNeeded,
      scope: stateScope,
      reason: clean(rawState.reason, stateNeeded ? "任务需要跨步骤状态" : "任务可在一次会话内完成", 320),
      fields: stateNeeded ? fields : [],
      expiry: clean(rawState.expiry, stateNeeded ? "由任务周期或用户指令决定" : "任务完成后不保留", 200),
      correction: clean(rawState.correction, "用户明确更正优先，并重算受影响结论", 220),
      missingBehavior: clean(rawState.missingBehavior, "标出缺失状态，不把未知当作事实", 220),
      privacyBoundary: clean(rawState.privacyBoundary, "只保留完成任务必需字段", 240),
    },
    outputContract: {
      mode: outputMode,
      format: clean(rawOutput.format, "面向用户的可直接使用结果", 240),
      requiredSections: list(rawOutput.requiredSections, ["核心结果"], 10),
      artifactPatterns: list(rawOutput.artifactPatterns, [], 10),
      validation: list(rawOutput.validation, ["核心结果真实存在并覆盖任务"], 10),
    },
    riskBranches: riskBranches.length ? riskBranches : DEFAULT_CAPABILITY_PLAN.riskBranches,
    failureModes: list(raw.failureModes, DEFAULT_CAPABILITY_PLAN.failureModes, 10),
    items,
  };
}

function reconcileCapabilityPlanContentPermission(plan: CapabilityPlan, answers: Record<string, string>): CapabilityPlan {
  const permission = resolveContentPermission(answers);
  if (permission.explicitRestriction) return plan;
  const reconcile = (value: string) => reconcileContentPermissionText(value, permission).trim();
  const reconcileList = (values: string[]) => Array.from(new Set(values.map(reconcile).filter(Boolean)));
  const fallbackFailureModes = DEFAULT_CAPABILITY_PLAN.failureModes.filter((item) => !hasContentPermissionConflict(item, permission));
  const failureModes = reconcileList(plan.failureModes).filter((item) => !hasContentPermissionConflict(item, permission));
  return {
    ...plan,
    summary: reconcile(plan.summary) || "按用户确认的目标、内容权限和交付要求组织能力",
    outcomeModel: {
      ultimateGoal: reconcile(plan.outcomeModel.ultimateGoal) || "完成用户确认的核心任务",
      controllableOutcomes: reconcileList(plan.outcomeModel.controllableOutcomes),
      uncontrollableOutcomes: reconcileList(plan.outcomeModel.uncontrollableOutcomes),
      observableIndicators: reconcileList(plan.outcomeModel.observableIndicators),
    },
    stateModel: Object.fromEntries(Object.entries(plan.stateModel).map(([key, value]) => [
      key,
      typeof value === "string" ? reconcile(value) : Array.isArray(value) ? reconcileList(value.map(String)) : value,
    ])),
    outputContract: {
      ...plan.outputContract,
      format: reconcile(plan.outputContract.format) || "面向用户的可直接使用结果",
      requiredSections: reconcileList(plan.outputContract.requiredSections),
      validation: reconcileList(plan.outputContract.validation),
    },
    riskBranches: plan.riskBranches.flatMap((branch) => {
      const condition = reconcile(branch.condition);
      const action = reconcile(branch.action);
      const stopOrRedirect = reconcile(branch.stopOrRedirect);
      return condition && action ? [{ ...branch, condition, action, stopOrRedirect }] : [];
    }),
    failureModes: failureModes.length ? failureModes : fallbackFailureModes,
    items: plan.items.map((item) => {
      if (item.kind === "builtin-tool" || item.kind === "mcp") return item;
      const requirement = reconcile(item.requirement);
      const purpose = reconcile(item.purpose);
      const output = reconcile(item.output);
      const evaluationCriteria = reconcileList(item.evaluationCriteria);
      return {
        ...item,
        requirement: requirement || "落实用户确认的任务要求与内容权限",
        purpose: purpose || "完成当前任务中由该能力负责的步骤",
        reason: reconcile(item.reason) || "该能力直接支持已确认的任务结果",
        input: reconcile(item.input),
        output: output || "产生符合用户确认权限的可观察结果",
        fallback: reconcile(item.fallback) || "说明当前能力不可用，并保留仍可完成的部分",
        routingCondition: reconcile(item.routingCondition) || "当当前任务需要该能力时",
        deterministicAdvantage: reconcile(item.deterministicAdvantage) || "无额外确定性收益",
        evaluationCriteria: evaluationCriteria.length ? evaluationCriteria : ["遵循用户确认的任务目标与内容改动权限"],
      };
    }),
  };
}

function ensureTaskCapabilities(plan: CapabilityPlan, idea: string, answers: Record<string, string>) {
  plan = reconcileCapabilityPlanContentPermission(plan, answers);
  const taskEvidence = [
    idea,
    answers.inputs,
    answers.workflow,
    answers["output-format"],
    answers["good-example"],
    answers["preference-reuse"],
  ].filter(Boolean).join("；");
  const structuredInput = /csv|excel|xlsx|表格|数据表|数据集|批量|一批|多条数据/i.test(taskEvidence);
  const deterministicWork = /计算|公式|排序|排名|筛选|去重|清洗|转换|汇总|统计|校验|验证|导出/i.test(taskEvidence);
  const nonObviousKnowledgeSignal = /官方|规范|标准|政策|法律|合规|专业术语|字段定义|平台规则|行业规则|决策树|边界案例|反例|失败模式|schema|api/i.test(taskEvidence);
  const reusableOutputEvidence = [answers["output-format"], answers["preference-reuse"], plan.outputContract.format].filter(Boolean).join("；");
  const reusableArtifact = reusableOutputAssetRequested(reusableOutputEvidence);
  const outputRequest = [idea, answers["output-format"], plan.outputContract.format].filter(Boolean).join("；");
  const userRequiresArtifact = artifactDeliveryRequested(outputRequest);
  let items = plan.items.map((item) => item.kind === "script" && /(?:LLM|大模型|模型).{0,12}(?:手动)?(?:计算|处理|生成)|手动计算/i.test(item.fallback)
    ? {
      ...item,
      fallback: "脚本不可运行时停止依赖该脚本的批量或确定性步骤，说明缺少的运行条件，并提供可复核的字段、公式和手工处理说明；不得声称已完成计算或文件生成",
    }
    : item);
  const explicitAssetNeed = reusableArtifact || /品牌资产|素材包|logo|字体文件|图片素材|provided asset/i.test(taskEvidence);
  const requestedAssetExtensions = new Set(inferArtifactPatterns(`${answers["output-format"] || ""}；${plan.outputContract.format}`)
    .flatMap((pattern) => pattern.toLowerCase().match(/\.(?:pdf|docx?|pptx?|xlsx?|csv|json|html?|md|png|jpe?g)\b/g) || []));
  items = items.filter((item) => {
    if (item.kind !== "asset") return true;
    const extension = item.path.toLowerCase().match(/\.(?:pdf|docx?|pptx?|xlsx?|csv|json|html?|md|png|jpe?g)$/)?.[0] || "";
    const matchesRequestedFormat = !extension || requestedAssetExtensions.has(extension);
    return (reusableArtifact || explicitAssetNeed) && matchesRequestedFormat;
  });

  if (nonObviousKnowledgeSignal && !items.some((item) => item.kind === "reference" && capabilityIsActive(item)) && idea.trim() && !/^(?:完成当前任务|当前任务)$/i.test(idea.trim())) {
    items.splice(Math.max(1, items.findIndex((item) => item.kind === "eval")), 0, {
      id: "domain-decision-playbook",
      kind: "reference",
      name: "领域决策与反例手册",
      path: "references/domain-playbook.md",
      layer: "runtime",
      requirement: `补充完成“${compactTaskPhrase(idea)}”时裸模型不容易稳定掌握的领域判断、任务分支与典型反例`,
      purpose: "提供会真正改变模型取舍的领域知识，而不是重复清晰、专业、自然等通用建议",
      reason: "需求明确包含规范、术语、平台规则或边界知识；这些非显而易见内容适合按需加载",
      status: "generate",
      input: "当前任务类型、用户确认的正反例、来源资料和已确认偏好",
      output: "包含任务意图分支、领域判断规则、边界案例、失败模式和反例的运行时参考",
      fallback: "资料不足时只保留可由现有证据支持的规则，并把待确认判断显式标记为未知",
      routingCondition: "当前请求需要判断具体任务分支、平台惯例、领域边界或失败模式时",
      deterministicAdvantage: "无；该文件提供按需加载的领域知识，不替代上下文推理",
      evaluationCriteria: ["至少包含会改变决策的领域规则与反例", "每条规则说明适用条件而非强制套用", "不以易测的格式代理替代真实任务质量"],
      scope: "task-specific",
      activationCondition: "当前任务进入具体领域判断或质量取舍时",
      affects: ["runtime-workflow", "domain-quality"],
      mustNotAffect: ["unrelated-evals"],
      optional: false,
      enabled: true,
      recommended: false,
    });
  }

  if (structuredInput && deterministicWork && !items.some((item) => item.kind === "script" && capabilityIsActive(item))) {
    items.splice(Math.max(1, items.findIndex((item) => item.kind === "eval")), 0, {
      id: "deterministic-data-processing",
      kind: "script",
      name: "确定性数据计算与校验",
      path: "scripts/process-structured-data.py",
      layer: "runtime",
      requirement: "批量读取结构化数据，稳定执行计算、排序、缺失值处理与格式校验",
      purpose: "把重复、容易算错且需要一致复现的数据步骤交给可执行代码",
      reason: "公式、排序和字段校验由脚本执行比大模型逐行心算更稳定，也便于独立测试",
      status: "generate",
      input: "UTF-8 CSV 文件与用户确认的字段映射、公式和筛选参数",
      output: "UTF-8 CSV 结果、明确的错误信息和可追溯的原始行号",
      fallback: "无法运行脚本时停止批量计算，给出所需字段与手工处理说明，不伪装成已完成计算",
      routingCondition: "输入包含多条结构化记录，且任务需要计算、排序、筛选或校验时",
      deterministicAdvantage: "同一输入得到同一结果，可检查退出状态，并能用边界与异常用例回归验证",
      evaluationCriteria: ["正常数据计算正确", "缺失与异常输入产生确定结果", "空文件和错误字段不会静默成功"],
    });
  }

  if (reusableArtifact && !items.some((item) => item.kind === "asset" && capabilityIsActive(item))) {
    items.splice(Math.max(1, items.findIndex((item) => item.kind === "eval")), 0, {
      id: "reusable-output-template",
      kind: "asset",
      name: "可复用交付模板",
      path: "assets/output-template.csv",
      layer: "runtime",
      requirement: "让已确认的字段与交付格式能够在后续任务中重复使用并按需调整",
      purpose: "作为 Agent 每次复制、填充和导出的真实表格模板",
      reason: "稳定的交付结构适合放在可直接填充的资产中，而不是每次让模型重新猜字段",
      status: "generate",
      input: "用户确认的输出字段与模板复用方式",
      output: "UTF-8 CSV 表头与一行不含个人信息的说明性占位示例",
      fallback: "资产缺失时按输出契约现场生成表头，并明确本次未使用模板",
      routingCondition: "用户要求生成清单、CSV 或 Excel，并希望保存为可调整模板时",
      deterministicAdvantage: "固定字段顺序与列名，减少不同轮次结构漂移",
      evaluationCriteria: ["模板包含所有必需字段", "SKILL.md 明确何时复制或填充模板"],
    });
  }

  // Cross-layer semantic compiler: an explicit file delivery contract must
  // have one real runtime owner. The LLM owns content; the host workspace
  // capability owns creating and returning the file. This is compiler-owned
  // plumbing and must never be delegated to the user as a release fix.
  const requestedArtifactPatterns = userRequiresArtifact
    ? inferArtifactPatterns(outputRequest)
    : [];
  const artifactFallback = CAPABILITY_LIBRARY.find((item) => item.id === "host-file-workspace");
  if (artifactFallback) items = reconcileArtifactProducerCapabilities({
    capabilities: items,
    fallback: artifactFallback,
    artifactPatterns: requestedArtifactPatterns,
    requiresArtifact: userRequiresArtifact,
  });

  // Capability Necessity Gate: resources are not résumé decorations. Keep
  // scripts only for deterministic work, assets only for real reusable output,
  // and external capabilities only when the plan names a real dependency.
  items = items
    .map((item) => ({ ...item, necessity: capabilityNecessity(item) }))
    .filter((item) => item.necessity.decision !== "exclude");

  const artifactPatterns = userRequiresArtifact
    ? inferArtifactPatterns(outputRequest)
    : [];
  if (structuredInput && /csv|表格|清单/i.test(taskEvidence) && !artifactPatterns.some((pattern) => /csv/i.test(pattern))) artifactPatterns.push("outputs/*.csv");
  const outputEvidence = [
    answers["output-format"],
    plan.outputContract.format,
    ...plan.outputContract.requiredSections,
    ...items.filter((item) => capabilityIsActive(item)).map((item) => item.output),
  ].filter(Boolean).join("；");
  const globalArtifactOwner = items.some((item) => capabilityIsActive(item)
    && capabilityOwnsArtifacts(item)
    && ["global", "task-specific"].includes(item.scope || normalizeCapabilityScope(item)));
  const requiresArtifact = userRequiresArtifact || globalArtifactOwner;
  const reconciledOutput = requiresArtifact
    ? reconcileArtifactOutputContract({ mode: plan.outputContract.mode, artifactPatterns, description: outputEvidence, requiresArtifact: true })
    : { mode: plan.outputContract.mode === "machine" ? "machine" as const : "human" as const, artifactPatterns: [] };
  const hasPersistentProvider = items.some((item) => capabilityIsActive(item) && (item.id === "host-persistent-memory" || /memory|state-store|persistent-profile|长期记忆|状态存储/i.test(`${item.id} ${item.name} ${item.purpose}`)));
  const stateModel = plan.stateModel.scope === "persistent" && !hasPersistentProvider
    ? {
      ...plan.stateModel,
      scope: "session" as const,
      reason: `${plan.stateModel.reason} 当前没有已验证的持久状态提供方，因此只在本次会话内复用。`,
      expiry: "当前会话结束即失效",
      missingBehavior: "新会话中请用户重新提供必要偏好；不得声称已自动恢复历史状态",
    }
    : plan.stateModel;
  const validationShouldBeVisible = /(?:输出|交付|结果).{0,24}(?:自检|评分|检查报告|风险清单)|(?:自检|评分|检查报告).{0,24}(?:展示|输出|交付)/i.test(Object.values(answers).join("\n"));
  const visibleRequiredSections = validationShouldBeVisible
    ? plan.outputContract.requiredSections
    : plan.outputContract.requiredSections.filter((item) => !/自检|评分|检查报告|风险清单|validation|score/i.test(item));
  const csvFields = confirmedOutputFields(answers["output-format"] || "", "CSV");
  const canonicalCsvSchema = csvFields.length ? `CSV 精确列名及顺序：${csvFields.join("、")}` : "";
  const requiredSections = canonicalCsvSchema
    ? [...visibleRequiredSections.filter((item) => !/(?:CSV|逗号分隔).{0,24}(?:字段|列名|包含|包括)/i.test(item)), canonicalCsvSchema]
    : visibleRequiredSections;
  const scriptInputMappingClause = "运行前将用户可见列映射为脚本文档声明的机器字段，缺少或歧义字段必须显式报错";
  const scriptOutputMappingClause = `导出前恢复用户确认的列名和顺序（${csvFields.join("、")}）`;
  const schemaAlignedItems = canonicalCsvSchema ? items.map((item) => item.kind === "script" && capabilityIsActive(item)
    ? {
      ...item,
      input: `${item.input.replace(/；运行前将用户可见列映射为脚本文档声明的机器字段，缺少或(?:歧义字段必须显式报错)?/g, "").replace(/；+$/g, "")}；${scriptInputMappingClause}`,
      output: `${item.output.replace(/；导出前恢复用户[^；]*/g, "").replace(/；+$/g, "")}；${scriptOutputMappingClause}`,
      evaluationCriteria: Array.from(new Set([...item.evaluationCriteria, "人类可读列名与脚本机器字段可双向映射", `最终 CSV 严格使用确认列名及顺序：${csvFields.join("、")}`])),
    }
    : item) : items;
  return {
    ...plan,
    stateModel,
    summary: items.length > plan.items.length
      ? `${plan.summary} 系统已把确定性计算和可复用交付物补到真实脚本或资产中，避免只写在说明里。`
      : plan.summary,
    outputContract: {
      ...plan.outputContract,
      mode: reconciledOutput.mode,
      format: canonicalCsvSchema && !plan.outputContract.format.includes(canonicalCsvSchema)
        ? `${plan.outputContract.format}；${canonicalCsvSchema}`
        : plan.outputContract.format,
      artifactPatterns: reconciledOutput.artifactPatterns,
      requiredSections: requiredSections.length ? requiredSections : ["核心结果"],
    },
    items: schemaAlignedItems,
  };
}

function stripCompiledKnowledgeSummary(summary: string) {
  return summary
    .replace(/\s*已将\s*[^。]*?来源知识[^。]*?按需加载[^。]*?专业判断手册。?/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizedCompiledKnowledgeSummary(summary: string, domain?: string) {
  const baseSummary = stripCompiledKnowledgeSummary(summary);
  if (domain === undefined) return baseSummary;
  return `${baseSummary}${baseSummary && !/[。.!！?？]$/.test(baseSummary) ? "。" : ""} 在需要${domain || "领域"}判断时，按条件使用来源可追溯的专业知识。`.trim();
}

function PlatformMark({ name }: { name: string }) {
  const sources: Record<string, string> = {
    Codex: "https://unpkg.com/@lobehub/icons-static-svg@1.94.0/icons/codex.svg",
    "Claude Code": "https://cdn.simpleicons.org/claude",
    Cursor: "https://cdn.simpleicons.org/cursor",
    "GitHub Copilot": "https://cdn.simpleicons.org/githubcopilot",
    "Gemini CLI": "https://cdn.simpleicons.org/googlegemini",
    "通用 SKILL.md": "https://cdn.simpleicons.org/markdown",
  };
  return <img src={sources[name]} alt="" aria-hidden="true" />;
}

function attachCompiledKnowledgeCapability(plan: CapabilityPlan, pack: KnowledgePack) {
  const baseSummary = stripCompiledKnowledgeSummary(plan.summary);
  if (!knowledgePackIsPublishable(pack)) {
    return {
      ...plan,
      summary: baseSummary,
      items: plan.items.map((item) => item.path === "references/domain-playbook.md"
        ? { ...item, status: "not-needed", enabled: false }
        : item),
    };
  }
  const knowledgeItem: CapabilityItem = {
    id: "domain-decision-playbook",
    kind: "reference",
    name: `${pack.plan.domain || "领域"}专业知识手册`,
    path: "references/domain-playbook.md",
    layer: "runtime",
    requirement: "在具体任务中只使用与当前条件匹配且达到相应证据门槛的专业知识；参考洞察先核对，不升级为硬约束",
    purpose: "让 Skill 在裸模型常识之外执行来源可追溯的领域流程与判断，而不是只套用通用 Prompt",
    reason: "该手册包含会改变任务判断且保留来源边界的专业知识",
    status: "generate",
    input: "当前任务条件、用户材料和需要作出的领域判断",
    output: "与当前条件匹配的专业动作、例外处理和可观察验证",
    fallback: "没有匹配规则或来源已过期时，明确说明知识边界并请求最少必要资料；不得用模型直觉补成硬规则",
    routingCondition: "当前任务进入专业判断、领域分支、例外、失败恢复或验证步骤时",
    deterministicAdvantage: "无；该资源提供来源可追溯的专业知识，按条件约束大模型推理",
    evaluationCriteria: ["只在适用条件成立时使用对应规则", "专业动作能够追溯到来源", "例外和来源冲突不会被隐藏"],
    scope: "conditional",
    activationCondition: "任务需要领域判断、专业流程、例外处理或来源核验时",
    affects: ["runtime-workflow", "domain-quality", "grounding-evals"],
    mustNotAffect: ["user-confirmed-preferences", "unrelated-evals", "default-output-contract"],
    optional: false,
    enabled: true,
    recommended: false,
    necessity: {
      successLift: "high",
      bareModelReliable: false,
      deterministicNeed: false,
      realResourceAvailable: true,
      externalDependency: false,
      decision: "include",
    },
  };
  const items = plan.items.some((item) => item.id === knowledgeItem.id)
    ? plan.items.map((item) => item.id === knowledgeItem.id ? knowledgeItem : item)
    : [...plan.items.filter((item) => item.path !== knowledgeItem.path), knowledgeItem];
  return {
    ...plan,
    summary: normalizedCompiledKnowledgeSummary(baseSummary, pack.plan.domain || "当前领域"),
    items,
  };
}

function isSafeSkillFilePath(path: string) {
  return path === "SKILL.md"
    || (/^(?:agents|references|evals|scripts|assets|integrations)\/[A-Za-z0-9._/-]+$/.test(path) && !path.includes("..") && !path.includes("//"));
}

async function validateBundle(files: Record<string, string>): Promise<BundleStaticValidation> {
  let lastValidatorError = "";
  const requestValidation = async () => {
    const response = await fetch("/api/validate-bundle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = await response.json() as BundleStaticValidation;
    if (!Array.isArray(parsed.issues) || !Array.isArray(parsed.checks) || typeof parsed.valid !== "boolean" || typeof parsed.executionReady !== "boolean" || typeof parsed.contractReady !== "boolean") throw new Error("invalid validator response");
    return parsed;
  };
  try {
    let parsed: BundleStaticValidation | null = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt += 1) {
      try {
        parsed = await requestValidation();
      } catch (error) {
        lastValidatorError = error instanceof Error ? error.message : "validator network error";
        if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 320));
      }
    }
    if (!parsed) throw new Error(lastValidatorError || "validator unavailable");
    const scriptTestPaths = Object.keys(files).filter((path) => path.startsWith("evals/script-tests/") && path.endsWith(".py"));
    const hasScriptTests = scriptTestPaths.length > 0;
    if (!hasScriptTests) return parsed;
    try {
      const scriptTests = await verifyBundleScriptTests({ skillFiles: files });
      const executed = scriptTests.status === "executed";
      const passed = executed && scriptTests.passed === true;
      if (executed && !passed) {
        const detail = (scriptTests.detail || "脚本测试失败").replace(/[\r\n]+/g, " ").slice(-420);
        const issue: BundleStaticIssue = { ...classifyBundleIssue("PYTHON_TEST_FAILURE"), code: "PYTHON_TEST_FAILURE", path: scriptTestPaths[0] || "evals/script-tests/", message: `生成脚本没有通过本地受限进程测试：${detail}` };
        return { ...parsed, valid: false, executionReady: false, issues: [...parsed.issues, issue], checks: [...parsed.checks, { id: "script-tests", label: "生成脚本独立测试", passed: false }] };
      }
      return { ...parsed, checks: [...parsed.checks, { id: "script-tests", label: "生成脚本独立测试", passed: passed || !executed }] };
    } catch {
      // Browser-only or hosted environments may not expose the local process
      // adapter. Do not pretend tests ran; Optimization will likewise exclude
      // this deterministic capability from model-simulated scoring.
      return { ...parsed, checks: [...parsed.checks, { id: "script-tests", label: "生成脚本独立测试（本地适配器未连接）", passed: true }] };
    }
  } catch (error) {
    lastValidatorError = lastValidatorError || (error instanceof Error ? error.message : "validator unavailable");
    const fallback = validateBundleStructure(files);
    const compilerIssue: BundleStaticIssue = {
      ...classifyBundleIssue("STATIC_VALIDATOR_UNAVAILABLE"),
      code: "STATIC_VALIDATOR_UNAVAILABLE",
      path: "",
      message: `P0 Execution Gate 暂时不可用，已阻止进入契约修复和 Eval（${lastValidatorError.slice(0, 80)}）`,
    };
    return { ...fallback, valid: false, executionReady: false, issues: [...fallback.issues, compilerIssue], checks: [...fallback.checks, { id: "syntax", label: "Python 与 shell 语法", passed: false }] };
  }
}

function bundleIssuesToPipelineIssues(issues: BundleStaticIssue[]): PipelineIssue[] {
  return issues.map((issue, index) => ({
    id: `deterministic-${issue.code.toLowerCase()}-${index + 1}`,
    priority: issue.priority,
    type: issue.category,
    source: "static" as const,
    evidence: `[${issue.code}] ${issue.message}`,
    files: issue.path ? [issue.path] : [],
  }));
}

function normalizeSourceInsight(raw: unknown, fallbackName: string): SourceInsight | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const list = (key: string, max: number) => Array.isArray(value[key])
    ? (value[key] as unknown[]).filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim().slice(0, 180)).slice(0, max)
    : [];
  const allowedRoles = new Set<SourceInsight["role"]>(["ideal-output", "negative-example", "source-material", "background"]);
  const role = allowedRoles.has(value.likelyRole as SourceInsight["role"])
    ? value.likelyRole as SourceInsight["role"]
    : "source-material";
  const summary = typeof value.summary === "string" ? value.summary.trim().slice(0, 300) : "";
  const traits = list("observableTraits", 6);
  if (!summary || !traits.length) return null;
  return {
    sourceName: typeof value.sourceName === "string" && value.sourceName.trim() ? value.sourceName.trim().slice(0, 120) : fallbackName,
    documentType: typeof value.documentType === "string" ? value.documentType.trim().slice(0, 80) : "上传资料",
    role,
    roleLabel: typeof value.roleLabel === "string" ? value.roleLabel.trim().slice(0, 40) : role === "ideal-output" ? "理想产出示例" : "任务资料",
    roleReason: typeof value.roleReason === "string" ? value.roleReason.trim().slice(0, 240) : "根据当前目标与资料内容作出的工作判断",
    summary,
    observableTraits: traits,
    questionInfluence: list("questionInfluence", 4),
    evidence: list("evidence", 4),
    privacyNote: typeof value.privacyNote === "string" ? value.privacyNote.trim().slice(0, 180) : "直接标识不会进入可复用示例",
  };
}

function serializeSourceInsights(insights: SourceInsight[]) {
  return insights.map((insight) => `## ${insight.sourceName}\n- 文档类型：${insight.documentType}\n- 使用角色：${insight.roleLabel} (${insight.role})\n- 判断依据：${insight.roleReason}\n- 资料贡献：${insight.summary}\n- 可复用特征：${insight.observableTraits.join("；")}\n- 应影响的问题：${insight.questionInfluence.join("；") || "待确认"}\n- 页码证据：${insight.evidence.join("；") || "待确认"}\n- 隐私：${insight.privacyNote}`).join("\n\n");
}

function normalizeInterviewQuestions(raw: unknown, roundIndex: number, priorEvidence = "") {
  if (!Array.isArray(raw)) return [];
  const roundMeta = INTERVIEW_ROUND_META[roundIndex];
  const candidates = raw.filter((item) => {
    if (!item || typeof item !== "object") return false;
    const value = item as Partial<Question>;
    const searchable = [value.dimension, value.label, value.helper, ...(Array.isArray(value.options) ? value.options : [])].join(" ");
    return value.dimension !== "使用频率" && !/(?:多久|多频繁|使用频率|更新频率)/.test(searchable);
  });
  return roundMeta.dimensions.map((expectedDimension, index): Question | null => {
    const item = candidates.find((candidate) => (candidate as Partial<Question>).dimension === expectedDimension) || candidates[index];
    if (!item || typeof item !== "object") return null;
    const value = item as Partial<Question>;
    const label = typeof value.label === "string" ? value.label.trim().slice(0, 180) : "";
    const options = Array.isArray(value.options)
      ? Array.from(new Set(value.options.filter((option): option is string => typeof option === "string" && Boolean(option.trim())).map((option) => option.trim().slice(0, 80)))).slice(0, 4)
      : [];
    if (label.length < 4 || options.length < 3) return null;
    if (!options.some((option) => option.includes("不确定"))) options.push(UNSURE_OPTION);
    const dimension = expectedDimension;
    // Providers occasionally omit the recommendation even when the prompt
    // asks for one. The prompt requires the safest recommendation to be the
    // first option, so the normalizer can recover without losing the beginner
    // experience or guessing outside the model-proposed choices.
    const recommendedOption = typeof value.recommendedOption === "string" && options.includes(value.recommendedOption) && !optionConflictsWithPriorEvidence(value.recommendedOption, priorEvidence)
      ? value.recommendedOption
      : options.find((option) => option !== UNSURE_OPTION && !optionConflictsWithPriorEvidence(option, priorEvidence));
    return {
      id: `ai-round-${roundIndex + 1}-question-${index + 1}`,
      dimension,
      label,
      helper: typeof value.helper === "string" ? value.helper.trim().slice(0, 240) : "这个选择会影响 Skill 的具体行为。",
      placeholder: typeof value.placeholder === "string" ? value.placeholder.trim().slice(0, 180) : "补充你的具体情况",
      options,
      selectionMode: value.selectionMode === "multiple" ? "multiple" : "single",
      recommendedOption,
    };
  }).filter((item): item is Question => Boolean(item));
}

function recommendedInterviewAnswers(questions: Question[]) {
  return Object.fromEntries(questions.flatMap((question) => (
    question.recommendedOption && question.options.includes(question.recommendedOption)
      ? [[question.id, question.recommendedOption] as const]
      : []
  )));
}

function createInterviewEvidence(rounds: InterviewRound[], answers: Record<string, string>) {
  return rounds.flatMap((round) => round.questions).map((question) => ({
    dimension: question.dimension,
    question: question.label,
    answer: answers[question.id]?.trim() || "",
  })).filter((item) => item.answer);
}

function createDemoAnswers(rounds: InterviewRound[], answers: Record<string, string>) {
  const interviewQuestionIds = new Set(rounds.flatMap((round) => round.questions.map((question) => question.id)));
  // The compiler consumes one canonical key per requirement dimension. Raw
  // adaptive question ids remain UI state only; retaining both created duplicate
  // requirements, duplicate traceability edges, and inflated completion counts.
  const result = Object.fromEntries(Object.entries(answers).filter(([key]) => !interviewQuestionIds.has(key)));
  const dimensionKeys: Record<string, string> = {
    使用场景: "scenario",
    核心价值: "outcome",
    任务变化: "task-variability",
    成功标准: "good-example",
    输入信息: "inputs",
    工作流程: "workflow",
    交付形式: "output-format",
    信息策略: "evidence-policy",
    自主程度: "autonomy",
    质量标准: "style",
    失败模式: "bad-example",
    协作边界: "boundary",
    实战任务: "real-task",
    触发语言: "trigger-language",
    偏好复用: "preference-reuse",
    交付确认: "delivery-checkpoint",
  };
  rounds.flatMap((round) => round.questions).forEach((question) => {
    const key = dimensionKeys[question.dimension];
    if (key && answers[question.id]) result[key] = answers[question.id];
  });
  return result;
}

function reportClientRepairEvent(event: "repair_gate_checked" | "repair_gate_stalled" | "repair_gate_finished", details: Record<string, unknown>) {
  void fetch("/api/client-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, ...details }),
  }).catch(() => {
    // Diagnostics must never block or change the user's repair result.
  });
}

function reportClientPersonalizationCheck(details: Record<string, unknown>) {
  void fetch("/api/client-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "personalization_feedback_checked", ...details }),
  }).catch(() => {
    // Semantic diagnostics must never block a saved Skill iteration.
  });
}

function reportClientGenerationLoopEvent(
  event: "generation_loop_started" | "generation_loop_phase" | "generation_loop_candidate" | "generation_loop_finished" | "generation_loop_failed",
  details: Record<string, unknown>,
) {
  void fetch("/api/client-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, ...details }),
  }).catch(() => {
    // Loop diagnostics must never block generation or candidate rollback.
  });
}

export default function Home() {
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [step, setStep] = useState<StepId>("brief");
  const [briefSidebarOpen, setBriefSidebarOpen] = useState(false);
  const [idea, setIdea] = useState("");
  const [sourceNames, setSourceNames] = useState<string[]>([]);
  const [sourceWarnings, setSourceWarnings] = useState<string[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [sourceInsights, setSourceInsights] = useState<SourceInsight[]>([]);
  const [sourceReceipt, setSourceReceipt] = useState<SourceReceipt | null>(null);
  const [aiGenerationIssue, setAiGenerationIssue] = useState("");
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [activeContextField, setActiveContextField] = useState<ContextFieldId>("idealOutput");
  const [interviewEvidenceOpen, setInterviewEvidenceOpen] = useState(false);
  const [contextNotes, setContextNotes] = useState<ContextNotes>({ idealOutput: "", negativeOutput: "", existingPrompt: "", background: "" });
  const [interviewRounds, setInterviewRounds] = useState<InterviewRound[]>(DEFAULT_INTERVIEW_ROUNDS);
  const [interviewRoundOrigins, setInterviewRoundOrigins] = useState<RoundOrigin[]>(["template", "template", "template", "template"]);
  const [interviewRoundIndex, setInterviewRoundIndex] = useState(0);
  const [highestRoundReached, setHighestRoundReached] = useState(0);
  const [intentInterpretation, setIntentInterpretation] = useState("");
  const [discoveryPreview, setDiscoveryPreview] = useState<DiscoveryPreview | null>(null);
  const [discoveryPreviewExpanded, setDiscoveryPreviewExpanded] = useState(true);
  const [previewFeedback, setPreviewFeedback] = useState<string[]>([]);
  const [previewFeedbackCustom, setPreviewFeedbackCustom] = useState("");
  const [interviewReadiness, setInterviewReadiness] = useState<InterviewReadiness>(EMPTY_INTERVIEW_READINESS);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [autoSelectedQuestionIds, setAutoSelectedQuestionIds] = useState<Set<string>>(() => new Set());
  const [customQuestionIds, setCustomQuestionIds] = useState<Set<string>>(() => new Set());
  const [blueprint, setBlueprint] = useState<BlueprintSection[]>(DEFAULT_BLUEPRINT);
  const [capabilityPlan, setCapabilityPlan] = useState<CapabilityPlan>(DEFAULT_CAPABILITY_PLAN);
  const [loopPlan, setLoopPlan] = useState<LoopPlan>(DEFAULT_LOOP_PLAN);
  const [buildLoop, setBuildLoop] = useState<BuildLoopState>(DEFAULT_BUILD_LOOP);
  const [generationLoop, setGenerationLoop] = useState<GenerationLoopState>(DEFAULT_GENERATION_LOOP);
  const [knowledgePack, setKnowledgePack] = useState<KnowledgePack>(EMPTY_KNOWLEDGE_PACK);
  const [internalMcpEvidenceReports, setInternalMcpEvidenceReports] = useState<InternalMcpEvidenceReports>({});
  const [files, setFiles] = useState<Record<string, string>>(DEFAULT_FILES);
  const [selectedFile, setSelectedFile] = useState("SKILL.md");
  const [evals, setEvals] = useState<EvalResult[]>(DEFAULT_EVALS);
  const [evalRan, setEvalRan] = useState(false);
  const [evalDetailsOpen, setEvalDetailsOpen] = useState(false);
  const [skillDemo, setSkillDemo] = useState<SkillDemo | null>(null);
  const [demoReviewPending, setDemoReviewPending] = useState(false);
  const [demoExpanded, setDemoExpanded] = useState(true);
  const [personalizationRound, setPersonalizationRound] = useState(0);
  const [demoRunCount, setDemoRunCount] = useState(0);
  const [demoConversation, setDemoConversation] = useState<DemoChatMessage[]>([]);
  const [demoChatSequence, setDemoChatSequence] = useState(0);
  const [demoChatInput, setDemoChatInput] = useState("");
  const [demoChatBusy, setDemoChatBusy] = useState(false);
  const [demoChatError, setDemoChatError] = useState("");
  const [demoChatAttachments, setDemoChatAttachments] = useState<DemoChatAttachment[]>([]);
  const [demoChatFilesLoading, setDemoChatFilesLoading] = useState(false);
  const [demoConversationScoredTurns, setDemoConversationScoredTurns] = useState(0);
  const [demoConversationScoredReplyId, setDemoConversationScoredReplyId] = useState("");
  const [demoConversationScoreBusy, setDemoConversationScoreBusy] = useState(false);
  const demoChatFileInputRef = useRef<HTMLInputElement | null>(null);
  const [feedbackLoopSummary, setFeedbackLoopSummary] = useState("");
  const [mutationHistory, setMutationHistory] = useState<SkillMutationReceipt[]>([]);
  const [repaired, setRepaired] = useState(false);
  const [optimizationOpen, setOptimizationOpen] = useState(false);
  const [optimizationClosing, setOptimizationClosing] = useState(false);
  const [optimizationTargetIndex, setOptimizationTargetIndex] = useState<number | null>(null);
  const [optimizationStatus, setOptimizationStatus] = useState<OptimizationStatus>("idle");
  const [optimizationPlan, setOptimizationPlan] = useState<OptimizationPlan | null>(null);
  const [selectedOptimizationIds, setSelectedOptimizationIds] = useState<string[]>([]);
  const [optimizationIssue, setOptimizationIssue] = useState("");
  const [optimizationElapsed, setOptimizationElapsed] = useState(0);
  const [optimizationSession, setOptimizationSession] = useState<OptimizationSession | null>(null);
  const [rejectedOptimizations, setRejectedOptimizations] = useState<RejectedOptimization[]>([]);
  const [feedbackOptions, setFeedbackOptions] = useState<string[]>([]);
  const [feedbackReasons, setFeedbackReasons] = useState<string[]>([]);
  const [feedbackCustom, setFeedbackCustom] = useState("");
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [mcpDrafts, setMcpDrafts] = useState<Record<string, string>>({});
  const [toolLibraryOpen, setToolLibraryOpen] = useState(false);
  const [customMcpName, setCustomMcpName] = useState("");
  const [customMcpServer, setCustomMcpServer] = useState("");
  const [busyTask, setBusyTask] = useState<BusyTask | null>(null);
  const [busyClosing, setBusyClosing] = useState(false);
  const busyCloseTimer = useRef<number | null>(null);
  const autoOptimizationResumeKey = useRef("");
  const optimizationRunInFlight = useRef(false);
  const [busyPhaseIndex, setBusyPhaseIndex] = useState(0);
  const [busyElapsed, setBusyElapsed] = useState(0);
  const [busyExecutionKind, setBusyExecutionKind] = useState<BusyExecutionKind>("local");
  const [busyExecutionNote, setBusyExecutionNote] = useState("正在准备当前步骤");
  const [activeAiMode, setActiveAiMode] = useState("");
  const [retryAction, setRetryAction] = useState<RetryAction | null>(null);
  const [toast, setToast] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsClosing, setSettingsClosing] = useState(false);
  const [generationNoticeOpen, setGenerationNoticeOpen] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const loopStartedAt = useRef(0);
  const [provider, setProvider] = useState<ProviderId>("deepseek");
  const [model, setModel] = useState(PROVIDERS.deepseek.model);
  const [availableModels, setAvailableModels] = useState<string[]>(PROVIDERS.deepseek.models.map((item) => item.id));
  const [modelLoading, setModelLoading] = useState(false);
  const [baseUrl, setBaseUrl] = useState(PROVIDERS.deepseek.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [credentialStored, setCredentialStored] = useState(false);
  const [researchProvider, setResearchProvider] = useState<ResearchProviderId>("disabled");
  const [researchApiKey, setResearchApiKey] = useState("");
  const [researchCredentialStored, setResearchCredentialStored] = useState(false);
  const [researchBaseUrl, setResearchBaseUrl] = useState("");
  const [mcpConnections, setMcpConnections] = useState<McpConnectionSummary[]>([]);
  const [mcpConnectionsLoaded, setMcpConnectionsLoaded] = useState(false);
  const [mcpConnectionName, setMcpConnectionName] = useState("");
  const [mcpServerUrl, setMcpServerUrl] = useState("");
  const [mcpBearerToken, setMcpBearerToken] = useState("");
  const [mcpConnectionBusy, setMcpConnectionBusy] = useState(false);
  const [mcpConnectionIssue, setMcpConnectionIssue] = useState("");
  const [connectionState, setConnectionState] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [allowSensitiveExport, setAllowSensitiveExport] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(() => new Set());
  const currentBundleRevision = useMemo(() => skillBundleRevision(files), [files]);
  const personalizationHistory = useMemo(() => mutationHistory
    .filter((entry) => entry.source === "personalization" && entry.accepted && entry.personalization)
    .map((entry) => entry.personalization as PersonalizationHistoryEntry), [mutationHistory]);
  const optimizationHistory = useMemo(() => mutationHistory.reduce<Record<string, OptimizationHistory>>((history, entry) => {
    if (entry.source !== "optimization" || !entry.optimization) return history;
    const belongsToCurrentRevision = entry.accepted
      ? entry.candidateRevision === currentBundleRevision
      : entry.baselineRevision === currentBundleRevision;
    if (belongsToCurrentRevision) history[entry.optimization.dimension] = entry.optimization;
    return history;
  }, {}), [currentBundleRevision, mutationHistory]);

  useEffect(() => {
    if (!sessionHydrated || generationLoop.status === "running") return;
    if (!generationLoop.benchmarkRuns || !generationLoop.comparisonRevision) return;
    if (generationLoop.comparisonRevision === currentBundleRevision || generationLoop.comparisonVerdict === "not-run") return;
    /* eslint-disable react-hooks/set-state-in-effect -- Benchmark evidence is valid only for the exact immutable Bundle revision. */
    setGenerationLoop((current) => ({
      ...current,
      status: "attention",
      comparisonVerdict: "not-run",
      stopReason: "当前 Bundle 已发生变化；旧正式对照已失效，必须用原冻结场景重新验证后才能判断是否有增益",
    }));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [currentBundleRevision, generationLoop.benchmarkRuns, generationLoop.comparisonRevision, generationLoop.comparisonVerdict, generationLoop.status, sessionHydrated]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- One-time hydration intentionally restores an external browser session snapshot. */
    void (async () => {
      let legacy: Record<string, unknown> | null = null;
      try {
        const raw = window.localStorage.getItem(LEGACY_CREDENTIAL_STORAGE_KEY);
        if (raw) legacy = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        legacy = null;
      } finally {
        // Never leave API keys in Web Storage, even when migration fails. A
        // failed migration keeps them only in this tab's transient React state.
        try { window.localStorage.removeItem(LEGACY_CREDENTIAL_STORAGE_KEY); } catch { /* unavailable storage is already effectively empty */ }
      }

      if (legacy) {
        if (["deepseek", "openai", "compatible"].includes(String(legacy.provider))) setProvider(legacy.provider as ProviderId);
        if (typeof legacy.model === "string") setModel(legacy.model);
        if (typeof legacy.baseUrl === "string") setBaseUrl(legacy.baseUrl);
        if (typeof legacy.apiKey === "string") setApiKey(legacy.apiKey);
        if (["disabled", "firecrawl", "searxng"].includes(String(legacy.researchProvider))) setResearchProvider(legacy.researchProvider as ResearchProviderId);
        if (typeof legacy.researchApiKey === "string") setResearchApiKey(legacy.researchApiKey);
        if (typeof legacy.researchBaseUrl === "string") setResearchBaseUrl(legacy.researchBaseUrl);
        try {
          const migrated = await fetch("/api/credentials", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(legacy),
          });
          if (migrated.ok) {
            setCredentialStored(typeof legacy.apiKey === "string" && legacy.apiKey.trim().length > 8);
            setResearchCredentialStored(
              legacy.researchProvider === "searxng"
              || (typeof legacy.researchApiKey === "string" && legacy.researchApiKey.trim().length > 7),
            );
            setApiKey("");
            setResearchApiKey("");
          }
        } catch {
          // The credentials remain available only in transient component state,
          // so the user can retry Save without exposing them to Web Storage.
        }
      }

      try {
        const response = await fetch("/api/credentials", { headers: { Accept: "application/json" } });
        if (!response.ok) return;
        const result = await response.json() as {
          configured?: boolean;
          researchConfigured?: boolean;
          config?: Partial<{ provider: ProviderId; model: string; baseUrl: string; researchProvider: ResearchProviderId; researchBaseUrl: string }> | null;
        };
        if (result.config) {
          if (["deepseek", "openai", "compatible"].includes(String(result.config.provider))) setProvider(result.config.provider as ProviderId);
          if (typeof result.config.model === "string") setModel(result.config.model);
          if (typeof result.config.baseUrl === "string") setBaseUrl(result.config.baseUrl);
          if (["disabled", "firecrawl", "searxng"].includes(String(result.config.researchProvider))) setResearchProvider(result.config.researchProvider as ResearchProviderId);
          if (typeof result.config.researchBaseUrl === "string") setResearchBaseUrl(result.config.researchBaseUrl);
        }
        setCredentialStored(Boolean(result.configured));
        setResearchCredentialStored(Boolean(result.researchConfigured));
        if (result.configured) setApiKey("");
        if (result.researchConfigured) setResearchApiKey("");
      } catch {
        // The page still supports transient credentials if the vault is down.
      }
    })();
    try {
      const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, unknown>;
        const savedFilesSnapshot = saved.files && typeof saved.files === "object"
          ? saved.files as Record<string, string>
          : {};
        const savedLoopSnapshot = saved.generationLoop && typeof saved.generationLoop === "object"
          ? saved.generationLoop as Partial<GenerationLoopState>
          : {};
        let savedEvalVersion = "";
        try {
          savedEvalVersion = String((JSON.parse(savedFilesSnapshot["evals/evals.json"] || "{}") as { version?: unknown }).version || "");
        } catch { /* Invalid or legacy Eval bundles are migrated below. */ }
        const restoreFrozenBundleExactly = savedEvalVersion === "2.7"
          && savedLoopSnapshot.evaluationContractVersion === "2.7"
          && savedLoopSnapshot.status !== "running";
        const restoredStep = normalizeWorkflowStep(saved.step);
        if (restoredStep) setStep(restoredStep);
        if (typeof saved.idea === "string") setIdea(saved.idea);
        if (Array.isArray(saved.sourceNames)) setSourceNames(saved.sourceNames.filter((item): item is string => typeof item === "string"));
        if (Array.isArray(saved.sourceWarnings)) setSourceWarnings(saved.sourceWarnings.filter((item): item is string => typeof item === "string"));
        if (Array.isArray(saved.sourceInsights)) setSourceInsights(saved.sourceInsights as SourceInsight[]);
        if (saved.sourceReceipt && typeof saved.sourceReceipt === "object") setSourceReceipt(saved.sourceReceipt as SourceReceipt);
        if (saved.contextNotes && typeof saved.contextNotes === "object") setContextNotes(saved.contextNotes as ContextNotes);
        const restoredInterviewRounds = Array.isArray(saved.interviewRounds) && saved.interviewRounds.length === 4
          ? (saved.interviewRounds as InterviewRound[]).map((round, roundIndex) => {
            const savedQuestions = Array.isArray(round.questions)
              ? round.questions.filter((question) => question.dimension !== "使用频率" && question.id !== "frequency")
              : [];
            const defaultQuestions = DEFAULT_INTERVIEW_ROUNDS[roundIndex].questions;
            return {
              ...round,
              questions: INTERVIEW_ROUND_META[roundIndex].dimensions.map((dimension) => (
                savedQuestions.find((question) => question.dimension === dimension)
                || defaultQuestions.find((question) => question.dimension === dimension)
              )).filter((question): question is Question => Boolean(question)),
            };
          })
          : DEFAULT_INTERVIEW_ROUNDS;
        const restoredPreviewInput = saved.skillDemo && typeof saved.skillDemo === "object" && typeof (saved.skillDemo as { userPrompt?: unknown }).userPrompt === "string"
          ? String((saved.skillDemo as { userPrompt: string }).userPrompt).trim().slice(0, 4_000)
          : "";
        setInterviewRounds(restoredInterviewRounds);
        if (Array.isArray(saved.interviewRoundOrigins) && saved.interviewRoundOrigins.length === 4) setInterviewRoundOrigins(saved.interviewRoundOrigins as RoundOrigin[]);
        if (typeof saved.interviewRoundIndex === "number") setInterviewRoundIndex(Math.max(0, Math.min(3, saved.interviewRoundIndex)));
        if (typeof saved.highestRoundReached === "number") setHighestRoundReached(Math.max(0, Math.min(3, saved.highestRoundReached)));
        if (typeof saved.intentInterpretation === "string") setIntentInterpretation(saved.intentInterpretation);
        if (saved.discoveryPreview && typeof saved.discoveryPreview === "object") {
          const restoredPreview = normalizeDiscoveryPreview(saved.discoveryPreview);
          if (restoredPreview) setDiscoveryPreview(restoredPreview);
        }
        if (typeof saved.discoveryPreviewExpanded === "boolean") setDiscoveryPreviewExpanded(saved.discoveryPreviewExpanded);
        if (Array.isArray(saved.previewFeedback)) setPreviewFeedback(saved.previewFeedback.filter((item): item is string => typeof item === "string").slice(0, 5));
        if (typeof saved.previewFeedbackCustom === "string") setPreviewFeedbackCustom(saved.previewFeedbackCustom.slice(0, 500));
        if (saved.interviewReadiness && typeof saved.interviewReadiness === "object") setInterviewReadiness(normalizeInterviewReadiness(saved.interviewReadiness));
        if (saved.answers && typeof saved.answers === "object") {
          const restoredAnswers = { ...saved.answers as Record<string, string> };
          delete restoredAnswers.frequency;
          setAnswers(restoredAnswers);
        }
        if (Array.isArray(saved.customQuestionIds)) setCustomQuestionIds(new Set(saved.customQuestionIds.filter((item): item is string => typeof item === "string")));
        if (Array.isArray(saved.blueprint)) {
          const savedAnswers = saved.answers && typeof saved.answers === "object" ? Object.values(saved.answers as Record<string, string>).join("\n") : "";
          const explicitEvidence = `${typeof saved.idea === "string" ? saved.idea : ""}\n${savedAnswers}`;
          const restored = (saved.blueprint as BlueprintSection[]).map((item) => ({ ...item, content: reconcileDataMutationPolicy(item.content, savedAnswers) }));
          setBlueprint(reconcileBlueprintProvenance(restored, explicitEvidence));
        }
        if (saved.capabilityPlan && typeof saved.capabilityPlan === "object") {
          const savedAnswers = saved.answers && typeof saved.answers === "object" ? saved.answers as Record<string, string> : {};
          const savedRounds = restoredInterviewRounds;
          const restoredAnswers = { ...createDemoAnswers(savedRounds, savedAnswers), __idea: typeof saved.idea === "string" ? saved.idea : "", __previewInput: restoredPreviewInput };
          const restoredPack = saved.knowledgePack && typeof saved.knowledgePack === "object"
            ? reconcileKnowledgePackContentPermission(restoreKnowledgePack(saved.knowledgePack), restoredAnswers)
            : EMPTY_KNOWLEDGE_PACK;
          const restoredPlan = attachCompiledKnowledgeCapability(normalizeCapabilityPlan(saved.capabilityPlan) || DEFAULT_CAPABILITY_PLAN, restoredPack);
          setCapabilityPlan(ensureTaskCapabilities(restoredPlan, typeof saved.idea === "string" ? saved.idea : "", restoredAnswers));
        }
        if (saved.loopPlan && typeof saved.loopPlan === "object") setLoopPlan(saved.loopPlan as LoopPlan);
        if (saved.buildLoop && typeof saved.buildLoop === "object") setBuildLoop({ ...DEFAULT_BUILD_LOOP, ...saved.buildLoop as Partial<BuildLoopState> });
        if (saved.generationLoop && typeof saved.generationLoop === "object") {
          const savedLoop = savedLoopSnapshot;
          setGenerationLoop(restoreFrozenBundleExactly
            ? { ...DEFAULT_GENERATION_LOOP, ...saved.generationLoop as GenerationLoopState }
            : { ...DEFAULT_GENERATION_LOOP, stopReason: savedLoop.status === "running"
              ? "上一次 Loop 在页面刷新前尚未完成，未完成的中间分数与问题已丢弃；下次将从冻结评测重新运行"
              : "评测契约已升级，旧 Loop 结果已作废；下一次运行将使用当前能力分支与字段契约" });
        }
        if (saved.knowledgePack && typeof saved.knowledgePack === "object") {
          const savedAnswers = saved.answers && typeof saved.answers === "object" ? saved.answers as Record<string, string> : {};
          const restoredAnswers = { ...createDemoAnswers(restoredInterviewRounds, savedAnswers), __idea: typeof saved.idea === "string" ? saved.idea : "", __previewInput: restoredPreviewInput };
          setKnowledgePack(reconcileKnowledgePackContentPermission(restoreKnowledgePack(saved.knowledgePack), restoredAnswers));
        }
        if (saved.internalMcpEvidenceReports && typeof saved.internalMcpEvidenceReports === "object") {
          setInternalMcpEvidenceReports(saved.internalMcpEvidenceReports as InternalMcpEvidenceReports);
        }
        if (saved.files && typeof saved.files === "object") {
          const savedAnswers = saved.answers && typeof saved.answers === "object" ? saved.answers as Record<string, string> : {};
          const savedRounds = restoredInterviewRounds;
          const restoredAnswers = { ...createDemoAnswers(savedRounds, savedAnswers), __idea: typeof saved.idea === "string" ? saved.idea : "", __previewInput: restoredPreviewInput };
          const restoredPack = saved.knowledgePack && typeof saved.knowledgePack === "object"
            ? reconcileKnowledgePackContentPermission(restoreKnowledgePack(saved.knowledgePack), restoredAnswers)
            : EMPTY_KNOWLEDGE_PACK;
          const restoredPlan = attachCompiledKnowledgeCapability(normalizeCapabilityPlan(saved.capabilityPlan) || DEFAULT_CAPABILITY_PLAN, restoredPack);
          const restoredLoop = saved.loopPlan && typeof saved.loopPlan === "object" ? saved.loopPlan as LoopPlan : DEFAULT_LOOP_PLAN;
          // A completed comparison is evidence for an exact Bundle revision.
          // Re-projecting that Bundle during hydration can change compiler-owned
          // bytes and incorrectly make its own comparison look stale. Restore
          // current-format snapshots byte-for-byte; only legacy bundles migrate.
          const restoredFiles = restoreFrozenBundleExactly
            ? savedFilesSnapshot
            : finalizeSkillFiles(
              applyKnowledgePackToFiles(savedFilesSnapshot, restoredPack),
              typeof saved.idea === "string" ? saved.idea : "",
              restoredAnswers,
              Array.isArray(saved.sourceInsights) ? serializeSourceInsights(saved.sourceInsights as SourceInsight[]) : "",
              restoredPlan,
              restoredLoop,
              parseCanonicalSkillIR(savedFilesSnapshot) || undefined,
            );
          setFiles(restoredFiles);
          if (["passed", "stable"].includes((saved.generationLoop as Partial<GenerationLoopState> | undefined)?.status || "")) {
            setGenerationLoop((current) => ({ ...current, issues: removeResolvedFileObservations(current.issues, restoredFiles) }));
          }
        }
        if (typeof saved.selectedFile === "string") setSelectedFile(saved.selectedFile);
        if (Array.isArray(saved.evals)) setEvals(saved.evals as EvalResult[]);
        if (typeof saved.evalRan === "boolean") setEvalRan(saved.evalRan);
        if (saved.skillDemo && typeof saved.skillDemo === "object") setSkillDemo(saved.skillDemo as SkillDemo);
        if (typeof saved.demoReviewPending === "boolean") setDemoReviewPending(saved.demoReviewPending);
        if (typeof saved.demoExpanded === "boolean") setDemoExpanded(saved.demoExpanded);
        if (typeof saved.personalizationRound === "number") setPersonalizationRound(saved.personalizationRound);
        if (typeof saved.demoRunCount === "number") setDemoRunCount(saved.demoRunCount);
        else if (saved.skillDemo && typeof saved.skillDemo === "object") setDemoRunCount(1);
        const restoredDemoConversation = Array.isArray(saved.demoConversation)
          ? saved.demoConversation.filter((item): item is DemoChatMessage => Boolean(item) && typeof item === "object" && (item as DemoChatMessage).role !== undefined && typeof (item as DemoChatMessage).content === "string").slice(-12)
          : [];
        if (restoredDemoConversation.length) setDemoConversation(restoredDemoConversation);
        if (typeof saved.demoChatSequence === "number") setDemoChatSequence(Math.max(0, saved.demoChatSequence));
        if (typeof saved.demoConversationScoredTurns === "number") setDemoConversationScoredTurns(Math.max(0, saved.demoConversationScoredTurns));
        if (typeof saved.demoConversationScoredReplyId === "string") {
          setDemoConversationScoredReplyId(saved.demoConversationScoredReplyId);
        } else if (Number(saved.demoConversationScoredTurns) > 0) {
          const lastScoredReply = [...restoredDemoConversation].reverse().find((item) => item.role === "assistant");
          if (lastScoredReply) setDemoConversationScoredReplyId(lastScoredReply.id);
        }
        if (typeof saved.feedbackLoopSummary === "string") setFeedbackLoopSummary(saved.feedbackLoopSummary);
        if (typeof saved.repaired === "boolean") setRepaired(saved.repaired);
        if (Array.isArray(saved.mutationHistory)) {
          setMutationHistory((saved.mutationHistory as SkillMutationReceipt[]).slice(-24));
        } else {
          const restoredRevision = saved.files && typeof saved.files === "object"
            ? skillBundleRevision(saved.files as Record<string, string>)
            : "legacy-unknown";
          const legacyPersonalization = Array.isArray(saved.personalizationHistory)
            ? (saved.personalizationHistory as PersonalizationHistoryEntry[]).map((entry, index): SkillMutationReceipt => ({
              id: `legacy-personalization-${index}-${entry.id}`,
              source: "personalization",
              accepted: true,
              createdAt: 0,
              baselineRevision: "legacy-unknown",
              candidateRevision: restoredRevision,
              changedFiles: entry.changedFiles || [],
              testedCases: 0,
              evidence: ["旧版本个性化记录；没有可恢复的冻结验证证据"],
              gateReasons: [],
              regressions: [],
              personalization: entry,
            }))
            : [];
          const legacyOptimization = saved.optimizationHistory && typeof saved.optimizationHistory === "object"
            ? Object.entries(saved.optimizationHistory as Record<string, OptimizationHistory>).map(([dimension, history], index): SkillMutationReceipt => ({
              id: `legacy-optimization-${index}`,
              source: "optimization",
              accepted: history.accepted,
              createdAt: 0,
              baselineRevision: restoredRevision,
              candidateRevision: restoredRevision,
              changedFiles: history.changedFiles || [],
              testedCases: history.testedCases || 0,
              evidence: history.evidence || ["旧版本优化记录"],
              gateReasons: history.gateReasons || [],
              regressions: history.regressions || [],
              optimization: { ...history, dimension },
            }))
            : [];
          if (legacyPersonalization.length || legacyOptimization.length) setMutationHistory([...legacyPersonalization, ...legacyOptimization].slice(-24));
        }
        if (Array.isArray(saved.rejectedOptimizations)) setRejectedOptimizations(saved.rejectedOptimizations as RejectedOptimization[]);
        if (Array.isArray(saved.feedbackOptions)) setFeedbackOptions(saved.feedbackOptions.filter((item): item is string => typeof item === "string"));
        if (Array.isArray(saved.feedbackReasons)) setFeedbackReasons(saved.feedbackReasons.filter((item): item is string => typeof item === "string"));
        if (typeof saved.feedbackCustom === "string") setFeedbackCustom(saved.feedbackCustom);
        if (typeof saved.feedbackSaved === "boolean") setFeedbackSaved(saved.feedbackSaved);
        if (saved.mcpDrafts && typeof saved.mcpDrafts === "object") setMcpDrafts(saved.mcpDrafts as Record<string, string>);
        if (["deepseek", "openai", "compatible"].includes(String(saved.provider))) setProvider(saved.provider as ProviderId);
        if (typeof saved.model === "string") setModel(saved.model);
        if (Array.isArray(saved.availableModels)) setAvailableModels(saved.availableModels.filter((item): item is string => typeof item === "string"));
        if (typeof saved.baseUrl === "string") setBaseUrl(saved.baseUrl);
        if (["disabled", "firecrawl", "searxng"].includes(String(saved.researchProvider))) setResearchProvider(saved.researchProvider as ResearchProviderId);
        if (typeof saved.researchBaseUrl === "string") setResearchBaseUrl(saved.researchBaseUrl);
        if (Array.isArray(saved.platforms)) setPlatforms(saved.platforms.filter((item): item is string => typeof item === "string"));
        if (typeof saved.allowSensitiveExport === "boolean") setAllowSensitiveExport(saved.allowSensitiveExport);
        if (Array.isArray(saved.completedSteps)) setCompletedSteps(new Set(saved.completedSteps.filter((item): item is StepId => ["brief", "interview", "blueprint", "build", "evaluate", "ship"].includes(String(item)))));
      }
    } catch {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } finally {
      setSessionHydrated(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- Browser permission is external state and must be read after hydration. */
    setNotificationPermission("Notification" in window ? window.Notification.permission : "unsupported");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!sessionHydrated) return;
    try {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        step, idea, sourceNames, sourceWarnings, sourceInsights, sourceReceipt, contextNotes,
        interviewRounds, interviewRoundOrigins, interviewRoundIndex, highestRoundReached, intentInterpretation,
        discoveryPreview, discoveryPreviewExpanded, previewFeedback, previewFeedbackCustom, interviewReadiness,
        answers, customQuestionIds: [...customQuestionIds], blueprint, capabilityPlan, loopPlan, buildLoop, generationLoop, knowledgePack,
        internalMcpEvidenceReports,
        files, selectedFile, evals, evalRan, skillDemo, demoReviewPending, demoExpanded, personalizationRound, demoRunCount,
        demoConversation, demoChatSequence, demoConversationScoredTurns, demoConversationScoredReplyId,
        feedbackLoopSummary, mutationHistory, repaired, rejectedOptimizations, feedbackOptions, feedbackReasons,
        feedbackCustom, feedbackSaved, mcpDrafts, provider, model, availableModels, baseUrl,
        researchProvider, researchBaseUrl,
        connectionState, platforms, allowSensitiveExport, completedSteps: [...completedSteps],
      }));
    } catch {
      // The app remains usable if browser session storage is unavailable or full.
    }
  });

  const questions = interviewRounds[interviewRoundIndex]?.questions || [];
  const contextFilledCount = Object.values(contextNotes).filter((value) => value.trim()).length;
  const sourceInsightText = serializeSourceInsights(sourceInsights);
  const knowledgePackText = serializeKnowledgePack(knowledgePack);
  const userContextBundle = [
    contextNotes.idealOutput.trim() ? `# User-provided ideal output\n${contextNotes.idealOutput.trim().slice(0, 8_000)}` : "",
    contextNotes.negativeOutput.trim() ? `# User-provided negative output\n${contextNotes.negativeOutput.trim().slice(0, 6_000)}` : "",
    contextNotes.existingPrompt.trim() ? `# Existing Prompt, SOP, or working method\n${contextNotes.existingPrompt.trim().slice(0, 8_000)}` : "",
    contextNotes.background.trim() ? `# Background knowledge and constraints\n${contextNotes.background.trim().slice(0, 6_000)}` : "",
  ].filter(Boolean).join("\n\n").slice(0, 28_000);
  const contextBundle = [
    sourceInsightText ? `# AI source-evidence analysis\n${sourceInsightText}` : "",
    knowledgePackText ? `# Build-time professional knowledge pack\n${knowledgePackText}` : "",
    userContextBundle,
  ].filter(Boolean).join("\n\n").slice(0, 52_000);
  const currentAnsweredCount = questions.filter((question) => answers[question.id]?.trim()).length;
  const interviewEvidence = [
    ...previewFeedbackEvidence(discoveryPreview, previewFeedback, previewFeedbackCustom),
    ...createInterviewEvidence(interviewRounds, answers),
  ];
  const demoAnswers = useMemo(() => ({
    ...createDemoAnswers(interviewRounds, answers),
    __idea: idea,
    __previewTask: discoveryPreview?.userPrompt || "",
    // Prefer an input the owner has actually seen in a forward Demo. Preview
    // sampleInput is the next-best privacy-safe fixture. Preview output is a
    // legacy fallback only; Eval must never mistake an answer for task input.
    __previewInput: skillDemo?.userPrompt || discoveryPreview?.sampleInput || discoveryPreview?.output || "",
    __previewFeedback: [...previewFeedback, previewFeedbackCustom.trim()].filter(Boolean).join("；"),
  }), [answers, discoveryPreview, idea, interviewRounds, previewFeedback, previewFeedbackCustom, skillDemo]);
  const requirementCoverage = summarizeRequirementCoverage(interviewEvidence);
  const coveredDimensions = requirementCoverage.covered;
  const uncertainDimensions = requirementCoverage.uncertain;
  const coveredDimensionCount = requirementCoverage.coveredCount;
  const uncertainDimensionCount = requirementCoverage.uncertainCount;
  const ideaReady = idea.trim().length >= 2;
  const interviewReady = questions.length > 0 && currentAnsweredCount === questions.length;
  const canFinishInterviewEarly = interviewRoundIndex >= 1 && interviewReadiness.canFinish;
  const completeness = Math.min(100, Math.round(
    (ideaReady ? 15 : 0)
    + ((coveredDimensionCount - uncertainDimensionCount * 0.55) / REQUIREMENT_DIMENSIONS.length) * 85
    + Math.min(10, (sourceNames.length + contextFilledCount) * 2.5),
  ));
  const hasApiKey = apiKey.trim().length > 8 || credentialStored;
  const hasRealModel = hasApiKey;
  const researchReady = researchProvider === "firecrawl"
    ? researchApiKey.trim().length > 7 || researchCredentialStored
    : researchProvider === "searxng"
      ? /^https?:\/\//i.test(researchBaseUrl.trim())
      : false;
  const busy = busyTask !== null;
  const optimizationActive = optimizationStatus === "analyzing" || optimizationStatus === "optimizing" || optimizationStatus === "reevaluating";
  const optimizationTarget = optimizationTargetIndex === null ? null : evals[optimizationTargetIndex] || null;
  const optimizationTargetHistory = optimizationTarget ? optimizationHistory[optimizationTarget.label] : null;
  const optimizationPhaseIndex = optimizationStatus === "analyzing" ? 0 : optimizationStatus === "ready" ? 1 : optimizationStatus === "optimizing" ? 1 : optimizationStatus === "reevaluating" ? 2 : optimizationStatus === "complete" ? 3 : 0;
  const observedEvals = evals.filter((item) => item.coverage !== "not-covered");
  const strongEvals = observedEvals.filter((item) => item.score >= DEMO_SCORING_POLICY.observedGoodFloor);
  const needsWorkEvals = observedEvals.filter((item) => item.score < DEMO_SCORING_POLICY.observedGoodFloor);
  const pendingEvals = evals.filter((item) => item.coverage === "not-covered");
  const averageEvalScore = evalRan && observedEvals.length ? Math.round(observedEvals.reduce((total, item) => total + item.score, 0) / observedEvals.length) : 0;
  const evaluationHeadline = needsWorkEvals.length
    ? `这次试跑发现 ${needsWorkEvals.length} 个还能再提升的地方`
    : pendingEvals.length
      ? "这次表现符合要求，还有场景没测到"
      : "这次试跑已经达到预期";
  const evaluationSummary = needsWorkEvals.length
    ? `优先处理“${needsWorkEvals[0].label}”。其他结论会保留，不需要一次读完所有评语。`
    : pendingEvals.length
      ? `已经确认 ${strongEvals.length} 项表现，剩余 ${pendingEvals.length} 项需要换一个输入才能判断。`
      : "五项都有本轮证据，可以继续发布检查，也可以选择其中一项继续提高。";
  const busyStageIndex = busyTask
    ? Math.min(BUSY_STAGES[busyTask].stages.length - 1, busyPhaseIndex)
    : 0;
  const busyStage = busyTask ? BUSY_STAGES[busyTask].stages[busyStageIndex] : "";
  const busyElapsedLabel = busyElapsed < 60
    ? `${busyElapsed} 秒`
    : `${Math.floor(busyElapsed / 60)} 分 ${busyElapsed % 60} 秒`;
  const busyExecutionLabel = busyExecutionKind === "local"
    ? "本地确定性检查"
    : busyExecutionKind === "loop"
      ? "Loop 自动推进"
      : "模型正在生成";
  const busyStatusNote = busyExecutionKind === "local"
    ? "这一步只检查文件结构、路径和契约，通常约 1 秒完成；没有跳过模型步骤。"
    : busyExecutionKind === "loop"
      ? "上一节点已完成，Loop 正在根据真实结果自动进入下一节点，无需你点击。"
      : busyElapsed < 25
        ? `${activeAiMode ? AI_MODE_LABELS[activeAiMode] || activeAiMode : "模型任务"}正在返回真实结果；当前回答会一直保留。`
        : busyElapsed < 70
          ? "响应较慢，系统会先结束异常长输出，再自动用紧凑上下文重试当前节点。"
          : "正在执行紧凑重试；若仍失败，会保留已完成文件，并明确显示失败节点。";
  const modelChoices = Array.from(new Set([
    ...PROVIDERS[provider].models.map((item) => item.id),
    ...availableModels,
  ])).slice(0, 24);
  const bundleAudit = useMemo(() => auditSkillFiles(files, demoAnswers), [files, demoAnswers]);
  const gateOutcomes = useMemo(() => ({
    build: buildGateOutcome({
      status: buildLoop.status,
      frozen: buildLoop.frozen,
      blockers: bundleAudit.blockers,
      checks: bundleAudit.blockers.length
        ? bundleAudit.blockers
        : ["frontmatter", "yaml-json", "paths-references", "skill-ir-closure", "eval-runner-contract", "content-coherence"],
    }),
    optimization: optimizationGateOutcome({
      status: generationLoop.status,
      caseCount: generationLoop.benchmarkCases,
      repeatsPerCase: generationLoop.benchmarkRepeatsPerCase,
      benchmarkRuns: generationLoop.benchmarkRuns,
      passRate: generationLoop.passRate,
      lift: generationLoop.lift,
      contractDigest: generationLoop.contractDigest,
      blindWinner: generationLoop.blindWinner,
      issues: generationLoop.issues,
    }),
    demo: demoGateOutcome({
      demoPresent: Boolean(skillDemo?.output),
      reviewPending: demoReviewPending,
      reviewed: evalRan,
      runCount: demoRunCount,
      observedDimensions: evals.filter((item) => item.coverage !== "not-covered").length,
    }),
  }), [buildLoop, bundleAudit.blockers, demoReviewPending, demoRunCount, evalRan, evals, generationLoop, skillDemo]);
  const optimizationBlockedByBuild = generationLoop.status === "attention"
    && generationLoop.benchmarkRuns === 0
    && gateOutcomes.build.verdict !== "satisfied";
  const optimizationStableAtCeiling = generationLoop.status === "stable"
    || (generationLoop.status === "attention"
      && generationLoop.minimalityChecked
      && generationLoop.benchmarkRuns > 0
      && generationLoop.baselineScore === 100
      && generationLoop.bestScore === 100
      && generationLoop.passRate === 100
      && generationLoop.closureScore === 100);
  const optimizationCompletedWithRollback = generationLoop.status === "attention"
    && generationLoop.minimalityChecked
    && generationLoop.benchmarkRuns > 0
    && !optimizationStableAtCeiling;
  const selectedFileExplanation = useMemo(() => explainSkillFile(selectedFile, files[selectedFile] || "", files), [files, selectedFile]);
  const personalizedFeedbackOptions = evalRan
    ? feedbackOptions
    : createPersonalizedFeedbackOptions(demoAnswers, sourceNames.length > 0);
  const optionalToolCapabilities = capabilityPlan.items.filter((item) => item.optional && (item.kind === "builtin-tool" || item.kind === "mcp"));
  const coreCapabilities = capabilityPlan.items.filter((item) => !item.optional || (item.kind !== "builtin-tool" && item.kind !== "mcp"));
  const unresolvedMcpCount = capabilityPlan.items.filter((item) => capabilityIsActive(item) && item.kind === "mcp" && item.status === "requires-setup").length;
  const selectedCatalogCapabilityCount = CAPABILITY_LIBRARY.filter((libraryItem) => capabilityPlan.items.some((item) => item.id === libraryItem.id && capabilityIsActive(item))).length;
  const thinkingWords = busyTask ? createContextualThinkingWords({
    task: busyTask,
    idea,
    stage: busyStage,
    questions,
    answers,
    blueprint,
    capabilities: capabilityPlan.items,
    loopPlan,
    issues: buildLoop.issues,
    feedback: [...feedbackReasons, feedbackCustom, ...(personalizationHistory.at(-1)?.feedback || [])].filter(Boolean),
    demo: skillDemo,
  }) : [];
  const activeSkillName = stripYamlQuotes(files["SKILL.md"]?.match(/^name:\s*([^\n]+)$/m)?.[1] || "") || "generated-skill";
  const workspaceName = completedSteps.has("build") ? activeSkillName : ideaReady ? "新 Skill 草稿" : "未命名 Skill";

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => () => {
    if (busyCloseTimer.current !== null) window.clearTimeout(busyCloseTimer.current);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- Compiler-fixable legacy bundles are migrated once after session hydration so the user is never asked to repair generated invariants manually. */
    if (!sessionHydrated || !files["SKILL.md"] || busy) return;
    const compilerFixable = bundleAudit.blockers.some((blocker) => (
      blocker === "总目标为空、过短或仍是占位内容"
      || blocker === "没有保留用户确认的内容改动范围"
      || blocker === "内容限制与用户确认的润色或扩写权限冲突"
      || blocker.includes("[USER_PERMISSION_IR_CONFLICT]")
      || blocker.includes("[USER_PERMISSION_RUNTIME_CONFLICT]")
      || blocker.includes("[USER_PERMISSION_EVAL_CONFLICT]")
      || blocker.includes("[UNCONFIRMED_CONTENT_RESTRICTION]")
      || /输出模式为 .+，但不存在真实文件产出能力/.test(blocker)
      || /评测 .+ 期待文件产物，但没有绑定 artifact_checker/.test(blocker)
      || blocker === "任务要求文件交付，但输出契约没有声明可检查的文件模式"
      || blocker === "产物评分器被绑定到没有真实文件产物的用例"
    ));
    if (!compilerFixable) return;
    const normalizedFiles = finalizeSkillFiles(files, idea, demoAnswers, sourceInsightText, capabilityPlan, loopPlan, parseCanonicalSkillIR(files) || undefined);
    const changed = Object.keys({ ...files, ...normalizedFiles }).some((path) => files[path] !== normalizedFiles[path]);
    if (!changed) return;
    const normalizedAudit = auditSkillFiles(normalizedFiles, demoAnswers);
    setFiles(normalizedFiles);
    setBuildLoop((current) => ({ ...current, status: normalizedAudit.blockers.length ? "attention" : "passed", phase: normalizedAudit.blockers.length ? "bundle" : "frozen", issues: normalizedAudit.blockers, frozen: !normalizedAudit.blockers.length }));
    if (!normalizedAudit.blockers.length) {
      setGenerationLoop((current) => current.stopReason.includes("Build Loop 的确定性检查未通过")
        ? { ...DEFAULT_GENERATION_LOOP, stopReason: "跨层编译问题已自动解决；当前版本可直接试跑" }
        : current);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [sessionHydrated, files, busy, bundleAudit.blockers, idea, demoAnswers, sourceInsightText, capabilityPlan, loopPlan]);

  useEffect(() => {
    if (bundleAudit.blockers.length || !aiGenerationIssue.startsWith("修复后仍有")) return;
    /* eslint-disable react-hooks/set-state-in-effect -- This effect reconciles a stale async error with the latest compiler audit. */
    setAiGenerationIssue("");
    setRetryAction(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [aiGenerationIssue, bundleAudit.blockers.length]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- Clear legacy loop failure copy after the deterministic compiler has closed every release blocker. */
    if (!sessionHydrated || !files["SKILL.md"] || busy || bundleAudit.blockers.length) return;
    if (!generationLoop.stopReason.includes("Build Loop 的确定性检查未通过")) return;
    setGenerationLoop({ ...DEFAULT_GENERATION_LOOP, stopReason: "跨层编译问题已自动解决；当前版本可直接试跑" });
    setRetryAction(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [sessionHydrated, files, busy, bundleAudit.blockers.length, generationLoop.stopReason]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- A compiler update can make a restored bundle valid without changing its bytes. Keep the visible Build state aligned with the live deterministic audit. */
    if (!sessionHydrated || !files["SKILL.md"] || busy || bundleAudit.blockers.length || buildLoop.status !== "attention") return;
    setBuildLoop((current) => ({ ...current, status: "passed", phase: "frozen", issues: [], frozen: true }));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [sessionHydrated, files, busy, bundleAudit.blockers.length, buildLoop.status]);

  useEffect(() => {
    if (!sessionHydrated || !completedSteps.has("build") || !files["SKILL.md"] || busy || !hasRealModel) return;
    if (gateOutcomes.build.verdict !== "satisfied" || gateOutcomes.build.evidenceStrength !== "deterministic" || generationLoop.status !== "idle") return;
    const resumeKey = `${activeSkillName}:${files["SKILL.md"].length}:${files["evals/evals.json"]?.length || 0}`;
    if (autoOptimizationResumeKey.current === resumeKey) return;
    autoOptimizationResumeKey.current = resumeKey;
    void rerunOptimizationLoop();
  }, [sessionHydrated, completedSteps, files, busy, hasRealModel, gateOutcomes.build, generationLoop.status, activeSkillName]);

  useEffect(() => {
    if (!busyTask) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setBusyElapsed(Math.floor((Date.now() - startedAt) / 1_000)), 1_000);
    return () => window.clearInterval(timer);
  }, [busyTask]);

  useEffect(() => {
    if (!sessionHydrated) return;
    void loadMcpConnections();
  }, [sessionHydrated]);

  useEffect(() => {
    if (!settingsOpen) return;
    void loadMcpConnections();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsClosing(true);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsClosing) return;
    const timer = window.setTimeout(() => {
      setSettingsOpen(false);
      setSettingsClosing(false);
    }, 230);
    return () => window.clearTimeout(timer);
  }, [settingsClosing]);

  useEffect(() => {
    if (!optimizationOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !optimizationActive) setOptimizationClosing(true);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [optimizationOpen, optimizationActive]);

  useEffect(() => {
    if (!optimizationClosing) return;
    const timer = window.setTimeout(() => {
      setOptimizationOpen(false);
      setOptimizationClosing(false);
      setOptimizationTargetIndex(null);
      setOptimizationStatus("idle");
      setOptimizationPlan(null);
      setOptimizationSession(null);
      setSelectedOptimizationIds([]);
      setOptimizationIssue("");
      setOptimizationElapsed(0);
    }, 190);
    return () => window.clearTimeout(timer);
  }, [optimizationClosing]);

  useEffect(() => {
    if (!optimizationActive) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setOptimizationElapsed(Math.floor((Date.now() - startedAt) / 1_000)), 1_000);
    return () => window.clearInterval(timer);
  }, [optimizationActive, optimizationStatus]);

  function openSettings() {
    setSettingsClosing(false);
    setSettingsOpen(true);
  }

  function closeSettings() {
    if (settingsOpen && !settingsClosing) setSettingsClosing(true);
  }

  async function requestCompletionNotifications(): Promise<NotificationPermission | "unsupported"> {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      setToast("当前浏览器不支持系统通知");
      return "unsupported";
    }
    if (window.Notification.permission === "denied") {
      setNotificationPermission("denied");
      setToast("通知已被浏览器阻止，请在当前网站的浏览器权限中重新开启");
      return "denied";
    }
    let permission: NotificationPermission;
    try {
      permission = window.Notification.permission === "granted"
        ? "granted"
        : await window.Notification.requestPermission();
    } catch {
      setNotificationPermission("denied");
      setToast("浏览器没有开放通知权限；生成仍会继续");
      return "denied";
    }
    setNotificationPermission(permission);
    if (permission !== "granted") {
      setToast("没有开启通知；SkillCanvas 仍会在页面内保留完整结果");
      return permission;
    }
    setToast("完成通知已开启，长时间 Loop 结束后会提醒你");
    return permission;
  }

  function startGenerationWithoutNotification() {
    setGenerationNoticeOpen(false);
    void compileSkill();
  }

  async function startGenerationWithNotification() {
    await requestCompletionNotifications();
    setGenerationNoticeOpen(false);
    void compileSkill();
  }

  function notifyGenerationLoopResult(state: GenerationLoopState) {
    if (!("Notification" in window) || window.Notification.permission !== "granted") return;
    const elapsedSeconds = loopStartedAt.current ? Math.max(1, Math.round((Date.now() - loopStartedAt.current) / 1_000)) : 0;
    const title = state.status === "passed" ? "Skill 优化已完成" : state.status === "stable" ? "Skill 已保留当前最佳版本" : "Skill 优化需要查看";
    const result = state.status === "passed"
      ? `当前最佳版本已通过回归门控${state.lift ? `，Skill Lift ${state.lift > 0 ? "+" : ""}${state.lift}` : ""}。`
      : state.status === "stable"
        ? "冻结评测全部通过，但没有候选证明额外提升；已安全保留当前最佳版本。"
      : `${state.stopReason || "Loop 已停止并保留当前最佳版本。"}`;
    try {
      const notification = new window.Notification(title, {
        body: `${result}${elapsedSeconds ? ` 用时约 ${elapsedSeconds} 秒。` : ""}`.slice(0, 220),
        tag: "skillcanvas-generation-loop",
      });
      notification.onclick = () => { window.focus(); notification.close(); };
    } catch {
      // Page state and diagnostics remain the source of truth when a browser
      // or operating system suppresses a notification.
    }
  }

  function updateProvider(next: ProviderId) {
    if (next !== provider) setCredentialStored(false);
    setProvider(next);
    setModel(PROVIDERS[next].model);
    setAvailableModels(PROVIDERS[next].models.map((item) => item.id));
    setBaseUrl(PROVIDERS[next].baseUrl);
    setApiKey("");
    setConnectionState("idle");
    setAiGenerationIssue("");
  }

  function updateResearchProvider(next: ResearchProviderId) {
    if (next !== researchProvider) setResearchCredentialStored(next === "searxng" && Boolean(RESEARCH_PROVIDERS[next].baseUrl));
    setResearchProvider(next);
    setResearchApiKey("");
    setResearchBaseUrl(RESEARCH_PROVIDERS[next].baseUrl);
  }

  async function loadMcpConnections(): Promise<McpConnectionSummary[]> {
    try {
      const response = await fetch("/api/mcp", { cache: "no-store" });
      const result = await response.json() as { connections?: McpConnectionSummary[]; error?: string };
      if (!response.ok) throw new Error(result.error || "MCP 连接读取失败");
      const connections = Array.isArray(result.connections) ? result.connections : [];
      setMcpConnections(connections);
      setMcpConnectionsLoaded(true);
      if (!connections.length) setInternalMcpEvidenceReports({});
      setMcpConnectionIssue("");
      return connections;
    } catch (error) {
      setMcpConnectionsLoaded(true);
      setMcpConnectionIssue(error instanceof Error ? error.message : "MCP 连接读取失败");
      return [];
    }
  }

  async function registerMcpConnection() {
    const serverUrl = mcpServerUrl.trim();
    if (!serverUrl) {
      setMcpConnectionIssue("请填写 MCP Server 地址");
      return;
    }
    setMcpConnectionBusy(true);
    setMcpConnectionIssue("");
    let registeredConnectionId = "";
    try {
      const response = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register", name: mcpConnectionName.trim(), serverUrl, bearerToken: mcpBearerToken.trim() }),
      });
      const result = await response.json() as { connection?: McpConnectionSummary; error?: string };
      if (!response.ok || !result.connection) throw new Error(result.error || "MCP 连接保存失败");
      registeredConnectionId = result.connection.id;
      const discovery = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "discover", connectionId: result.connection.id }),
      });
      const discoveryResult = await discovery.json() as { tools?: unknown[]; error?: string };
      if (!discovery.ok) throw new Error(discoveryResult.error || "Tool discovery 失败");
      if (!Array.isArray(discoveryResult.tools) || !discoveryResult.tools.length) throw new Error("连接成功，但没有发现任何可调用 Tool");
      setMcpConnectionName("");
      setMcpServerUrl("");
      setMcpBearerToken("");
      await loadMcpConnections();
      setToast(`MCP 已连接，发现 ${Array.isArray(discoveryResult.tools) ? discoveryResult.tools.length : 0} 个 Tool`);
    } catch (error) {
      if (registeredConnectionId) {
        await fetch(`/api/mcp?connectionId=${encodeURIComponent(registeredConnectionId)}`, { method: "DELETE" }).catch(() => undefined);
        await loadMcpConnections();
      }
      setMcpConnectionIssue(error instanceof Error ? error.message : "MCP 连接失败");
    } finally {
      setMcpConnectionBusy(false);
    }
  }

  async function removeMcpConnection(connectionId: string) {
    setMcpConnectionBusy(true);
    setMcpConnectionIssue("");
    try {
      const response = await fetch(`/api/mcp?connectionId=${encodeURIComponent(connectionId)}`, { method: "DELETE" });
      const result = await response.json() as { deleted?: boolean; error?: string };
      if (!response.ok || !result.deleted) throw new Error(result.error || "MCP 连接移除失败");
      await loadMcpConnections();
    } catch (error) {
      setMcpConnectionIssue(error instanceof Error ? error.message : "MCP 连接移除失败");
    } finally {
      setMcpConnectionBusy(false);
    }
  }

  function markComplete(id: StepId) {
    setCompletedSteps((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }

  function chooseModel(next: string) {
    setModel(next);
    setConnectionState("idle");
    setAiGenerationIssue("");
  }

  function invalidateFutureRounds() {
    if (interviewRoundIndex >= highestRoundReached) return [];
    const futureIds = interviewRounds.slice(interviewRoundIndex + 1).flatMap((round) => round.questions.map((question) => question.id));
    setHighestRoundReached(interviewRoundIndex);
    setInterviewRoundOrigins((current) => current.map((origin, index) => index > interviewRoundIndex ? "ai" : origin));
    setCustomQuestionIds((selected) => {
      const updated = new Set(selected);
      futureIds.forEach((id) => updated.delete(id));
      return updated;
    });
    return futureIds;
  }

  function toggleQuestionOption(question: Question, option: string) {
    const futureIds = invalidateFutureRounds();
    setAutoSelectedQuestionIds((current) => {
      if (!current.has(question.id)) return current;
      const next = new Set(current);
      next.delete(question.id);
      return next;
    });
    setAnswers((current) => {
      const next = { ...current };
      futureIds.forEach((id) => delete next[id]);
      if (question.selectionMode === "single") return { ...next, [question.id]: option };
      const selected = question.options.filter((item) => (next[question.id] || "").split("；").includes(item));
      if (option === UNSURE_OPTION) return { ...next, [question.id]: UNSURE_OPTION };
      const withoutUnsure = selected.filter((item) => item !== UNSURE_OPTION);
      const updated = withoutUnsure.includes(option)
        ? withoutUnsure.filter((item) => item !== option)
        : [...withoutUnsure, option];
      return { ...next, [question.id]: updated.join("；") };
    });
    setCustomQuestionIds((current) => {
      const next = new Set(current);
      next.delete(question.id);
      return next;
    });
  }

  function showCustomQuestionInput(question: Question) {
    const futureIds = invalidateFutureRounds();
    setAutoSelectedQuestionIds((current) => {
      if (!current.has(question.id)) return current;
      const next = new Set(current);
      next.delete(question.id);
      return next;
    });
    setCustomQuestionIds((current) => new Set(current).add(question.id));
    setAnswers((current) => {
      const next = { ...current };
      futureIds.forEach((id) => delete next[id]);
      next[question.id] = "";
      return next;
    });
  }

  function updateCustomQuestionAnswer(questionId: string, value: string) {
    const futureIds = invalidateFutureRounds();
    setAnswers((current) => {
      const next = { ...current };
      futureIds.forEach((id) => delete next[id]);
      next[questionId] = value;
      return next;
    });
  }

  function togglePreviewFeedback(option: string) {
    if (interviewRoundIndex > 0) return;
    invalidateFutureRounds();
    setPreviewFeedback((current) => current.includes(option)
      ? current.filter((item) => item !== option)
      : [...current, option].slice(0, 5));
    setInterviewReadiness((current) => ({ ...current, canFinish: false }));
  }

  function beginBusy(task: BusyTask, retry: RetryAction, phase = 0) {
    if (busyCloseTimer.current !== null) {
      window.clearTimeout(busyCloseTimer.current);
      busyCloseTimer.current = null;
    }
    setBusyClosing(false);
    setBusyTask(task);
    setBusyPhaseIndex(phase);
    setBusyElapsed(0);
    setBusyExecutionKind("local");
    setBusyExecutionNote("正在准备当前步骤");
    setActiveAiMode("");
    setRetryAction(retry);
  }

  function finishBusy() {
    setBusyClosing(true);
    if (busyCloseTimer.current !== null) window.clearTimeout(busyCloseTimer.current);
    busyCloseTimer.current = window.setTimeout(() => {
      setBusyTask(null);
      setBusyClosing(false);
      setBusyPhaseIndex(0);
      setBusyElapsed(0);
      setBusyExecutionKind("local");
      setBusyExecutionNote("正在准备当前步骤");
      setActiveAiMode("");
      busyCloseTimer.current = null;
    }, 220);
  }

  function showLocalBusy(note: string) {
    setActiveAiMode("");
    setBusyExecutionKind("local");
    setBusyExecutionNote(note);
  }

  function showLoopBusy(note: string) {
    setActiveAiMode("");
    setBusyExecutionKind("loop");
    setBusyExecutionNote(note);
  }

  function retryCurrentAiAction() {
    if (retryAction === "start-interview") void startInterview();
    if (retryAction === "advance-interview") void advanceInterview();
    if (retryAction === "regenerate-interview") void regenerateCurrentInterviewRound();
    if (retryAction === "build-blueprint") void buildBlueprint();
    if (retryAction === "compile-skill") void compileSkill();
    if (retryAction === "rerun-optimization-loop") void rerunOptimizationLoop();
    if (retryAction === "rerun-multi-scene-comparison") void rerunMultiSceneComparison();
    if (retryAction === "repair-skill") void repairSkill();
    if (retryAction === "evaluate") void runEvaluation();
    if (retryAction === "personalize") void applyPersonalFeedback();
  }

  async function callAI<T>(mode: string, payload: Record<string, unknown>): Promise<T> {
    setActiveAiMode(mode);
    setBusyExecutionKind("model");
    setBusyExecutionNote(AI_MODE_LABELS[mode] || `执行 ${mode}`);
    const controller = new AbortController();
    const timeoutMs = ["build", "repair", "eval-execute", "eval-grade", "eval-compare", "optimization-diagnose", "optimization-patch-plan", "optimization-research", "personalize", "optimization-evidence", "demo", "evaluate"].includes(mode)
      ? 106_000
      : ["preview", "optimize", "blueprint"].includes(mode)
        ? 82_000
        : 60_000;
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, provider, model, baseUrl, apiKey, ...payload }),
        signal: controller.signal,
      });
      const raw = await response.text();
      let data: { content?: string; error?: string; requestId?: string } = {};
      try { data = JSON.parse(raw) as { content?: string; error?: string; requestId?: string }; } catch { /* handled below */ }
      if (!response.ok || !data.content) {
        const requestHint = data.requestId ? `（请求 ${data.requestId}）` : "";
        throw new Error(`${data.error || `模型请求失败（${response.status || "网络中断"}）`}${requestHint}`);
      }
      return jsonFromText<T>(data.content);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        void fetch("/api/client-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "ai_client_timeout", mode, phase: busyStage, elapsedMs: timeoutMs, reason: `浏览器在 ${Math.round(timeoutMs / 1_000)} 秒停止等待` }),
        }).catch(() => undefined);
        throw new Error(`${AI_MODE_LABELS[mode] || mode}等待超过 ${Math.round(timeoutMs / 1_000)} 秒，已自动结束；当前内容已保留，可以直接重试该节点`);
      }
      if (error instanceof TypeError || (error instanceof Error && /failed to fetch|networkerror|load failed/i.test(error.message))) {
        void fetch("/api/client-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "ai_client_network_error", mode, phase: busyStage, elapsedMs: busyElapsed * 1_000, reason: error instanceof Error ? error.message : "network error" }),
        }).catch(() => undefined);
        throw new Error(`${mode} 请求在等待模型时中断，当前内容已保留，请直接重试这一步`);
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function runIsolatedEvalHarness(input: {
    cases: SkillEvalCase[];
    skillFiles?: Record<string, string>;
    configuration: HarnessConfiguration;
    repeats?: number;
  }): Promise<HarnessReport> {
    const contract = freezeEvalContract(input.cases);
    const publicContract = publicExecutionContract(contract);
    const repeats = Math.max(1, Math.min(3, input.repeats || 1));
    const completed: Array<{ executions: HarnessExecution[]; grades: HarnessGrade[] }> = [];
    // Model-backed rollouts are deliberately sequential. Parallel large JSON
    // responses made providers truncate otherwise valid evaluation payloads.
    for (let offset = 0; offset < repeats; offset += 1) {
      const runIndex = offset + 1;
      const startedAt = performance.now();
      let executionRaw: unknown = null;
      let executionBatchError = "";
      const executeCasewise = input.cases.length > 1 && JSON.stringify(publicContract).length > 12_000;
      if (executeCasewise) {
        executionBatchError = "冻结任务包含较长的真实 fixture，已预先拆成单用例执行以避免批量 JSON 截断";
      } else {
        try {
          executionRaw = await callAI<unknown>("eval-execute", {
            baselineMode: input.configuration === "without_skill",
            evalContract: publicContract,
            ...(input.skillFiles ? { skill: runtimeSkillBundle(input.skillFiles) } : {}),
          });
        } catch (error) {
          if (input.cases.length <= 1) throw error;
          executionBatchError = error instanceof Error ? error.message : "批量隔离执行失败";
        }
      }
      const durationMs = performance.now() - startedAt;
      let normalizedExecutions = executionBatchError ? null : normalizeHarnessExecutions({
        value: executionRaw,
        contract,
        configuration: input.configuration,
        runIndex,
        durationMs,
      });
      if (!normalizedExecutions) {
        reportClientGenerationLoopEvent("generation_loop_phase", {
          phase: "execution-recovery",
          round: runIndex,
          reason: executionBatchError
            ? `批量隔离执行失败，自动拆成单用例补跑：${executionBatchError}`
            : "批量隔离执行漏返回用例，自动拆成单用例补跑",
        });
        const recovered = [];
        for (const testCase of input.cases) {
          const singleContract = freezeEvalContract([testCase]);
          const singleStartedAt = performance.now();
          const singleRaw = await callAI<unknown>("eval-execute", {
            baselineMode: input.configuration === "without_skill",
            evalContract: publicExecutionContract(singleContract),
            ...(input.skillFiles ? { skill: runtimeSkillBundle(input.skillFiles) } : {}),
          });
          recovered.push(normalizeHarnessExecutions({
            value: singleRaw,
            contract: singleContract,
            configuration: input.configuration,
            runIndex,
            durationMs: performance.now() - singleStartedAt,
          })?.[0] || null);
        }
        normalizedExecutions = recovered.every((item): item is NonNullable<typeof item> => Boolean(item)) ? recovered : null;
      }
      if (!normalizedExecutions) throw new Error(`隔离执行第 ${runIndex} 次批量与单用例恢复都没有返回完整任务结果`);
      const executions = await verifyExecutionsInLocalSandbox({ cases: input.cases, skillFiles: input.skillFiles, executions: normalizedExecutions });
      let gradeRaw: unknown = null;
      let gradingBatchError = "";
      const gradeCasewise = input.cases.length > 1 && JSON.stringify({ contract, executions }).length > 24_000;
      if (gradeCasewise) {
        gradingBatchError = "执行证据较长，已预先拆成单用例评分以避免批量 JSON 截断";
      } else {
        try {
          gradeRaw = await callAI<unknown>("eval-grade", { evalContract: contract, executions });
        } catch (error) {
          if (input.cases.length <= 1) throw error;
          gradingBatchError = error instanceof Error ? error.message : "批量隔离评分失败";
        }
      }
      let grades = gradingBatchError ? null : normalizeHarnessGrades({ value: gradeRaw, contract, executions });
      if (!grades) {
        reportClientGenerationLoopEvent("generation_loop_phase", {
          phase: "grading-recovery",
          round: runIndex,
          reason: gradingBatchError
            ? `批量隔离评分失败，自动拆成单用例补跑：${gradingBatchError}`
            : "批量隔离评分漏返回用例，自动拆成单用例补跑",
        });
        const recovered = [];
        for (const testCase of input.cases) {
          const singleContract = freezeEvalContract([testCase]);
          const execution = executions.find((item) => item.caseId === testCase.id);
          if (!execution) {
            recovered.push(null);
            continue;
          }
          const singleRaw = await callAI<unknown>("eval-grade", { evalContract: singleContract, executions: [execution] });
          recovered.push(normalizeHarnessGrades({ value: singleRaw, contract: singleContract, executions: [execution] })?.[0] || null);
        }
        grades = recovered.every((item): item is NonNullable<typeof item> => Boolean(item)) ? recovered : null;
      }
      if (!grades) throw new Error(`隔离评分第 ${runIndex} 次没有覆盖全部冻结任务`);
      completed.push({ executions, grades });
    }
    return buildHarnessReport({
      contract,
      configuration: input.configuration,
      executions: completed.flatMap((item) => item.executions),
      grades: completed.flatMap((item) => item.grades),
    });
  }

  async function runBlindHarnessComparison(left: HarnessReport, right: HarnessReport) {
    const anonymized = anonymizeComparison(left, right);
    const caseIds = left.contract.cases.map((item) => item.id);
    let raw = await callAI<unknown>("eval-compare", { comparison: anonymized.payload });
    let comparison = normalizeBlindComparison(raw, caseIds);
    if (!comparison) {
      raw = await callAI<unknown>("eval-compare", {
        comparison: {
          ...anonymized.payload,
          responseCorrection: "The previous response was rejected. Return 4-8 criteria; for every criterion and both sides include a 1-5 criterionScore and criterionEvidence naming an exact caseId; return exactly one caseResult per case.",
        },
      });
      comparison = normalizeBlindComparison(raw, caseIds);
    }
    if (!comparison) throw new Error("匿名 A/B 比较没有返回完整结果");
    const revealWinner = (winner: "A" | "B" | "tie") => winner === "tie" ? "tie" as const : anonymized.reveal[winner];
    const revealedScores = comparison.qualityScores ? {
      left: anonymized.reveal.A === "left" ? comparison.qualityScores.A : comparison.qualityScores.B,
      right: anonymized.reveal.A === "right" ? comparison.qualityScores.A : comparison.qualityScores.B,
    } : null;
    return {
      ...comparison,
      revealedWinner: revealWinner(comparison.winner),
      revealedScores,
      caseResults: comparison.caseResults.map((item) => ({ ...item, revealedWinner: revealWinner(item.winner) })),
    };
  }

  function commitSkillMutation(receipt: SkillMutationReceipt, candidateFiles?: Record<string, string>) {
    const entry = createDecisionLedgerEntry({
      id: receipt.id,
      source: receipt.source,
      outcome: receipt.accepted ? "accepted" : "rolled-back",
      baselineRevision: receipt.baselineRevision,
      candidateRevision: receipt.candidateRevision,
      contractDigest: receipt.contractDigest || "not-recorded",
      policy: {
        id: receipt.source === "personalization" ? "preserve-and-satisfy" : "target-improvement",
        version: "2.7",
        mode: receipt.source,
      },
      evaluation: {
        runIds: receipt.runIds || [],
        caseIds: receipt.caseIds || [],
        baselineScore: Number.isFinite(receipt.baselineScore) ? receipt.baselineScore! : null,
        candidateScore: Number.isFinite(receipt.candidateScore) ? receipt.candidateScore! : null,
        delta: Number.isFinite(receipt.baselineScore) && Number.isFinite(receipt.candidateScore)
          ? receipt.candidateScore! - receipt.baselineScore!
          : null,
        regressions: receipt.regressions,
      },
      textualGradient: receipt.textualFeedback || { summary: "", criticalProblems: [], preserve: [] },
      failedCases: receipt.failedCases || [],
      decision: {
        reasons: receipt.gateReasons.length ? receipt.gateReasons : receipt.evidence,
        changedFiles: receipt.changedFiles,
        rollbackReason: receipt.accepted ? "" : [...receipt.gateReasons, ...receipt.regressions].join("；"),
      },
      consumedDecisionIds: receipt.consumedDecisionIds || [],
    });
    if (receipt.accepted) {
      if (!candidateFiles) throw new Error("候选提交缺少文件快照，已拒绝写入");
      if (skillBundleRevision(candidateFiles) !== receipt.candidateRevision) throw new Error("候选文件与验证版本不一致，已拒绝写入");
      setFiles(appendDecisionLedgerEntry(candidateFiles, entry));
    } else {
      // A rollback is still a decision. Persist it beside the accepted bundle
      // without changing that bundle's semantic revision.
      setFiles((current) => appendDecisionLedgerEntry(current, entry));
    }
    setMutationHistory((current) => [...current, receipt].slice(-24));
  }

  async function validatePersonalizationCandidate(input: {
    baselineFiles: Record<string, string>;
    candidateFiles: Record<string, string>;
    feedback: string[];
  }) {
    const evalBank = harnessRunnableEvalBank(parseAndSplitEvalCases(input.baselineFiles["evals/evals.json"] || ""), capabilityPlan);
    const requiredCapabilityIds = harnessVerifiableCapabilityIds(capabilityPlan);
    const coverage = heldOutCapabilityCoverage(evalBank, requiredCapabilityIds);
    if (coverage.missing.length) throw new Error(`统一提交门禁缺少既有能力验证：${coverage.missing.join("、")}`);
    const selectionCases = sampleOptimizationCases(evalBank, "selection", OPTIMIZATION_SELECTION_SAMPLE, { requiredCapabilityIds });
    if (selectionCases.length < 2) throw new Error("统一提交门禁没有足够的冻结任务，不能安全写入个性化修改");

    // Baseline and candidate deliberately run against the same frozen cases.
    // New feedback may add behavior, but it may not silently erase a property
    // that an earlier accepted revision already demonstrated.
    const baselineHarness = await runIsolatedEvalHarness({ cases: selectionCases, skillFiles: input.baselineFiles, configuration: "with_skill", repeats: 2 });
    const candidateHarness = await runIsolatedEvalHarness({ cases: selectionCases, skillFiles: input.candidateFiles, configuration: "candidate", repeats: 2 });
    const baselineAudit = auditSkillFiles(input.baselineFiles, demoAnswers);
    const candidateAudit = auditSkillFiles(input.candidateFiles, demoAnswers);
    const gate = decideCandidateCommitGate({
      baseline: baselineHarness.evidence,
      candidate: candidateHarness.evidence,
      selectionCaseIds: selectionCases.map((item) => item.id),
      targetLabel: FRIENDLY_EVAL_LABELS[2],
      protectedLabels: [...FRIENDLY_EVAL_LABELS],
      baselineBlockers: baselineAudit.blockers.length,
      candidateBlockers: candidateAudit.blockers.length,
      mode: "preserve-and-satisfy",
      requirementChecks: input.feedback.map((item, index) => ({
        id: `feedback-${index + 1}`,
        satisfied: feedbackAppearsInRuntimeFiles(input.candidateFiles, item),
        detail: item,
      })),
    });
    return {
      gate,
      baselineEvidence: baselineHarness.evidence,
      candidateEvidence: candidateHarness.evidence,
      selectionCaseIds: selectionCases.map((item) => item.id),
      contractDigest: candidateHarness.contract.digest,
      runIds: candidateHarness.executions.map((item) => item.runId),
    };
  }

  function closeOptimization() {
    if (optimizationOpen && !optimizationClosing && !optimizationActive) setOptimizationClosing(true);
  }

  function toggleOptimizationSuggestion(id: string) {
    if (optimizationActive) return;
    setSelectedOptimizationIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function openOptimization(index: number) {
    const target = evals[index];
    if (!target) return;
    if (!hasRealModel) {
      setToast("单项优化需要先连接 AI 模型");
      openSettings();
      return;
    }
    setOptimizationTargetIndex(index);
    setOptimizationOpen(true);
    setOptimizationClosing(false);
    setOptimizationStatus("analyzing");
    setOptimizationPlan(null);
    setOptimizationSession(null);
    setSelectedOptimizationIds([]);
    setOptimizationIssue("");
    setOptimizationElapsed(0);
    try {
      const evalBank = harnessRunnableEvalBank(parseAndSplitEvalCases(files["evals/evals.json"] || ""), capabilityPlan);
      const requiredCapabilityIds = harnessVerifiableCapabilityIds(capabilityPlan);
      const heldOutCoverage = heldOutCapabilityCoverage(evalBank, requiredCapabilityIds);
      if (heldOutCoverage.missing.length) throw new Error(`评测编译器未覆盖能力：${heldOutCoverage.missing.join("、")}`);
      const trainCases = sampleOptimizationCases(evalBank, "train", OPTIMIZATION_TRAIN_SAMPLE);
      const selectionCases = sampleOptimizationCases(evalBank, "selection", OPTIMIZATION_SELECTION_SAMPLE, { requiredCapabilityIds });
      if (trainCases.length < 2 || selectionCases.length < 2) throw new Error("当前评测集不足以分离训练任务和验证任务，请先重新生成完整 Eval");

      const [trainingHarness, baselineHarness] = await Promise.all([
        runIsolatedEvalHarness({ cases: trainCases, skillFiles: files, configuration: "with_skill", repeats: 1 }),
        runIsolatedEvalHarness({ cases: selectionCases, skillFiles: files, configuration: "with_skill", repeats: 2 }),
      ]);
      const trainingEvidence = trainingHarness.evidence;
      const baselineEvidence = baselineHarness.evidence;
      setOptimizationSession({
        cases: evalBank,
        trainCaseIds: trainCases.map((item) => item.id),
        selectionCaseIds: selectionCases.map((item) => item.id),
        trainingEvidence,
        baselineEvidence,
      });

      const rejectedHistory = [
        ...decisionLedgerFeedback(files, { source: "optimization", limit: 6 }),
        ...rejectedOptimizations.filter((item) => item.dimension === target.label),
      ].slice(-6);
      const result = await callAI<unknown>("optimization-plan", {
        idea,
        sourceText: contextBundle,
        answers: interviewEvidence,
        capabilityPlan,
        loopPlan,
        skillIR: parseCanonicalSkillIR(files),
        skill: files,
        evaluation: target,
        dimension: target.label,
        rolloutEvidence: trainingEvidence,
        rejectedHistory,
      });
      const plan = normalizeOptimizationPlan(result);
      if (!plan) throw new Error("AI 没有返回可选择的优化方案");
      const recommended = plan.suggestions.filter((item) => item.recommended).map((item) => item.id);
      setOptimizationPlan(plan);
      setSelectedOptimizationIds(recommended.length ? recommended : [plan.suggestions[0].id]);
      setOptimizationStatus("ready");
    } catch (error) {
      setOptimizationIssue(error instanceof Error ? error.message : "优化点分析失败");
      setOptimizationStatus("error");
    }
  }

  async function runSelectedOptimization() {
    if (optimizationTargetIndex === null || !optimizationTarget || !optimizationPlan || !optimizationSession) return;
    const selected = optimizationPlan.suggestions.filter((item) => selectedOptimizationIds.includes(item.id));
    if (!selected.length) {
      setToast("至少选择一个优化点");
      return;
    }
    const before = optimizationTarget;
    setOptimizationIssue("");
    setOptimizationElapsed(0);
    setOptimizationStatus("optimizing");
    try {
      const rejectedHistory = [
        ...decisionLedgerFeedback(files, { source: "optimization", limit: 6 }),
        ...rejectedOptimizations.filter((item) => item.dimension === before.label),
      ].slice(-6);
      const canonicalTargets = canonicalMutationTargetCatalog(files);
      const noOpFeedback: string[] = [];
      let optimized: OptimizationEditResponse | null = null;
      let canonicalCandidate: ReturnType<typeof applyCanonicalCandidate> | null = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        optimized = await callAI<OptimizationEditResponse>("optimize", {
          idea,
          sourceText: contextBundle,
          answers: interviewEvidence,
          capabilityPlan,
          loopPlan,
          skillIR: parseCanonicalSkillIR(files),
          skill: files,
          evaluation: before,
          dimension: before.label,
          optimizationPlan: selected,
          rolloutEvidence: optimizationSession.trainingEvidence,
          rejectedHistory,
          canonicalTargets,
          priorAttemptFeedback: noOpFeedback,
          attempt,
        });
        const applied = applyOptimizationEdits(files, optimized);
        const candidate = applyCanonicalCandidate({
          currentFiles: files,
          rawMutations: optimized.canonicalMutations,
          implementationFiles: {
            ...optimized.implementationFiles,
            ...Object.fromEntries(applied.changedPaths.map((path) => [path, applied.files[path]])),
          },
          idea,
          answers: demoAnswers,
          sourceEvidence: sourceInsightText,
          capabilityPlan,
          loopPlan,
        });
        if (candidate.materialDiff) {
          canonicalCandidate = candidate;
          break;
        }
        noOpFeedback.push(`第 ${attempt} 次候选被投影消除。已尝试：${JSON.stringify(candidate.mutations).slice(0, 2_400)}。下一次必须改用不同目标或不同值。`);
      }
      if (!optimized || !canonicalCandidate) throw new Error("AI 连续 3 次都只返回了无效或重复修改；当前 Skill 已安全保留，请重新选择另一个优化方向");
      const optimizedFiles = canonicalCandidate.files;
      const allPaths = new Set([...Object.keys(files), ...Object.keys(optimizedFiles)]);
      const changedFiles = Array.from(allPaths).filter((path) => files[path] !== optimizedFiles[path]);
      if (!changedFiles.length) throw new Error("所选方案没有产生可验证的文件变化");

      setOptimizationStatus("reevaluating");
      setOptimizationElapsed(0);
      const selectionCases = optimizationSession.cases.filter((item) => optimizationSession.selectionCaseIds.includes(item.id));
      const candidateHarness = await runIsolatedEvalHarness({ cases: selectionCases, skillFiles: optimizedFiles, configuration: "candidate", repeats: 2 });
      const candidateEvidence = candidateHarness.evidence;

      const baselineAudit = auditSkillFiles(files, demoAnswers);
      const candidateAudit = auditSkillFiles(optimizedFiles, demoAnswers);
      const gate = decideOptimizationGate({
        baseline: optimizationSession.baselineEvidence,
        candidate: candidateEvidence,
        selectionCaseIds: optimizationSession.selectionCaseIds,
        targetLabel: before.label,
        protectedLabels: [...FRIENDLY_EVAL_LABELS],
        baselineBlockers: baselineAudit.blockers.length,
        candidateBlockers: candidateAudit.blockers.length,
      });
      const beforeResults = optimizationEvidenceToEvalResults(optimizationSession.baselineEvidence, optimizationSession.selectionCaseIds, evals);
      const candidateResults = optimizationEvidenceToEvalResults(candidateEvidence, optimizationSession.selectionCaseIds, evals);
      const gatedBefore = beforeResults.find((item) => item.label === before.label) || { ...before, score: gate.beforeScore };
      const after = candidateResults.find((item) => item.label === before.label) || { ...before, score: gate.candidateScore };
      const candidateDemo = createOptimizationDemo(candidateEvidence, optimizationSession.selectionCaseIds, before.label);
      const baseSummary = typeof optimized.summary === "string" && optimized.summary.trim()
        ? optimized.summary.trim().slice(0, 800)
        : `候选版本修改了 ${changedFiles.length} 个文件。`;
      const summary = gate.accepted
        ? `${baseSummary} 候选版本通过独立验证，已替换当前最佳版本。`
        : `${baseSummary} 但未通过独立验证，系统已回滚并保留原版本。`;
      const evidence = [
        ...candidateEvidence.cases.filter((item) => optimizationSession.selectionCaseIds.includes(item.caseId)).slice(0, 3).map((item) => `${item.caseId}：${item.evidence || item.failureReason}`),
        ...gate.reasons,
        ...gate.regressions,
      ].filter(Boolean);
      const optimizationRecord: OptimizationHistory & { dimension: string } = {
        dimension: before.label,
        accepted: gate.accepted,
        before: gatedBefore,
        after,
        summary,
        changedFiles,
        appliedTitles: selected.map((item) => item.title),
        evidence,
        gateReasons: gate.reasons,
        regressions: gate.regressions,
        testedCases: optimizationSession.selectionCaseIds.length,
      };
      commitSkillMutation({
        id: `optimization-${Date.now()}`,
        source: "optimization",
        accepted: gate.accepted,
        createdAt: Date.now(),
        baselineRevision: skillBundleRevision(files),
        candidateRevision: skillBundleRevision(optimizedFiles),
        changedFiles,
        testedCases: optimizationSession.selectionCaseIds.length,
        evidence,
        gateReasons: gate.reasons,
        regressions: gate.regressions,
        contractDigest: candidateHarness.contract.digest,
        runIds: candidateHarness.executions.map((item) => item.runId),
        caseIds: optimizationSession.selectionCaseIds,
        baselineScore: gate.beforeScore,
        candidateScore: gate.candidateScore,
        textualFeedback: candidateEvidence.textualFeedback,
        failedCases: candidateEvidence.failedCases,
        consumedDecisionIds: Array.isArray(optimized.consumedDecisionIds)
          ? optimized.consumedDecisionIds.filter((item): item is string => typeof item === "string")
          : [],
        optimization: optimizationRecord,
      }, gate.accepted ? optimizedFiles : undefined);

      if (gate.accepted) {
        if (candidateDemo) setSkillDemo(candidateDemo);
        setDemoReviewPending(false);
        setEvalRan(true);
        setDemoExpanded(true);
        setEvals(candidateResults);
        setFeedbackOptions(createDemoFeedbackFallback(candidateDemo || skillDemo || { title: "", scenario: "", userPrompt: "", output: "", appliedRules: [], uncertainties: [] }, candidateResults, candidateEvidence.failurePatterns));
        setFeedbackReasons([]);
        setFeedbackCustom("");
        setFeedbackLoopSummary(summary);
        setPersonalizationRound((current) => Math.min(PERSONALIZATION_MAX_ROUNDS, Math.max(1, current) + 1));
        setRepaired(true);
      } else {
        setRejectedOptimizations((current) => [...current, {
          dimension: before.label,
          selectedTitles: selected.map((item) => item.title),
          reason: [...gate.reasons, ...gate.regressions].join("；"),
          beforeScore: gate.beforeScore,
          candidateScore: gate.candidateScore,
          changedFiles,
          textualFeedback: candidateEvidence.textualFeedback,
          failedCases: candidateEvidence.failedCases,
        }].slice(-20));
      }
      setOptimizationStatus("complete");
      setToast(gate.accepted ? `“${before.label}”候选版本通过验证，已采用` : `候选版本未通过验证，已保留原 Skill`);
    } catch (error) {
      setOptimizationIssue(error instanceof Error ? error.message : "单项优化失败");
      setOptimizationStatus("error");
    }
  }

  function viewOptimizedFiles() {
    const firstChangedFile = optimizationTargetHistory?.changedFiles[0];
    if (firstChangedFile) setSelectedFile(firstChangedFile);
    setStep("build");
    closeOptimization();
  }

  async function handleSources(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    if (!selected.length) return;
    const candidates = selected.slice(0, 8);
    setSourcesLoading(true);
    setSourceReceipt({ tone: "reading", title: "正在读取资料", detail: `正在解析 ${candidates.length} 个文件，PDF 会保留页码作为后续证据。` });
    try {
      const results = await Promise.allSettled(candidates.map(async (file) => {
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (!isPdf) {
          if (file.size > 2_000_000) throw new Error(`${file.name} 超过 2 MB`);
          return { label: file.name, text: `\n--- ${file.name} ---\n${await file.text()}`, warning: "" };
        }

        if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name} 超过 8 MB`);
        const form = new FormData();
        form.append("file", file, file.name);
        const response = await fetch("/api/parse-pdf", { method: "POST", body: form });
        const data = await response.json() as { error?: string; text?: string; totalPages?: number; characterCount?: number; scannedLikely?: boolean };
        if (!response.ok) throw new Error(`${file.name}：${data.error || "解析失败"}`);
        if (data.scannedLikely) {
          return { label: "", text: "", warning: `${file.name} 像扫描件，没有可读取文字；需要先 OCR` };
        }
        return {
          label: `${file.name} · ${data.totalPages || 0} 页`,
          text: `\n--- ${file.name}（PDF，共 ${data.totalPages || 0} 页）---\n${data.text || ""}`,
          warning: (data.characterCount || 0) < 200 ? `${file.name} 提取到的文字很少，请确认内容是否完整` : "",
        };
      }));

      const successful = results.flatMap((result) => result.status === "fulfilled" && result.value.text ? [result.value] : []);
      const warnings = results.flatMap((result) => {
        if (result.status === "rejected") return [result.reason instanceof Error ? result.reason.message : "资料读取失败"];
        return result.value.warning ? [result.value.warning] : [];
      });
      setSourceNames((current) => Array.from(new Set([...current, ...successful.map((item) => item.label)])));
      setSourceText((current) => `${current}${successful.map((item) => item.text).join("\n")}`.slice(0, 80_000));
      if (successful.length) setSourceInsights([]);
      setSourceWarnings(warnings);
      if (successful.length) {
        setSourceReceipt({
          tone: warnings.length ? "warning" : "ready",
          title: warnings.length ? `已读取 ${successful.length} 份资料，另有内容需要确认` : `已读取 ${successful.length} 份资料`,
          detail: `${successful.map((item) => item.label).join("；")}。开始后 AI 会先提炼资料角色、可复用特征和页码依据。`,
        });
      } else {
        setSourceReceipt({ tone: "error", title: "资料没有成功读入", detail: warnings.join("；") || "请检查文件格式后重试。" });
      }
      setToast(warnings.length ? `已读取 ${successful.length} 份，${warnings.length} 份需要处理` : `已读取 ${successful.length} 份资料`);
    } catch (error) {
      setSourceReceipt({ tone: "error", title: "资料读取失败", detail: error instanceof Error ? error.message : "请检查文件后重试。" });
    } finally {
      setSourcesLoading(false);
      event.target.value = "";
    }
  }

  function updateSourceRole(index: number, role: SourceInsight["role"]) {
    setSourceInsights((current) => current.map((insight, itemIndex) => itemIndex === index ? {
      ...insight,
      role,
      roleLabel: SOURCE_ROLE_LABELS[role],
      roleReason: `用户已确认将这份资料作为“${SOURCE_ROLE_LABELS[role]}”使用。`,
    } : insight));
    setToast(`已改为${SOURCE_ROLE_LABELS[role]}；后续问题和 Skill 会按这个角色使用资料`);
  }

  async function startInterview() {
    if (!ideaReady) {
      setToast("先用一句话告诉 AI：你希望它帮你做什么");
      return;
    }
    if (!hasRealModel) {
      setAiGenerationIssue("尚未连接模型。动态访谈、资料理解和 Skill 生成都需要真实模型，不会再自动切换成固定模板。");
      openSettings();
      return;
    }
    beginBusy("interview", "start-interview");
    setAiGenerationIssue("");
    // Starting from the goal is a new project boundary. Clear every derived
    // artifact so a previous Skill name, score, Demo, or release state can
    // never leak into the new interview while the model is working.
    setCompletedSteps(new Set());
    setAnswers({});
    setCustomQuestionIds(new Set());
    setInterviewRoundIndex(0);
    setHighestRoundReached(0);
    setInterviewRoundOrigins(["ai", "ai", "ai", "ai"]);
    setIntentInterpretation("");
    setDiscoveryPreview(null);
    setDiscoveryPreviewExpanded(true);
    setPreviewFeedback([]);
    setPreviewFeedbackCustom("");
    setInterviewReadiness(EMPTY_INTERVIEW_READINESS);
    setBlueprint(DEFAULT_BLUEPRINT);
    setCapabilityPlan(DEFAULT_CAPABILITY_PLAN);
    setLoopPlan(DEFAULT_LOOP_PLAN);
    setBuildLoop(DEFAULT_BUILD_LOOP);
    setGenerationLoop(DEFAULT_GENERATION_LOOP);
    setKnowledgePack(EMPTY_KNOWLEDGE_PACK);
    setInternalMcpEvidenceReports({});
    setFiles(DEFAULT_FILES);
    setSelectedFile("SKILL.md");
    setEvals(DEFAULT_EVALS);
    setEvalRan(false);
    setSkillDemo(null);
    setDemoReviewPending(false);
    setDemoExpanded(true);
    setPersonalizationRound(0);
    setDemoRunCount(0);
    setFeedbackLoopSummary("");
    setMutationHistory([]);
    setRepaired(false);
    setRejectedOptimizations([]);
    setOptimizationSession(null);
    setFeedbackOptions([]);
    setFeedbackReasons([]);
    setFeedbackCustom("");
    setFeedbackSaved(false);
    setPlatforms([]);
    setAllowSensitiveExport(false);
    try {
      let liveInsights = sourceInsights;
      if (sourceText.trim() && !liveInsights.length) {
        setBusyPhaseIndex(1);
        const sourceResult = await callAI<Record<string, unknown>>("source-analysis", { idea, sourceText: sourceText.slice(0, 80_000) });
        const insight = normalizeSourceInsight(sourceResult, sourceNames[0] || "上传资料");
        if (!insight) throw new Error("模型没有返回可验证的资料特征分析");
        liveInsights = [insight];
        setSourceInsights(liveInsights);
        setSourceReceipt((current) => current ? { ...current, tone: "ready", title: "资料已分析并用于生成问题", detail: `${insight.sourceName} · ${insight.roleLabel} · 已提炼 ${insight.observableTraits.length} 个可复用特征。` } : current);
      }
      const liveInsightText = serializeSourceInsights(liveInsights);
      const liveContext = [liveInsightText ? `# AI source-evidence analysis\n${liveInsightText}` : "", userContextBundle].filter(Boolean).join("\n\n").slice(0, 36_000);
      setBusyPhaseIndex(2);
      const result = await callAI<{ interpretation?: string; preview?: unknown; questions?: unknown; readiness?: unknown }>("preview", { idea, sourceText: liveContext });
      setBusyPhaseIndex(3);
      const generatedQuestions = normalizeInterviewQuestions(result.questions, 0);
      const generatedPreview = normalizeDiscoveryPreview(result.preview);
      if (generatedQuestions.length !== INTERVIEW_ROUND_META[0].dimensions.length) throw new Error("模型没有返回完整的动态理解问题");
      if (!generatedPreview) throw new Error("模型没有完成可供判断的第一版理解预演");
      if (typeof result.interpretation !== "string" || result.interpretation.trim().length < 20) throw new Error("模型没有完成对目标的专业改写");
      const recommendedAnswers = recommendedInterviewAnswers(generatedQuestions);
      setInterviewRounds([{ ...DEFAULT_INTERVIEW_ROUNDS[0], questions: generatedQuestions }, ...DEFAULT_INTERVIEW_ROUNDS.slice(1)]);
      setAnswers(recommendedAnswers);
      setAutoSelectedQuestionIds(new Set(Object.keys(recommendedAnswers)));
      setInterviewRoundOrigins(["ai", "ai", "ai", "ai"]);
      setIntentInterpretation(result.interpretation.trim().slice(0, 520));
      setDiscoveryPreview(generatedPreview);
      setInterviewReadiness(normalizeInterviewReadiness(result.readiness));
      setRetryAction(null);
      markComplete("brief");
      setStep("interview");
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 动态理解失败";
      setAiGenerationIssue(message);
      setToast(`${message}；没有切换成固定模板`);
    } finally {
      finishBusy();
    }
  }

  async function advanceInterview() {
    if (!interviewReady) {
      setToast(`这一轮还有 ${questions.length - currentAnsweredCount} 个关键选择没有回答`);
      return;
    }
    const nextRoundIndex = interviewRoundIndex + 1;
    if (nextRoundIndex >= INTERVIEW_ROUND_META.length) {
      await buildBlueprint();
      return;
    }
    if (nextRoundIndex <= highestRoundReached) {
      setInterviewRoundIndex(nextRoundIndex);
      return;
    }

    beginBusy("interview", "advance-interview");
    setAiGenerationIssue("");
    try {
      if (!hasRealModel) throw new Error("模型配置已缺失，请重新连接");
      setBusyPhaseIndex(2);
      const result = await callAI<{ questions?: unknown; readiness?: unknown }>("interview", {
        idea,
        sourceText: contextBundle,
        round: nextRoundIndex + 1,
        answers: interviewEvidence,
      });
      setBusyPhaseIndex(3);
      const generatedQuestions = normalizeInterviewQuestions(result.questions, nextRoundIndex, interviewEvidence.map((item) => `${item.question}：${item.answer}`).join("\n"));
      if (generatedQuestions.length !== INTERVIEW_ROUND_META[nextRoundIndex].dimensions.length) throw new Error("模型没有返回完整的动态理解问题");
      const recommendedAnswers = recommendedInterviewAnswers(generatedQuestions);
      setInterviewReadiness(normalizeInterviewReadiness(result.readiness));
      setInterviewRounds((current) => current.map((round, index) => index === nextRoundIndex ? { ...round, questions: generatedQuestions } : round));
      setAnswers((current) => ({ ...current, ...recommendedAnswers }));
      setAutoSelectedQuestionIds((current) => new Set([...current, ...Object.keys(recommendedAnswers)]));
      setInterviewRoundOrigins((current) => current.map((origin, index) => index === nextRoundIndex ? "ai" : origin));
      setInterviewRoundIndex(nextRoundIndex);
      setHighestRoundReached(nextRoundIndex);
      setRetryAction(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 生成下一轮失败";
      setAiGenerationIssue(message);
      setToast(`${message}；仍停留在当前轮次`);
    } finally {
      finishBusy();
    }
  }

  async function regenerateCurrentInterviewRound() {
    if (!hasRealModel) {
      setToast("连接模型后，才能让 AI 根据示例重新生成这一轮");
      openSettings();
      return;
    }

    const targetRoundIndex = interviewRoundIndex;
    const previousEvidence = [
      ...previewFeedbackEvidence(discoveryPreview, previewFeedback, previewFeedbackCustom),
      ...createInterviewEvidence(interviewRounds.slice(0, targetRoundIndex), answers),
    ];
    beginBusy("interview", "regenerate-interview");
    setAiGenerationIssue("");
    try {
      setBusyPhaseIndex(2);
      const result = await callAI<{ interpretation?: string; questions?: unknown; readiness?: unknown }>("interview", {
        idea,
        sourceText: contextBundle,
        round: targetRoundIndex + 1,
        answers: previousEvidence,
      });
      setBusyPhaseIndex(3);
      const generatedQuestions = normalizeInterviewQuestions(result.questions, targetRoundIndex, previousEvidence.map((item) => `${item.question}：${item.answer}`).join("\n"));
      if (generatedQuestions.length !== INTERVIEW_ROUND_META[targetRoundIndex].dimensions.length) throw new Error("模型没有返回完整的理解问题");
      setInterviewReadiness(normalizeInterviewReadiness(result.readiness));

      const replacedQuestionIds = interviewRounds
        .slice(targetRoundIndex)
        .flatMap((round) => round.questions.map((question) => question.id));
      const recommendedAnswers = recommendedInterviewAnswers(generatedQuestions);
      setAnswers((current) => {
        const next = { ...current };
        replacedQuestionIds.forEach((id) => delete next[id]);
        return { ...next, ...recommendedAnswers };
      });
      setCustomQuestionIds((current) => {
        const next = new Set(current);
        replacedQuestionIds.forEach((id) => next.delete(id));
        return next;
      });
      setAutoSelectedQuestionIds((current) => {
        const next = new Set(current);
        replacedQuestionIds.forEach((id) => next.delete(id));
        Object.keys(recommendedAnswers).forEach((id) => next.add(id));
        return next;
      });
      setInterviewRounds((current) => current.map((round, index) => {
        if (index === targetRoundIndex) return { ...round, questions: generatedQuestions };
        if (index > targetRoundIndex) return DEFAULT_INTERVIEW_ROUNDS[index];
        return round;
      }));
      setInterviewRoundOrigins((current) => current.map((origin, index) => {
        if (index === targetRoundIndex) return "ai";
        if (index > targetRoundIndex) return "ai";
        return origin;
      }));
      setHighestRoundReached(targetRoundIndex);
      if (targetRoundIndex === 0 && typeof result.interpretation === "string" && result.interpretation.trim()) {
        setIntentInterpretation(result.interpretation.trim().slice(0, 360));
      }
      setRetryAction(null);
      setToast("AI 已结合示例重新理解，并生成了这一轮问题");
    } catch (error) {
      const message = error instanceof Error ? error.message : "根据示例重新生成失败";
      setAiGenerationIssue(message);
      setToast(message);
    } finally {
      finishBusy();
    }
  }

  async function buildBlueprint(allowAdaptiveFinish = false) {
    if (!interviewReady && !(allowAdaptiveFinish && canFinishInterviewEarly)) {
      setToast(`这一轮还有 ${questions.length - currentAnsweredCount} 个关键选择没有回答`);
      return;
    }
    beginBusy("blueprint", "build-blueprint");
    setAiGenerationIssue("");
    try {
      if (!hasRealModel) throw new Error("模型配置已缺失，请重新连接");
      setBusyPhaseIndex(1);
      const result = await callAI<{ sections: BlueprintSection[]; capabilityPlan?: unknown; loopPlan?: unknown }>("blueprint", {
        idea,
        sourceText: contextBundle,
        answers: interviewEvidence,
        capabilityCatalog: CAPABILITY_LIBRARY.map((item) => ({
          id: item.id,
          kind: item.kind,
          name: item.name,
          requirement: item.requirement,
          reason: item.reason,
          routingCondition: item.routingCondition,
          fallback: item.fallback,
          status: item.status,
          connection: item.connection,
        })),
      });
      setBusyPhaseIndex(2);
      if (!Array.isArray(result.sections) || result.sections.length !== 6) throw new Error("模型没有返回完整的六个需求蓝图模块");
      const normalizedCapabilities = normalizeCapabilityPlan(result.capabilityPlan);
      if (!normalizedCapabilities) throw new Error("模型没有返回完整的能力与资源计划");
      const plannedCapabilities = ensureTaskCapabilities(normalizedCapabilities, idea, demoAnswers);
      const plannedLoop = normalizeLoopPlan(result.loopPlan, deriveLoopPlan(idea, demoAnswers, plannedCapabilities));
      const confirmedAnswerText = Object.values(demoAnswers).join("\n");
      const normalizedBlueprint = result.sections.map((item, index) => ({ ...item, content: reconcileDataMutationPolicy(item.content, confirmedAnswerText), index: item.index || String.fromCharCode(65 + index) }));
      setBlueprint(reconcileBlueprintProvenance(normalizedBlueprint, `${idea}\n${confirmedAnswerText}`));
      setCapabilityPlan(plannedCapabilities);
      setMcpDrafts(Object.fromEntries(plannedCapabilities.items.filter((item) => item.kind === "mcp").map((item) => [item.id, item.connection?.server || ""])));
      setLoopPlan(plannedLoop);
      markComplete("interview");
      setStep("blueprint");
      setRetryAction(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 需求蓝图生成失败";
      setAiGenerationIssue(message);
      setToast(`${message}；没有生成固定蓝图`);
    } finally {
      finishBusy();
    }
  }

  /* eslint-disable react-hooks/immutability -- These bounded compiler loops advance local candidate snapshots; React state changes only through setters. */
  async function runP0StaticRepairLoop(inputFiles: Record<string, string>, generationPlan: CapabilityPlan) {
    let currentFiles = inputFiles;
    showLocalBusy("检查 JSON、YAML、路径、运行器与可执行性");
    let validation = await validateBundle(currentFiles);
    let rounds = 0;
    let previousSignature = "";
    while (!validation.executionReady && rounds < STATIC_REPAIR_MAX_ROUNDS) {
      const p0Issues = validation.issues.filter((issue) => issue.priority === "P0");
      const infrastructureIssues = p0Issues.filter((issue) => issue.code === "STATIC_VALIDATOR_UNAVAILABLE");
      const blockers = p0Issues.map((issue) => `${issue.code} · ${issue.path || "bundle"} · ${issue.message}`);
      if (infrastructureIssues.length) {
        setBuildLoop((current) => ({ ...current, status: "attention", phase: "bundle", rounds, issues: blockers.slice(0, 8) }));
        setGenerationLoop((current) => ({ ...current, status: "attention", phase: "static", stopReason: "本地确定性校验服务暂时不可用；已停止 AI Repair，避免把基础设施故障误修成 Skill 内容" }));
        reportClientGenerationLoopEvent("generation_loop_failed", {
          phase: "static-infrastructure",
          round: rounds,
          blockers,
          reason: "P0 校验服务不可用；没有调用 AI Repair",
        });
        break;
      }
      const signature = blockers.join("\n");
      setBuildLoop((current) => ({ ...current, status: "repairing", phase: "bundle", rounds, issues: blockers.slice(0, 8) }));
      setGenerationLoop((current) => ({ ...current, status: "running", phase: "static", stopReason: `P0 Execution Gate 第 ${rounds + 1}/${STATIC_REPAIR_MAX_ROUNDS} 轮：只修复语法、路径、依赖与启动阻塞` }));
      reportClientGenerationLoopEvent("generation_loop_phase", { phase: "static-repair", round: rounds + 1, blockers, reason: `P0 Execution Gate 发现 ${p0Issues.length} 项：${blockers.slice(0, 2).join("；")}` });
      let repairedResult: { updatedFiles?: Record<string, unknown> } = {};
      try {
        const issuePaths = p0Issues.map((issue) => issue.path).filter((path) => isSafeSkillFilePath(path) && Boolean(currentFiles[path]));
        const repairPaths = Array.from(new Set([...issuePaths, "SKILL.md", "agents/openai.yaml"]))
          .filter((path) => Boolean(currentFiles[path]))
          .slice(0, 8);
        let repairBudget = 64_000;
        const targetedFiles = Object.fromEntries(repairPaths.flatMap((path) => {
          const content = currentFiles[path] || "";
          if (!content || repairBudget < 1_000) return [];
          const selected = content.slice(0, Math.min(content.length, repairBudget));
          repairBudget -= selected.length;
          return [[path, selected] as const];
        }));
        let compactSkillIR: unknown = {};
        try {
          const ir = JSON.parse(currentFiles["evals/skill-ir.json"] || "{}") as SkillIR;
          compactSkillIR = {
            identity: ir.identity,
            tasks: ir.tasks,
            inputs: ir.inputs,
            outputs: ir.outputs,
            requirements: ir.requirements?.map((item) => ({ id: item.id, statement: item.statement, provenance: item.provenance, mappedCapabilityIds: item.mappedCapabilityIds })),
            capabilities: ir.capabilities?.map((item) => ({ id: item.id, kind: item.kind, path: item.implementation.path, scope: item.scope })),
          };
        } catch {
          compactSkillIR = { unavailable: true };
        }
        repairedResult = await callAI<{ updatedFiles?: Record<string, unknown> }>("repair", {
          idea,
          sourceText: sourceInsightText.slice(0, 8_000),
          answers: demoAnswers,
          capabilityPlan: generationPlan,
          loopPlan,
          skillIR: compactSkillIR,
          skill: targetedFiles,
          evaluation: { priority: "P0", category: "P0_EXECUTION_BLOCKER", repairRoute: "static-execution", blockers, warnings: [], staticAttempt: rounds + 1 },
        });
      } catch (error) {
        rounds += 1;
        reportClientGenerationLoopEvent("generation_loop_candidate", { phase: "static-repair", round: rounds, accepted: false, reason: error instanceof Error ? error.message : "P0 修复请求失败" });
        if (rounds >= STATIC_REPAIR_MAX_ROUNDS) break;
        continue;
      }
      const replacements = Object.fromEntries(Object.entries(repairedResult.updatedFiles || {}).filter((entry): entry is [string, string] => (
        isSafeSkillFilePath(entry[0]) && typeof entry[1] === "string" && Boolean(entry[1].trim())
      )));
      rounds += 1;
      if (Object.keys(replacements).length) {
        const mergedFiles = { ...currentFiles, ...replacements };
        currentFiles = finalizeSkillFiles(mergedFiles, idea, demoAnswers, sourceInsightText, generationPlan, loopPlan, parseCanonicalSkillIR(mergedFiles) || undefined);
      }
      showLocalBusy("修复结果已返回，正在重新执行同一组确定性检查");
      validation = await validateBundle(currentFiles);
      const nextSignature = validation.issues.filter((issue) => issue.priority === "P0").map((issue) => `${issue.code}:${issue.path}:${issue.message}`).join("\n");
      if (validation.executionReady) break;
      if (!Object.keys(replacements).length && nextSignature === previousSignature) break;
      previousSignature = signature;
    }
    reportClientGenerationLoopEvent("generation_loop_phase", {
      phase: "static-validation",
      round: rounds,
      blockers: validation.issues.filter((issue) => issue.priority === "P0").map((issue) => issue.message),
      reason: validation.executionReady ? "P0 Execution Gate 已通过" : `P0 Execution Gate 自动修复 ${rounds} 轮后仍未通过`,
    });
    return { files: currentFiles, validation, rounds };
  }

  function collectP1ContractState(files: Record<string, string>, answers: Record<string, string>, generationPlan: CapabilityPlan, validation: BundleStaticValidation) {
    const audit = auditSkillFiles(files, answers);
    const canonicalIR = parseCanonicalSkillIR(files);
    const closureCapabilities: CapabilityItem[] = canonicalIR?.capabilities.map((item) => ({
      id: item.id,
      kind: item.kind,
      name: item.name,
      path: item.implementation.path,
      layer: item.implementation.layer,
      requirement: item.requirement,
      purpose: item.purpose,
      reason: item.necessity.reason,
      status: item.implementation.status,
      input: item.input,
      output: item.output,
      fallback: item.fallback,
      routingCondition: item.routingCondition,
      deterministicAdvantage: item.necessity.deterministicNeed ? "确定性实现可重复验证" : "由运行契约控制",
      evaluationCriteria: item.evidenceRequirements,
      scope: item.scope,
      activationCondition: item.activationCondition,
      affects: item.affects,
      mustNotAffect: item.mustNotAffect,
      connection: item.connection,
      enabled: item.necessity.decision !== "exclude",
      necessity: {
        successLift: item.necessity.successLift,
        bareModelReliable: item.necessity.bareModelReliable,
        deterministicNeed: item.necessity.deterministicNeed,
        realResourceAvailable: item.necessity.realResourceAvailable,
        externalDependency: item.necessity.externalDependency,
        decision: item.necessity.decision,
      },
    })) || generationPlan.items;
    const closure = auditCapabilityClosure(files, closureCapabilities);
    const crossArtifact = auditCrossArtifactConsistency(files);
    const issues: PipelineIssue[] = [
      ...bundleIssuesToPipelineIssues(validation.issues.filter((issue) => issue.priority === "P1")),
      ...makeContractIssues(audit.blockers),
      ...crossArtifact.issues.filter((issue) => issue.priority === "P1"),
      ...closure.issues.filter((issue) => issue.severity === "critical").map((issue) => ({
        id: issue.id,
        priority: "P1" as const,
        type: issue.type.toUpperCase().replaceAll("-", "_"),
        source: "closure" as const,
        evidence: issue.detail,
        files: issue.files,
        capabilityId: issue.capabilityId,
      })),
    ];
    const uniqueIssues = [...new Map(issues.map((issue) => {
      const evalClosure = /CAPABILITY_WITHOUT_EVAL|没有绑定可执行\s*Eval|没有映射到任何\s*Eval|没有可执行评测|without.*eval/i.test(`${issue.type} ${issue.evidence}`);
      const key = evalClosure
        ? `eval-closure:${issue.capabilityId || issue.evidence.match(/能力\s+([a-z0-9-]+)/i)?.[1] || issue.type}`
        : `${issue.type}:${issue.evidence}`;
      return [key, issue] as const;
    })).values()];
    return { audit, closure, crossArtifact, issues: uniqueIssues };
  }

  function p1IssuesAreCompilerOwnedEvalEdges(issues: PipelineIssue[]) {
    return issues.length > 0 && issues.every((issue) => /CAPABILITY_WITHOUT_EVAL|没有绑定可执行\s*Eval|没有映射到任何\s*Eval|没有可执行评测|without.*eval/i.test(`${issue.type} ${issue.evidence}`));
  }

  async function runP1ContractRepairLoop(input: {
    files: Record<string, string>;
    validation: BundleStaticValidation;
    generationPlan: CapabilityPlan;
    answers: Record<string, string>;
    sourceText: string;
    skillIR: unknown;
  }) {
    let currentFiles = input.files;
    let validation = input.validation;
    let state = collectP1ContractState(currentFiles, input.answers, input.generationPlan, validation);
    let rounds = 0;
    let nestedP0Rounds = 0;
    let previousSignature = "";
    const rejectedAttempts: string[] = [];
    while (validation.executionReady && state.issues.length && rounds < BUILD_REPAIR_MAX_ROUNDS) {
      const currentIR = parseCanonicalSkillIR(currentFiles);
      const hasLegacyGenericEditPromise = state.issues.some((issue) => /触发描述承诺了工作流没有实现的任务：改写或优化已有内容/i.test(issue.evidence))
        && Boolean(currentIR?.identity.description.includes("提供新材料继续处理或要求修改已有结果时"));
      if (currentIR && hasLegacyGenericEditPromise) {
        const migratedDescription = currentIR.identity.description
          .replace(/、提供新材料继续处理或要求修改已有结果时/g, "，或提供与该任务相关的新材料继续处理时")
          .replace(/提供新材料继续处理或要求修改已有结果时/g, "提供与该任务相关的新材料继续处理时");
        const deterministicCandidate = applyCanonicalCandidate({
          currentFiles,
          rawMutations: [{ type: "identity.update", changes: { description: migratedDescription } }],
          idea,
          answers: input.answers,
          sourceEvidence: input.sourceText,
          capabilityPlan: input.generationPlan,
          loopPlan,
        });
        rounds += 1;
        currentFiles = deterministicCandidate.files;
        validation = await validateBundle(currentFiles);
        state = collectP1ContractState(currentFiles, input.answers, input.generationPlan, validation);
        reportClientGenerationLoopEvent("generation_loop_candidate", {
          phase: "contract-repair",
          round: rounds,
          accepted: validation.executionReady && !state.issues.some((issue) => /触发描述承诺了工作流没有实现的任务：改写或优化已有内容/i.test(issue.evidence)),
          updatedPaths: ["identity.update"],
          reason: state.issues.length
            ? `已移除生成器旧版默认加入的未实现改写承诺；仍有 ${state.issues.length} 项独立契约问题`
            : "已确定性移除生成器旧版默认加入的未实现改写承诺，无需消耗模型修复",
        });
        if (!validation.executionReady || !state.issues.length) break;
        continue;
      }
      if (p1IssuesAreCompilerOwnedEvalEdges(state.issues)) {
        if (currentIR) {
          const coveredEvalBank = ensureSkillIREvalCoverage(currentIR, currentFiles["evals/evals.json"] || projectEvalBank(currentIR));
          const coveredIR = bindSkillIREvals(currentIR, coveredEvalBank);
          const deterministicCandidate = finalizeSkillFiles({
            ...currentFiles,
            "evals/evals.json": coveredEvalBank,
          }, idea, input.answers, input.sourceText, input.generationPlan, loopPlan, coveredIR);
          rounds += 1;
          currentFiles = deterministicCandidate;
          validation = await validateBundle(currentFiles);
          state = collectP1ContractState(currentFiles, input.answers, input.generationPlan, validation);
          reportClientGenerationLoopEvent("generation_loop_candidate", {
            phase: "contract-repair",
            round: rounds,
            accepted: validation.executionReady && state.issues.length === 0,
            updatedPaths: ["evals/skill-ir.json", "evals/evals.json", "evals/capability-manifest.json"],
            reason: state.issues.length
              ? `Canonical Eval Compiler 补齐能力映射后仍有 ${state.issues.length} 项契约问题`
              : "Canonical Eval Compiler 已确定性补齐全部激活能力的可执行 Eval 映射，无需请求修复模型",
          });
          if (!validation.executionReady || !state.issues.length) break;
        }
      }
      const blockers = state.issues.map((issue) => `${issue.type} · ${issue.files.join("、") || "bundle"} · ${issue.evidence}`);
      const signature = state.issues.map((issue) => `${issue.type}:${issue.evidence}`).join("\n");
      const allowedMutationTypes = allowedP1MutationTypes(state.issues);
      const evidencePaths = [...new Set([
        "SKILL.md",
        "evals/capability-manifest.json",
        ...state.issues.flatMap((issue) => issue.files),
      ].filter((path) => isSafeSkillFilePath(path) && Boolean(currentFiles[path])))].slice(0, 8);
      let evidenceBudget = 28_000;
      const focusedRepairEvidence = Object.fromEntries(evidencePaths.flatMap((path) => {
        if (evidenceBudget <= 0) return [];
        const content = currentFiles[path] || "";
        const selected = content.slice(0, evidenceBudget);
        evidenceBudget -= selected.length;
        return [[path, selected] as const];
      }));
      setBuildLoop((current) => ({ ...current, status: "repairing", phase: "bundle", rounds, issues: blockers.slice(0, 8) }));
      setGenerationLoop((current) => ({ ...current, status: "running", phase: "static", stopReason: `P1 Contract Gate 第 ${rounds + 1}/${BUILD_REPAIR_MAX_ROUNDS} 轮：修复契约矛盾、闭环和跨文件语义` }));
      reportClientGenerationLoopEvent("generation_loop_phase", { phase: "contract-repair", round: rounds + 1, blockers, reason: `P1 Contract Gate 发现 ${state.issues.length} 项契约阻断` });
      let repairedResult: CanonicalRepairResponse = {};
      try {
        repairedResult = await callAI<CanonicalRepairResponse>("repair", {
          idea,
          sourceText: input.sourceText,
          answers: input.answers,
          capabilityPlan: input.generationPlan,
          loopPlan,
          skillIR: parseCanonicalSkillIR(currentFiles) || input.skillIR,
          skill: focusedRepairEvidence,
          evaluation: {
            priority: "P1",
            category: "P1_CONTRACT_BLOCKER",
            repairRoute: "semantic-contract",
            blockers,
            warnings: state.audit.warnings,
            contractAttempt: rounds + 1,
            allowedMutationTypes,
          },
          canonicalTargets: { ...canonicalMutationTargetCatalog(currentFiles), allowedMutationTypes },
          rejectedHistory: rejectedAttempts,
        });
      } catch (error) {
        rounds += 1;
        const reason = error instanceof Error ? error.message : "P1 契约修复请求失败";
        rejectedAttempts.push(reason);
        reportClientGenerationLoopEvent("generation_loop_candidate", { phase: "contract-repair", round: rounds, accepted: false, reason });
        if (rounds >= BUILD_REPAIR_MAX_ROUNDS) break;
        continue;
      }
      rounds += 1;
      let canonicalCandidate: ReturnType<typeof applyCanonicalCandidate>;
      try {
        const normalizedMutations = normalizeCanonicalMutations(repairedResult.canonicalMutations);
        const disallowedMutation = normalizedMutations.find((mutation) => !allowedMutationTypes.includes(mutation.type));
        if (disallowedMutation) throw new Error(`修复路由只允许 ${allowedMutationTypes.join("、")}，但模型返回了 ${disallowedMutation.type}`);
        canonicalCandidate = applyCanonicalCandidate({
          currentFiles,
          rawMutations: normalizedMutations,
          implementationFiles: repairedResult.implementationFiles,
          idea,
          answers: input.answers,
          sourceEvidence: input.sourceText,
          capabilityPlan: input.generationPlan,
          loopPlan,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "CanonicalMutation 无法应用";
        rejectedAttempts.push(reason);
        reportClientGenerationLoopEvent("generation_loop_candidate", { phase: "contract-repair", round: rounds, accepted: false, reason });
        continue;
      }
      if (!canonicalCandidate.materialDiff) {
        const reason = "CanonicalMutation 经投影后没有产生语义变化，已在 Eval 前拒绝";
        rejectedAttempts.push(reason);
        reportClientGenerationLoopEvent("generation_loop_candidate", { phase: "contract-repair", round: rounds, accepted: false, reason });
        continue;
      }
      const nextFiles = canonicalCandidate.files;
      const staticRepair = await runP0StaticRepairLoop(nextFiles, input.generationPlan);
      nestedP0Rounds += staticRepair.rounds;
      currentFiles = staticRepair.files;
      validation = staticRepair.validation;
      state = collectP1ContractState(currentFiles, input.answers, input.generationPlan, validation);
      const nextSignature = state.issues.map((issue) => `${issue.type}:${issue.evidence}`).join("\n");
      reportClientGenerationLoopEvent("generation_loop_candidate", {
        phase: "contract-repair",
        round: rounds,
        accepted: validation.executionReady && nextSignature !== signature,
        updatedPaths: [...canonicalCandidate.changedTargets, ...canonicalCandidate.implementationPaths],
        reason: validation.executionReady ? `P1 契约问题由 ${blockers.length} 项降至 ${state.issues.length} 项` : "修复引入 P0，已转回 Execution Gate",
      });
      if (!validation.executionReady || !state.issues.length) break;
      if (nextSignature === previousSignature) break;
      previousSignature = signature;
    }
    const passed = validation.executionReady && validation.contractReady && state.issues.length === 0;
    reportClientGenerationLoopEvent("generation_loop_phase", {
      phase: "contract-validation",
      round: rounds,
      blockers: state.issues.map((issue) => issue.evidence),
      reason: passed ? "P1 Contract Gate 已通过，可以冻结并进入 Eval" : `P1 Contract Gate 自动修复 ${rounds} 轮后仍未收敛`,
    });
    return { files: currentFiles, validation, rounds, nestedP0Rounds, passed, ...state };
  }

  async function runOptimizationLoop(initialFiles: Record<string, string>, generationPlan: CapabilityPlan = capabilityPlan) {
    const durableOptimization = await DurableWorkflowJournal.start("optimization", {
      skillRevision: skillBundleRevision(initialFiles),
      activeCapabilityIds: generationPlan.items.filter(capabilityIsActive).map((item) => item.id),
    });
    setInternalMcpEvidenceReports((current) => ({ ...current, "optimization-research": undefined }));
    loopStartedAt.current = Date.now();
    setBusyPhaseIndex(4);
    showLoopBusy("Build 已通过，正在固定能力边界并启动 Optimization Loop");
    setGenerationLoop({ ...DEFAULT_GENERATION_LOOP, status: "running", phase: "static", stopReason: "正在建立能力闭环" });
    reportClientGenerationLoopEvent("generation_loop_started", { phase: "static", reason: "固定 Goal 并开始能力闭环检查" });
    const restoredCanonicalIR = parseCanonicalSkillIR(initialFiles);
    const restoredPlan = reconcileCapabilityPlanWithCanonicalIR(generationPlan, restoredCanonicalIR);
    const planChangedAfterRestore = stableEvalContractValue(generationPlan.items.map((item) => ({ id: item.id, status: item.status, enabled: item.enabled })))
      !== stableEvalContractValue(restoredPlan.items.map((item) => ({ id: item.id, status: item.status, enabled: item.enabled })));
    generationPlan = restoredPlan;
    if (planChangedAfterRestore) {
      setCapabilityPlan(restoredPlan);
      reportClientGenerationLoopEvent("generation_loop_phase", {
        phase: "canonical-plan-restore",
        reason: "已用冻结 Bundle 的 Canonical SkillIR 恢复能力计划，消除刷新后 UI 状态与 Bundle 能力图的漂移",
      });
    }
    let evaluationAnswers = { ...demoAnswers };
    if (!evaluationAnswers.__previewInput?.trim()) {
      try {
        reportClientGenerationLoopEvent("generation_loop_phase", { phase: "eval-fixture-synthesis", reason: "当前会话没有可执行的代表输入，正在生成一份隐私安全的合成 fixture；它只用于评测，不写成用户事实" });
        const fixtureTrial = await callAI<{ demo?: unknown }>("demo", {
          idea,
          sourceText: contextBundle,
          answers: interviewEvidence,
          loopPlan,
          skill: initialFiles,
          previousDemo: null,
          feedback: [],
        });
        const fixtureDemo = normalizeSkillDemo(fixtureTrial.demo);
        if (fixtureDemo?.userPrompt.trim().length && fixtureDemo.userPrompt.trim().length >= 40) {
          evaluationAnswers = { ...evaluationAnswers, __previewInput: fixtureDemo.userPrompt.trim().slice(0, 4_000) };
          reportClientGenerationLoopEvent("generation_loop_phase", { phase: "eval-fixture-synthesis", accepted: true, reason: "已生成包含可观察输入的合成 Eval fixture" });
        }
      } catch (error) {
        reportClientGenerationLoopEvent("generation_loop_candidate", { phase: "eval-fixture-synthesis", accepted: false, reason: error instanceof Error ? error.message : "合成 Eval fixture 失败；将只验证核心输入请求分支" });
      }
    }
    let compilerInputFiles = initialFiles;
    try {
      const evalVersion = String((JSON.parse(initialFiles["evals/evals.json"] || "{}") as { version?: unknown }).version || "");
      const evalHasRepresentativeFixture = /本用例携带的代表性输入材料如下/.test(initialFiles["evals/evals.json"] || "");
      const evalContractAligned = evalBankMatchesCurrentContract(
        initialFiles["evals/evals.json"] || "",
        deriveSkillIdentity(idea, evaluationAnswers).name,
        idea,
        evaluationAnswers,
        loopPlan,
        generationPlan,
      );
      if (evalVersion !== "2.7" || !evalContractAligned || Boolean(evaluationAnswers.__previewInput?.trim()) !== evalHasRepresentativeFixture) {
        const migratedEvalBank = createSpecificEvals(deriveSkillIdentity(idea, evaluationAnswers).name, idea, evaluationAnswers, loopPlan, generationPlan);
        const existingIR = parseCanonicalSkillIR(initialFiles);
        compilerInputFiles = finalizeSkillFiles({
          ...initialFiles,
          "evals/evals.json": migratedEvalBank,
        }, idea, evaluationAnswers, contextBundle, generationPlan, loopPlan, existingIR ? bindSkillIREvals(existingIR, migratedEvalBank) : undefined);
        reportClientGenerationLoopEvent("generation_loop_phase", { phase: "eval-contract-migration", reason: `评测契约 ${evalVersion || "legacy"} 已按当前 Skill 意图重新绑定：清除跨任务样本，优先复用真实 Demo 输入，并为可确定补齐的关键决策生成隔离分支 fixture` });
      }
    } catch {
      const migratedEvalBank = createSpecificEvals(deriveSkillIdentity(idea, evaluationAnswers).name, idea, evaluationAnswers, loopPlan, generationPlan);
      const existingIR = parseCanonicalSkillIR(initialFiles);
      compilerInputFiles = finalizeSkillFiles({
        ...initialFiles,
        "evals/evals.json": migratedEvalBank,
      }, idea, evaluationAnswers, contextBundle, generationPlan, loopPlan, existingIR ? bindSkillIREvals(existingIR, migratedEvalBank) : undefined);
    }
    const initialStaticRepair = await runP0StaticRepairLoop(compilerInputFiles, generationPlan);
    let optimizerSkillIR: unknown = {};
    try { optimizerSkillIR = JSON.parse(initialStaticRepair.files["evals/skill-ir.json"] || "{}"); } catch { optimizerSkillIR = { unavailable: true }; }
    const initialContractRepair = await runP1ContractRepairLoop({
      files: initialStaticRepair.files,
      validation: initialStaticRepair.validation,
      generationPlan,
      answers: evaluationAnswers,
      sourceText: contextBundle,
      skillIR: optimizerSkillIR,
    });
    let bestFiles = initialContractRepair.files;
    let bestBundleValidation = initialContractRepair.validation;
    const skillContract = createBuildTimeSkillContract(idea, evaluationAnswers, generationPlan, loopPlan);
    let bestClosure = initialContractRepair.closure;
    let bestAudit = initialContractRepair.audit;
    let bestCrossArtifact = initialContractRepair.crossArtifact;
    const initialStaticIssues = initialContractRepair.issues;
    const staticPolicy = optimizationPolicyFor(initialStaticIssues);
    reportClientGenerationLoopEvent("generation_loop_phase", { phase: "static", beforeCount: bestClosure.total, afterCount: bestClosure.closed, blockerCount: staticPolicy.selected.length, reason: `能力闭环 ${bestClosure.closed}/${bestClosure.total}；当前优先级 ${staticPolicy.priority || "none"}` });
    if (!bestBundleValidation.executionReady || staticPolicy.priority === "P0") {
      const p0Evidence = bestBundleValidation.issues.filter((issue) => issue.priority === "P0").map((issue) => issue.message);
      const state: GenerationLoopState = {
        ...DEFAULT_GENERATION_LOOP,
        status: "attention",
        phase: "complete",
        closureScore: bestClosure.score,
        issues: [...p0Evidence, ...staticPolicy.selected.map((item) => item.evidence)].slice(0, 8),
        stopReason: `P0 Execution Gate 已自动修复 ${initialStaticRepair.rounds + initialContractRepair.nestedP0Rounds} 轮仍未通过；契约修复和 Eval 已停止`,
      };
      setGenerationLoop(state);
      reportClientGenerationLoopEvent("generation_loop_finished", { phase: "static", blockers: state.issues, reason: state.stopReason });
      notifyGenerationLoopResult(state);
      await durableOptimization?.fail(new Error(state.stopReason));
      return { files: bestFiles, state };
    }
    if (!initialContractRepair.passed || !bestBundleValidation.contractReady || staticPolicy.priority === "P1") {
      const state: GenerationLoopState = {
        ...DEFAULT_GENERATION_LOOP,
        status: "attention",
        phase: "complete",
        closureScore: bestClosure.score,
        issues: initialContractRepair.issues.map((issue) => issue.evidence).slice(0, 8),
        stopReason: `P1 Contract Gate 自动修复 ${initialContractRepair.rounds} 轮后仍未收敛；Bundle 未冻结，Eval 未启动`,
      };
      setGenerationLoop(state);
      setBuildLoop({ ...DEFAULT_BUILD_LOOP, status: "attention", phase: "bundle", rounds: initialStaticRepair.rounds + initialContractRepair.rounds + initialContractRepair.nestedP0Rounds, issues: state.issues, frozen: false });
      reportClientGenerationLoopEvent("generation_loop_finished", { phase: "contract", blockers: state.issues, reason: state.stopReason });
      notifyGenerationLoopResult(state);
      await durableOptimization?.fail(new Error(state.stopReason));
      return { files: bestFiles, state };
    }
    setBuildLoop({
      ...DEFAULT_BUILD_LOOP,
      status: "passed",
      phase: "frozen",
      rounds: initialStaticRepair.rounds + initialContractRepair.rounds + initialContractRepair.nestedP0Rounds,
      issues: [],
      frozen: true,
    });

    let fullEvalBank = parseAndSplitEvalCases(bestFiles["evals/evals.json"] || "");
    let evalBank = harnessRunnableEvalBank(fullEvalBank, generationPlan);
    const requiredCapabilityIds = harnessVerifiableCapabilityIds(generationPlan);
    let heldOutCoverage = heldOutCapabilityCoverage(evalBank, requiredCapabilityIds);
    if (heldOutCoverage.missing.length) {
      const migratedEvalBank = createSpecificEvals(deriveSkillIdentity(idea, evaluationAnswers).name, idea, evaluationAnswers, loopPlan, generationPlan);
      const existingIR = parseCanonicalSkillIR(bestFiles);
      bestFiles = finalizeSkillFiles({
        ...bestFiles,
        "evals/evals.json": migratedEvalBank,
      }, idea, evaluationAnswers, contextBundle, generationPlan, loopPlan, existingIR ? bindSkillIREvals(existingIR, migratedEvalBank) : undefined);
      fullEvalBank = parseAndSplitEvalCases(bestFiles["evals/evals.json"] || "");
      evalBank = harnessRunnableEvalBank(fullEvalBank, generationPlan);
      heldOutCoverage = heldOutCapabilityCoverage(evalBank, requiredCapabilityIds);
      reportClientGenerationLoopEvent("generation_loop_phase", {
        phase: "eval-stratification-repair",
        resolved: requiredCapabilityIds.filter((id) => !heldOutCoverage.missing.includes(id)),
        blockers: heldOutCoverage.missing,
        reason: "已按激活能力重编译 held-out Eval",
      });
    }
    const trainCases = sampleOptimizationCases(evalBank, "train", OPTIMIZATION_TRAIN_SAMPLE);
    const selectionCases = generationLoop.benchmarkSuiteCases.length >= 2
      ? generationLoop.benchmarkSuiteCases
      : sampleOptimizationCases(evalBank, "selection", OPTIMIZATION_SELECTION_SAMPLE, { requiredCapabilityIds });
    if (heldOutCoverage.missing.length) {
      const state: GenerationLoopState = {
        ...DEFAULT_GENERATION_LOOP,
        status: "attention",
        phase: "complete",
        closureScore: bestClosure.score,
        issues: heldOutCoverage.missing.map((id) => `能力 ${id} 没有 held-out Eval`),
        stopReason: "能力分层评测重编译后仍缺少保留任务，已停止候选优化以避免误判",
      };
      setGenerationLoop(state);
      reportClientGenerationLoopEvent("generation_loop_finished", { phase: "rollout", blockers: state.issues, reason: state.stopReason });
      notifyGenerationLoopResult(state);
      await durableOptimization?.fail(new Error(state.stopReason));
      return { files: bestFiles, state };
    }
    if (trainCases.length < 2 || selectionCases.length < 2) {
      const state: GenerationLoopState = {
        ...DEFAULT_GENERATION_LOOP,
        status: "attention",
        phase: "complete",
        closureScore: bestClosure.score,
        issues: ["评测集无法分成诊断任务与独立保留任务"],
        stopReason: "没有足够的独立任务运行 Optimization Loop",
      };
      setGenerationLoop(state);
      reportClientGenerationLoopEvent("generation_loop_finished", { phase: "rollout", reason: state.stopReason });
      notifyGenerationLoopResult(state);
      await durableOptimization?.fail(new Error(state.stopReason));
      return { files: bestFiles, state };
    }

    await durableOptimization?.complete("held-out-split", {
      trainCaseIds: trainCases.map((item) => item.id),
      selectionCaseIds: selectionCases.map((item) => item.id),
      coveredCapabilityIds: requiredCapabilityIds,
    });

    setBusyPhaseIndex(5);
    showLoopBusy("能力契约已固定，准备冻结评测并隔离运行无 Skill 基线");
    setGenerationLoop((current) => ({ ...current, phase: "rollout", closureScore: bestClosure.score, stopReason: "正在比较无 Skill 基线与首个候选" }));
    const evidencePayload = {
      idea,
      sourceText: contextBundle,
      answers: interviewEvidence,
      capabilityPlan: generationPlan,
      loopPlan,
      skillIR: bestFiles["evals/skill-ir.json"],
    };
    reportClientGenerationLoopEvent("generation_loop_phase", { phase: "rollout-baseline", reason: `冻结评测合约，并行运行无 Skill 与带 Skill 的隔离任务` });
    const baselineHarness = await runIsolatedEvalHarness({ cases: selectionCases, configuration: "without_skill", repeats: 2 });
    const trainingHarness = await runIsolatedEvalHarness({ cases: trainCases, skillFiles: bestFiles, configuration: "with_skill", repeats: 1 });
    const initialBestHarness = await runIsolatedEvalHarness({ cases: selectionCases, skillFiles: bestFiles, configuration: "with_skill", repeats: 2 });
    const baselineEvidence = baselineHarness.evidence;
    let trainingEvidence = trainingHarness.evidence;
    let bestHarness = initialBestHarness;
    let bestEvidence = bestHarness.evidence;
    let blindResult = await runBlindHarnessComparison(baselineHarness, bestHarness);
    let comparisonRevision = skillBundleRevision(bestFiles);
    let comparisonStage: GenerationLoopState["comparisonStage"] = "initial";

    const baselineMetrics = summarizeGenerationEvidence(baselineEvidence);
    let bestMetrics = summarizeGenerationEvidence(bestEvidence);
    const initialBlindWinner = blindResult.revealedWinner === "left" ? "baseline" : blindResult.revealedWinner === "tie" ? "tie" : "candidate";
    const initialComparison = compareHarnessBenchmarks(baselineHarness, bestHarness, initialBlindWinner);
    await durableOptimization?.complete("baseline", { metrics: baselineMetrics, contractDigest: baselineHarness.contract.digest });
    await durableOptimization?.complete("execute", { metrics: bestMetrics, runIds: initialBestHarness.executions.map((item) => item.runId) });
    await durableOptimization?.complete("grade", {
      winner: blindResult.revealedWinner,
      confidence: blindResult.confidence,
      evidence: blindResult.evidence,
    });
    setBusyPhaseIndex(6);
    showLoopBusy("三组任务证据已收齐，正在进入跨文件语义诊断");
    setGenerationLoop((current) => ({
      ...current,
      phase: "diagnose",
      baselineScore: baselineMetrics.score,
      bestScore: bestMetrics.score,
      // Public formal-comparison numbers come from the same frozen-case
      // comparison object that decides improved/equivalent/regressed. This
      // prevents the verdict and the visible scores from using two rulers.
      baselineQualityScore: initialComparison.baselineScore,
      bestQualityScore: initialComparison.skillScore,
      comparisonConfidence: blindResult.confidence,
      comparisonRevision,
      comparisonStage,
      comparisonCaseCount: selectionCases.length,
      comparisonVerdict: initialComparison.verdict,
      comparisonEvidence: initialComparison.cases,
      benchmarkSuiteCases: selectionCases,
      lift: initialComparison.lift,
      passRate: bestMetrics.passRate,
      contractDigest: bestHarness.contract.digest,
      benchmarkCases: selectionCases.length,
      benchmarkRepeatsPerCase: Math.min(baselineHarness.benchmark.repeatsPerCase, bestHarness.benchmark.repeatsPerCase),
      benchmarkRuns: baselineHarness.benchmark.runs + bestHarness.benchmark.runs,
      baselineStddev: baselineHarness.benchmark.repeatScoreStddev,
      bestStddev: bestHarness.benchmark.repeatScoreStddev,
      meanDurationMs: Math.round((baselineHarness.benchmark.meanDurationMs + bestHarness.benchmark.meanDurationMs) / 2),
      blindWinner: initialBlindWinner,
      stopReason: "隔离执行、上下文隔离评分和匿名 A/B 已完成，正在做跨文件语义闭环检查",
    }));
    const initialSemanticRaw = await callAI<unknown>("optimization-diagnose", {
      ...evidencePayload,
      skill: bestFiles,
      closureReport: { skillContract, capabilityClosure: bestClosure, staticIssues: initialStaticIssues, crossArtifactRegression: bestCrossArtifact },
      baselineEvidence,
      rolloutEvidence: { diagnostic: trainingEvidence, heldOut: bestEvidence },
    });
    const normalizedInitialSemantic = normalizeGenerationSemanticAudit(initialSemanticRaw);
    let bestSemantic = normalizedInitialSemantic ? reconcileSemanticAuditWithCompilerEvidence(normalizedInitialSemantic, bestFiles) : null;
    if (!bestSemantic) throw new Error("生成 Loop 没有完成多视角语义闭环检查");
    await durableOptimization?.complete("diagnose", {
      issueIds: bestSemantic.issues.map((item) => item.id),
      criticalIssueCount: bestSemantic.issues.filter((item) => item.priority === "P1").length,
    });
    let acceptedPatches = 0;
    let rejectedPatches = 0;
    const rejectedHistory: Array<{
      round: number;
      reason: string;
      files: string[];
      decisionId?: string;
      evidenceDigest?: string;
      textualFeedback?: OptimizationEvidenceReport["textualFeedback"];
      failedCases?: OptimizationEvidenceReport["failedCases"];
    }> = [];
    const recordGenerationDecision = (input: {
      round: number;
      accepted: boolean;
      targetFiles: Record<string, string>;
      baselineFiles: Record<string, string>;
      candidateFiles: Record<string, string>;
      contractDigest: string;
      runIds: string[];
      caseIds: string[];
      baselineScore: number | null;
      candidateScore: number | null;
      reasons: string[];
      regressions: string[];
      changedFiles: string[];
      evidence: OptimizationEvidenceReport;
      consumedDecisionIds?: string[];
    }) => {
      const entry = createDecisionLedgerEntry({
        id: `generation-${Date.now()}-${input.round}-${input.accepted ? "accepted" : "rollback"}`,
        source: "generation-loop",
        outcome: input.accepted ? "accepted" : "rolled-back",
        baselineRevision: skillBundleRevision(input.baselineFiles),
        candidateRevision: skillBundleRevision(input.candidateFiles),
        contractDigest: input.contractDigest,
        policy: { id: "generation-goal-gate", version: "2.7", mode: "bounded-patch" },
        evaluation: {
          runIds: input.runIds,
          caseIds: input.caseIds,
          baselineScore: input.baselineScore,
          candidateScore: input.candidateScore,
          delta: input.baselineScore === null || input.candidateScore === null ? null : input.candidateScore - input.baselineScore,
          regressions: input.regressions,
        },
        textualGradient: input.evidence.textualFeedback,
        failedCases: input.evidence.failedCases,
        decision: {
          reasons: input.reasons,
          changedFiles: input.changedFiles,
          rollbackReason: input.accepted ? "" : [...input.reasons, ...input.regressions].join("；"),
        },
        consumedDecisionIds: input.consumedDecisionIds || [],
      });
      return { files: appendDecisionLedgerEntry(input.targetFiles, entry), entry };
    };
    let stopReason = "达到自动优化上限，已保留当前最佳版本";
    const collectPipelineIssues = (semantic: GenerationSemanticAudit, closure: ReturnType<typeof auditCapabilityClosure>, crossArtifact: ReturnType<typeof auditCrossArtifactConsistency>, audit: ReturnType<typeof auditSkillFiles>, bundleValidation: BundleStaticValidation): PipelineIssue[] => [
      ...bundleIssuesToPipelineIssues(bundleValidation.issues),
      ...makeContractIssues(audit.blockers),
      ...crossArtifact.issues,
      ...closure.issues.map((item) => ({ id: item.id, priority: item.severity === "critical" ? "P1" as const : "P3" as const, type: item.type.toUpperCase().replaceAll("-", "_"), source: "closure" as const, evidence: item.detail, files: item.files, capabilityId: item.capabilityId })),
      ...semantic.issues.map((item) => ({ id: item.id, priority: item.priority, type: item.type, source: "semantic" as const, evidence: item.evidence, files: item.files, capabilityId: item.capabilityId || undefined })),
    ];
    const includeAnonymousBaselineEvidence = (issues: PipelineIssue[], comparison: typeof blindResult): PipelineIssue[] => comparison.revealedWinner === "left"
      ? [...issues, {
        id: "anonymous-baseline-preferred",
        priority: "P1" as const,
        type: "ANONYMOUS_BASELINE_PREFERRED",
        source: "semantic" as const,
        evidence: `匿名比较偏好无 Skill 基线。修复使当前 Skill 低于裸模型的具体行为差距：${comparison.evidence}`,
        files: ["SKILL.md"],
      }]
      : issues;
    const includeHeldOutFailureEvidence = (issues: PipelineIssue[], evidence: OptimizationEvidenceReport): PipelineIssue[] => [
      ...issues,
      ...evidence.failurePatterns.map((failure, index) => ({
        id: `heldout-assertion-${index + 1}`,
        priority: "P1" as const,
        type: "HELDOUT_ASSERTION_FAILURE",
        source: "semantic" as const,
        evidence: `独立保留任务的冻结断言失败，必须修复运行行为而不是放宽评测：${failure}`,
        files: ["SKILL.md"],
      })),
    ];
    let bestPipelineIssues = includeHeldOutFailureEvidence(includeAnonymousBaselineEvidence(collectPipelineIssues(bestSemantic, bestClosure, bestCrossArtifact, bestAudit, bestBundleValidation), blindResult), bestEvidence);

    const initialCritical = bestPipelineIssues.filter((item) => item.priority === "P0" || item.priority === "P1").length;
    let goalReached = generationGoalSatisfied({ evidence: bestMetrics, baseline: baselineMetrics, closureScore: bestClosure.score, blockers: bestAudit.blockers.length, criticalSemanticIssues: initialCritical })
      && blindResult.revealedWinner !== "left";
    if (goalReached) stopReason = "能力闭环、核心任务和增益门控均已通过；进入最终冗余检查";

    for (let round = 1; round <= GENERATION_GOAL_MAX_ROUNDS && !goalReached; round += 1) {
      setBusyPhaseIndex(7);
      showLoopBusy(`第 ${round} 轮：根据真实失败类型选择最小修改范围`);
      const issuePolicy = optimizationPolicyFor(bestPipelineIssues);
      if (issuePolicy.priority === "P0") {
        stopReason = "候选版本出现 P0：已停止语义优化，只保留当前最佳版本并返回静态修复";
        break;
      }
      const density = estimateDomainValueDensity(bestFiles);
      let researchDecision: unknown = null;
      if (issuePolicy.allowResearch && density.shouldResearch) {
        setGenerationLoop((current) => ({ ...current, phase: "diagnose", stopReason: `第 ${round} 轮：领域知识价值密度 ${density.score}，正在判断是否值得进入 Research Loop` }));
        const initialResearchRaw = await callAI<unknown>("optimization-research", {
          ...evidencePayload,
          skill: bestFiles,
          issues: issuePolicy.selected,
          domainValueDensity: density,
        });
        const initialResearch = normalizeOptimizationResearchDecision(initialResearchRaw);
        researchDecision = initialResearch;
        if (initialResearch.required && !initialResearch.availableSourcesSufficient && initialResearch.knowledgeGaps.length && mcpConnections.length > 0) {
          setGenerationLoop((current) => ({ ...current, phase: "diagnose", stopReason: `第 ${round} 轮：已定位 ${initialResearch.knowledgeGaps.length} 个具体知识缺口，正在调用只读 MCP 取证` }));
          showLoopBusy(`正在通过已授权 MCP 核对：${initialResearch.knowledgeGaps[0]}`);
          const mcpReport = await retrieveInternalMcpEvidence("optimization-research", initialResearch.knowledgeGaps, 3);
          if (mcpReport.sources.length) {
            const enrichedResearchRaw = await callAI<unknown>("optimization-research", {
              ...evidencePayload,
              skill: bestFiles,
              issues: issuePolicy.selected,
              domainValueDensity: density,
              researchSources: buildKnowledgeEvidencePayload(mcpReport.sources, 24_000),
              priorResearchDecision: initialResearch,
            });
            researchDecision = {
              ...normalizeOptimizationResearchDecision(enrichedResearchRaw),
              mcpEvidence: { sourceCount: mcpReport.sources.length, attempts: mcpReport.attempts },
            } satisfies OptimizationResearchDecision;
          } else {
            researchDecision = {
              ...initialResearch,
              mcpEvidence: { sourceCount: 0, attempts: mcpReport.attempts },
            } satisfies OptimizationResearchDecision;
          }
        }
      }
      setGenerationLoop((current) => ({ ...current, phase: "patch", rounds: round, acceptedPatches, rejectedPatches, issues: issuePolicy.selected.map((item) => item.evidence).slice(0, 8), stopReason: `第 ${round} 轮：Planner 正在做影响分析并生成有限 Patch Operations` }));
      let patchPlan: ReturnType<typeof normalizePatchPlan> = null;
      let planValidation: ReturnType<typeof validatePatchPlan> | null = null;
      let preparedPatch: ReturnType<typeof applyPatchPlan> | null = null;
      let canonicalCandidate: ReturnType<typeof applyCanonicalCandidate> | null = null;
      const requiredDecisionIds = rejectedHistory.flatMap((item) => item.decisionId ? [item.decisionId] : []);
      for (let planAttempt = 1; planAttempt <= PATCH_PLAN_MAX_ATTEMPTS; planAttempt += 1) {
        const patchRaw = await callAI<unknown>("optimization-patch-plan", {
          ...evidencePayload,
          skill: bestFiles,
          closureReport: { skillContract, capabilityClosure: bestClosure, crossArtifactRegression: bestCrossArtifact },
          issues: issuePolicy.selected,
          rolloutEvidence: { trainingEvidence, researchDecision },
          mutationBudget: DEFAULT_MUTATION_BUDGET,
          compilerProtectedArtifacts: ["evals/skill-ir.json", "evals/capability-manifest.json", ...(bestFiles["references/domain-playbook.md"] ? ["references/domain-playbook.md"] : [])],
          canonicalTargets: canonicalMutationTargetCatalog(bestFiles),
          rejectedHistory,
          planAttempt,
        });
        const normalizedPlan = normalizePatchPlan(patchRaw);
        if (!normalizedPlan) {
          const reason = `Planner 第 ${planAttempt} 次没有返回结构完整的 Patch Plan`;
          rejectedHistory.push({ round, reason, files: [] });
          reportClientGenerationLoopEvent("generation_loop_candidate", { phase: "replan", round, attempt: planAttempt, accepted: false, reason });
          continue;
        }
        const constrainedPlan = constrainPatchPlan({
          plan: normalizedPlan,
          files: bestFiles,
          budget: DEFAULT_MUTATION_BUDGET,
          protectedArtifacts: ["evals/skill-ir.json", "evals/capability-manifest.json", ...(bestFiles["references/domain-playbook.md"] ? ["references/domain-playbook.md"] : [])],
        });
        const validation = validatePatchPlan({
          plan: constrainedPlan,
          issues: bestPipelineIssues,
          files: bestFiles,
          capabilities: generationPlan.items,
          budget: DEFAULT_MUTATION_BUDGET,
          requiredDecisionIds,
        });
        if (validation.valid && (constrainedPlan.operations.length || constrainedPlan.canonicalMutations.length)) {
          try {
            preparedPatch = applyPatchPlan(bestFiles, constrainedPlan);
          } catch (error) {
            const reason = `Planner 第 ${planAttempt} 次的修改锚点无法唯一定位：${error instanceof Error ? error.message : "无法应用 Patch"}`;
            rejectedHistory.push({ round, reason, files: validation.changedPaths });
            reportClientGenerationLoopEvent("generation_loop_candidate", { phase: "replan", round, attempt: planAttempt, accepted: false, updatedPaths: validation.changedPaths, reason });
            setGenerationLoop((current) => ({ ...current, phase: "patch", stopReason: `第 ${round} 轮：修改锚点不稳定，正在自动重规划（${planAttempt}/${PATCH_PLAN_MAX_ATTEMPTS}）` }));
            continue;
          }
          try {
            canonicalCandidate = applyCanonicalCandidate({
              currentFiles: bestFiles,
              rawMutations: constrainedPlan.canonicalMutations,
              implementationFiles: Object.fromEntries(preparedPatch.changedPaths.map((path) => [path, preparedPatch?.files[path] || ""])),
              idea,
              answers: evaluationAnswers,
              sourceEvidence: sourceInsightText,
              capabilityPlan: generationPlan,
              loopPlan,
            });
            if (!canonicalCandidate.materialDiff) {
              const attempted = JSON.stringify(canonicalCandidate.mutations).slice(0, 1_800);
              throw new Error(`CanonicalMutation 经投影后没有产生语义变化；本次提案=${attempted}。下一次必须修改不同的 canonical 字段或写入与当前值不同的新值`);
            }
          } catch (error) {
            const reason = `Planner 第 ${planAttempt} 次未通过 Canonical IR 检查：${error instanceof Error ? error.message : "CanonicalMutation 无法应用"}`;
            rejectedHistory.push({ round, reason, files: validation.changedPaths });
            reportClientGenerationLoopEvent("generation_loop_candidate", { phase: "replan", round, attempt: planAttempt, accepted: false, updatedPaths: validation.changedPaths, reason });
            setGenerationLoop((current) => ({ ...current, phase: "patch", stopReason: `第 ${round} 轮：Canonical Mutation 无效，正在携带失败证据重规划（${planAttempt}/${PATCH_PLAN_MAX_ATTEMPTS}）` }));
            preparedPatch = null;
            canonicalCandidate = null;
            continue;
          }
          patchPlan = constrainedPlan;
          planValidation = validation;
          if (constrainedPlan.operations.length < normalizedPlan.operations.length) {
            reportClientGenerationLoopEvent("generation_loop_candidate", { phase: "impact-narrowed", round, attempt: planAttempt, accepted: true, updatedPaths: validation.changedPaths, reason: `编译器已自动移除保护文件或预算外操作，从 ${normalizedPlan.operations.length} 个操作收窄为 ${constrainedPlan.operations.length} 个` });
          }
          break;
        }
        const errors = validation.errors.length ? validation.errors : ["收窄后没有可执行操作"];
        const reason = `Planner 第 ${planAttempt} 次未通过影响分析：${errors.join("；")}`;
        rejectedHistory.push({ round, reason, files: validation.changedPaths });
        reportClientGenerationLoopEvent("generation_loop_candidate", { phase: "replan", round, attempt: planAttempt, accepted: false, updatedPaths: validation.changedPaths, reason });
        setGenerationLoop((current) => ({ ...current, phase: "patch", stopReason: `第 ${round} 轮：Patch Plan 不安全，正在自动缩小并重规划（${planAttempt}/${PATCH_PLAN_MAX_ATTEMPTS}）` }));
      }
      if (!patchPlan || !planValidation?.valid || !preparedPatch || !canonicalCandidate) {
        rejectedPatches += 1;
        stopReason = `Planner 已自动重规划 ${PATCH_PLAN_MAX_ATTEMPTS} 次，仍没有落在安全修改面内；已保留当前可用版本`;
        reportClientGenerationLoopEvent("generation_loop_candidate", { phase: "impact", round, accepted: false, reason: stopReason });
        break;
      }
      const applied = preparedPatch;
      const candidateFiles = canonicalCandidate.files;
      const candidateChangedPaths = [...new Set([...canonicalCandidate.changedTargets, ...applied.changedPaths])];
      const candidateBundleValidation = await validateBundle(candidateFiles);
      if (!candidateBundleValidation.executionReady) {
        rejectedPatches += 1;
        const reason = `候选版本产生 P0 执行阻断，已在语义与 Eval 前自动回滚：${candidateBundleValidation.issues.filter((issue) => issue.priority === "P0").map((issue) => issue.message).join("；")}`;
        rejectedHistory.push({ round, reason, files: [...canonicalCandidate.changedTargets, ...applied.changedPaths] });
        reportClientGenerationLoopEvent("generation_loop_candidate", { phase: "static-regression", round, accepted: false, updatedPaths: [...canonicalCandidate.changedTargets, ...applied.changedPaths], reason });
        continue;
      }
      const candidateClosure = collectP1ContractState(candidateFiles, evaluationAnswers, generationPlan, candidateBundleValidation).closure;
      const candidateAudit = auditSkillFiles(candidateFiles, evaluationAnswers);
      const candidateCrossArtifact = auditCrossArtifactConsistency(candidateFiles);
      const candidateStaticPolicy = optimizationPolicyFor([...makeContractIssues(candidateAudit.blockers), ...candidateCrossArtifact.issues]);
      if (candidateStaticPolicy.priority === "P0") {
        rejectedPatches += 1;
        const reason = `候选版本产生 P0，已在语义评测前回滚：${candidateStaticPolicy.selected.map((item) => item.evidence).join("；")}`;
        rejectedHistory.push({ round, reason, files: candidateChangedPaths });
        reportClientGenerationLoopEvent("generation_loop_candidate", { phase: "static-regression", round, accepted: false, updatedPaths: candidateChangedPaths, reason });
        continue;
      }

      setBusyPhaseIndex(8);
      showLoopBusy(`第 ${round} 轮候选已生成，正在用独立任务验证是否真的变好`);
      setGenerationLoop((current) => ({ ...current, phase: "validate", stopReason: `第 ${round} 轮：正在运行 Static、Capability、Cross-artifact 与 Behavior Regression` }));
      let candidateTrainingHarness: HarnessReport;
      let candidateHarness: HarnessReport;
      try {
        candidateTrainingHarness = await runIsolatedEvalHarness({ cases: trainCases, skillFiles: candidateFiles, configuration: "candidate", repeats: 1 });
        candidateHarness = await runIsolatedEvalHarness({ cases: selectionCases, skillFiles: candidateFiles, configuration: "candidate", repeats: 2 });
      } catch {
        rejectedPatches += 1;
        rejectedHistory.push({ round, reason: "候选版本未完成全部诊断任务或独立保留任务", files: candidateChangedPaths });
        reportClientGenerationLoopEvent("generation_loop_candidate", { phase: "validate", round, accepted: false, updatedPaths: candidateChangedPaths, reason: "候选证据不完整" });
        continue;
      }
      const candidateEvidence = candidateHarness.evidence;
      const candidateTrainingEvidence = candidateTrainingHarness.evidence;
      const candidateSemanticRaw = await callAI<unknown>("optimization-diagnose", {
        ...evidencePayload,
        skill: candidateFiles,
        closureReport: { skillContract, capabilityClosure: candidateClosure, staticIssues: makeContractIssues(candidateAudit.blockers), crossArtifactRegression: candidateCrossArtifact },
        baselineEvidence,
        rolloutEvidence: { diagnostic: candidateTrainingEvidence, heldOut: candidateEvidence },
      });
      const normalizedCandidateSemantic = normalizeGenerationSemanticAudit(candidateSemanticRaw);
      const candidateSemantic = normalizedCandidateSemantic ? reconcileSemanticAuditWithCompilerEvidence(normalizedCandidateSemantic, candidateFiles) : null;
      if (!candidateSemantic) {
        rejectedPatches += 1;
        const reason = "候选版本语义闭环检查不完整";
        const recorded = recordGenerationDecision({
          round,
          accepted: false,
          targetFiles: bestFiles,
          baselineFiles: bestFiles,
          candidateFiles,
          contractDigest: candidateHarness.contract.digest,
          runIds: candidateHarness.executions.map((item) => item.runId),
          caseIds: selectionCases.map((item) => item.id),
          baselineScore: bestMetrics.score,
          candidateScore: summarizeGenerationEvidence(candidateEvidence).score,
          reasons: [reason],
          regressions: [],
          changedFiles: candidateChangedPaths,
          evidence: candidateEvidence,
          consumedDecisionIds: patchPlan.consumedDecisionIds,
        });
        bestFiles = recorded.files;
        rejectedHistory.push({
          round,
          reason,
          files: candidateChangedPaths,
          decisionId: recorded.entry.id,
          evidenceDigest: recorded.entry.evidenceDigest,
          textualFeedback: candidateEvidence.textualFeedback,
          failedCases: candidateEvidence.failedCases,
        });
        reportClientGenerationLoopEvent("generation_loop_candidate", { phase: "diagnose", round, accepted: false, updatedPaths: candidateChangedPaths, reason: "候选语义检查不完整" });
        continue;
      }
      const candidatePipelineIssues = includeHeldOutFailureEvidence(collectPipelineIssues(candidateSemantic, candidateClosure, candidateCrossArtifact, candidateAudit, candidateBundleValidation), candidateEvidence);
      const gate = decideGenerationGoalGate({
        baseline: bestEvidence,
        candidate: candidateEvidence,
        caseIds: selectionCases.map((item) => item.id),
        baselineClosure: bestClosure.score,
        candidateClosure: candidateClosure.score,
        baselineBlockers: bestAudit.blockers.length,
        candidateBlockers: candidateAudit.blockers.length,
        baselineCriticalSemanticIssues: bestPipelineIssues.filter((item) => item.priority === "P0" || item.priority === "P1").length,
        candidateCriticalSemanticIssues: candidatePipelineIssues.filter((item) => item.priority === "P0" || item.priority === "P1").length,
      });
      const candidateBlind = await runBlindHarnessComparison(bestHarness, candidateHarness);
      if (candidateBlind.revealedWinner === "left") gate.reasons.push(`匿名 A/B 更偏好当前最佳版本：${candidateBlind.evidence}`);
      gate.accepted = gate.reasons.length === 0;
      const newFiles = applied.changedPaths.filter((path) => !(path in bestFiles)).length;
      const tokenDelta = Object.values(candidateFiles).join("\n").length - Object.values(bestFiles).join("\n").length;
      const utility = candidateUtility({ qualityGain: gate.scoreDelta, regressionCount: gate.regressions.length + Math.max(0, candidateCrossArtifact.issues.length - bestCrossArtifact.issues.length), changedFiles: candidateChangedPaths.length, newFiles, tokenDelta });
      if (!gate.accepted || utility <= 0) {
        rejectedPatches += 1;
        const reason = [...gate.reasons, ...gate.regressions, ...(utility <= 0 ? [`综合效用 ${utility} 未覆盖回归、复杂度和 token 成本`] : [])].join("；");
        const candidateMetrics = summarizeGenerationEvidence(candidateEvidence);
        const recorded = recordGenerationDecision({
          round,
          accepted: false,
          targetFiles: bestFiles,
          baselineFiles: bestFiles,
          candidateFiles,
          contractDigest: candidateHarness.contract.digest,
          runIds: candidateHarness.executions.map((item) => item.runId),
          caseIds: selectionCases.map((item) => item.id),
          baselineScore: bestMetrics.score,
          candidateScore: candidateMetrics.score,
          reasons: gate.reasons.length ? gate.reasons : [reason],
          regressions: [...gate.regressions, ...(utility <= 0 ? [`综合效用 ${utility} 未覆盖修改成本`] : [])],
          changedFiles: candidateChangedPaths,
          evidence: candidateEvidence,
          consumedDecisionIds: patchPlan.consumedDecisionIds,
        });
        bestFiles = recorded.files;
        rejectedHistory.push({
          round,
          reason,
          files: candidateChangedPaths,
          decisionId: recorded.entry.id,
          evidenceDigest: recorded.entry.evidenceDigest,
          textualFeedback: candidateEvidence.textualFeedback,
          failedCases: candidateEvidence.failedCases,
        });
        reportClientGenerationLoopEvent("generation_loop_candidate", { phase: "validate", round, accepted: false, updatedPaths: candidateChangedPaths, reason, utility });
        continue;
      }

      let acceptedBaselineBlind = blindResult;
      let acceptedBaselineComparisonFresh = false;
      try {
        acceptedBaselineBlind = await runBlindHarnessComparison(baselineHarness, candidateHarness);
        acceptedBaselineComparisonFresh = true;
      } catch {
        reportClientGenerationLoopEvent("generation_loop_candidate", { phase: "compare", round, accepted: true, updatedPaths: candidateChangedPaths, reason: "候选相对当前最佳已通过；无 Skill 基线复核暂时不可用，保留上一轮基线证据" });
      }
      const acceptedDecision = recordGenerationDecision({
        round,
        accepted: true,
        targetFiles: candidateFiles,
        baselineFiles: bestFiles,
        candidateFiles,
        contractDigest: candidateHarness.contract.digest,
        runIds: candidateHarness.executions.map((item) => item.runId),
        caseIds: selectionCases.map((item) => item.id),
        baselineScore: bestMetrics.score,
        candidateScore: summarizeGenerationEvidence(candidateEvidence).score,
        reasons: [`独立保留任务提升 ${gate.scoreDelta} 分`, `综合效用 ${utility}`],
        regressions: gate.regressions,
        changedFiles: candidateChangedPaths,
        evidence: candidateEvidence,
        consumedDecisionIds: patchPlan.consumedDecisionIds,
      });
      bestFiles = acceptedDecision.files;
      bestBundleValidation = candidateBundleValidation;
      bestClosure = candidateClosure;
      bestAudit = candidateAudit;
      bestEvidence = candidateEvidence;
      bestHarness = candidateHarness;
      blindResult = acceptedBaselineBlind;
      if (acceptedBaselineComparisonFresh) {
        comparisonRevision = skillBundleRevision(bestFiles);
        comparisonStage = "optimized";
      }
      bestSemantic = candidateSemantic;
      bestPipelineIssues = includeAnonymousBaselineEvidence(candidatePipelineIssues, blindResult);
      bestCrossArtifact = candidateCrossArtifact;
      trainingEvidence = candidateTrainingEvidence;
      bestMetrics = summarizeGenerationEvidence(bestEvidence);
      acceptedPatches += 1;
      reportClientGenerationLoopEvent("generation_loop_candidate", { phase: "validate", round, accepted: true, updatedPaths: candidateChangedPaths, beforeCount: bestMetrics.score - gate.scoreDelta, afterCount: bestMetrics.score, reason: `独立保留任务提升 ${gate.scoreDelta} 分；综合效用 ${utility}`, utility });
      setFiles(bestFiles);
      const criticalIssues = bestPipelineIssues.filter((item) => item.priority === "P0" || item.priority === "P1").length;
      if (generationGoalSatisfied({ evidence: bestMetrics, baseline: baselineMetrics, closureScore: bestClosure.score, blockers: bestAudit.blockers.length, criticalSemanticIssues: criticalIssues })) {
        stopReason = "候选版本通过能力闭环、Skill Lift 与独立回归门控";
        goalReached = true;
        break;
      }
    }

    setBusyPhaseIndex(9);
    showLocalBusy("正在删除重复声明和不可达内容；任何质量退化都会自动保留原版");
    const rawPruneResult = pruneBundleDeterministically(bestFiles);
    const projectedPrunedFiles = finalizeSkillFiles(
      rawPruneResult.files,
      idea,
      evaluationAnswers,
      contextBundle,
      generationPlan,
      loopPlan,
      parseCanonicalSkillIR(bestFiles) || undefined,
    );
    const projectedPrunePaths = Object.keys({ ...bestFiles, ...projectedPrunedFiles }).filter((path) => bestFiles[path] !== projectedPrunedFiles[path]);
    const pruneResult = {
      files: projectedPrunedFiles,
      changedPaths: projectedPrunePaths,
      deletedPaths: rawPruneResult.deletedPaths.filter((path) => !(path in projectedPrunedFiles)),
    };
    if (pruneResult.changedPaths.length) {
      setGenerationLoop((current) => ({ ...current, phase: "validate", stopReason: "精简冗余：正在验证删减候选，不会直接覆盖当前最佳版本" }));
      const prunedFiles = pruneResult.files;
      const prunedAudit = auditSkillFiles(prunedFiles, evaluationAnswers);
      const prunedClosure = auditCapabilityClosure(prunedFiles, generationPlan.items);
      const prunedCrossArtifact = auditCrossArtifactConsistency(prunedFiles);
      const prunedBundleValidation = await validateBundle(prunedFiles);
      const pruneStaticPolicy = optimizationPolicyFor([...bundleIssuesToPipelineIssues(prunedBundleValidation.issues), ...makeContractIssues(prunedAudit.blockers), ...prunedCrossArtifact.issues]);
      if (prunedBundleValidation.executionReady && pruneStaticPolicy.priority !== "P0") {
        const prunedHarness = await runIsolatedEvalHarness({ cases: selectionCases, skillFiles: prunedFiles, configuration: "candidate", repeats: 2 });
        const prunedEvidence = prunedHarness.evidence;
        if (prunedEvidence) {
          const prunedMetrics = summarizeGenerationEvidence(prunedEvidence);
          const beforeById = new Map(bestEvidence.cases.map((item) => [item.caseId, item]));
          const behaviorRegressions = prunedEvidence.cases.filter((item) => {
            const before = beforeById.get(item.caseId);
            return Boolean(before && ((before.passed && !item.passed) || item.score < before.score - 5));
          });
          const pruningSafe = behaviorRegressions.length === 0
            && prunedMetrics.score >= bestMetrics.score - 1
            && prunedMetrics.passRate >= bestMetrics.passRate
            && prunedClosure.score >= bestClosure.score
            && prunedAudit.blockers.length <= bestAudit.blockers.length
            && prunedCrossArtifact.issues.length <= bestCrossArtifact.issues.length;
          const pruneBlind = pruningSafe ? await runBlindHarnessComparison(bestHarness, prunedHarness) : null;
          if (pruningSafe && pruneBlind?.revealedWinner !== "left") {
            bestFiles = prunedFiles;
            bestBundleValidation = prunedBundleValidation;
            bestAudit = prunedAudit;
            bestClosure = prunedClosure;
            bestCrossArtifact = prunedCrossArtifact;
            bestEvidence = prunedEvidence;
            bestHarness = prunedHarness;
            bestMetrics = prunedMetrics;
            bestPipelineIssues = includeHeldOutFailureEvidence(includeAnonymousBaselineEvidence(collectPipelineIssues(bestSemantic, bestClosure, bestCrossArtifact, bestAudit, bestBundleValidation), blindResult), bestEvidence);
            acceptedPatches += 1;
            stopReason = `${stopReason}；精简冗余已安全删除 ${pruneResult.deletedPaths.length} 个文件并去除 ${pruneResult.changedPaths.length - pruneResult.deletedPaths.length} 处重复声明`;
            reportClientGenerationLoopEvent("generation_loop_candidate", { phase: "delete-pass", accepted: true, updatedPaths: pruneResult.changedPaths, reason: "完整回归无退化，接受删减版本" });
          } else {
            stopReason = `${stopReason}；精简候选会影响既有能力，已自动回滚并保留当前最佳版本`;
            reportClientGenerationLoopEvent("generation_loop_candidate", { phase: "delete-pass", accepted: false, updatedPaths: pruneResult.changedPaths, reason: "删减版本未通过完整回归，已回滚" });
          }
        }
      }
    } else {
      stopReason = `${stopReason}；精简检查通过，没有发现可安全删除的重复或无效内容`;
    }

    // The public comparison must describe the exact final Bundle. Candidate
    // acceptance and the minimality pass can both change the canonical
    // revision after the first A/B run; never surface scores from an older
    // projection as if they belonged to the final files.
    const finalBundleRevision = skillBundleRevision(bestFiles);
    if (comparisonRevision !== finalBundleRevision) {
      try {
        blindResult = await runBlindHarnessComparison(baselineHarness, bestHarness);
        comparisonRevision = finalBundleRevision;
        comparisonStage = acceptedPatches > 0 ? "post-prune" : "optimized";
        reportClientGenerationLoopEvent("generation_loop_phase", { phase: "final-compare", accepted: true, reason: `匿名对照已绑定最终 Bundle ${finalBundleRevision.slice(0, 12)}` });
      } catch (error) {
        reportClientGenerationLoopEvent("generation_loop_phase", { phase: "final-compare", accepted: false, reason: `最终 Bundle 对照未完成：${error instanceof Error ? error.message : "未知错误"}` });
      }
    }

    const remainingCritical = bestPipelineIssues.filter((item) => item.priority === "P0" || item.priority === "P1").length;
    const comparisonIsCurrent = comparisonRevision === finalBundleRevision;
    const finalBlindWinner = blindResult.revealedWinner === "left" ? "baseline" : blindResult.revealedWinner === "tie" ? "tie" : "candidate";
    const finalComparison = compareHarnessBenchmarks(baselineHarness, bestHarness, finalBlindWinner);
    const qualityGoalSatisfied = generationGoalSatisfied({ evidence: bestMetrics, baseline: baselineMetrics, closureScore: bestClosure.score, blockers: bestAudit.blockers.length, criticalSemanticIssues: remainingCritical });
    const passed = comparisonIsCurrent && qualityGoalSatisfied && blindResult.revealedWinner !== "left";
    const stableAtCeiling = comparisonIsCurrent && !passed && blindResult.revealedWinner === "tie" && generationEvaluationAtCeiling({
      evidence: bestMetrics,
      baseline: baselineMetrics,
      closureScore: bestClosure.score,
      blockers: bestAudit.blockers.length,
      criticalSemanticIssues: remainingCritical,
    });
    const remainingIssues = [
      ...(baselineMetrics.score === 100 && bestMetrics.score === 100 && blindResult.revealedWinner !== "tie"
        ? ["绝对断言评分已触顶，但匿名质量比较仍能区分结果；当前 Eval 存在低区分度断言，不能把 100 分解释为满分质量"]
        : []),
      ...(blindResult.revealedWinner === "left" ? [`匿名结果比较仍更偏好无 Skill 基线：${blindResult.evidence}`] : []),
      ...optimizationPolicyFor(bestPipelineIssues).selected.map((item) => `${item.priority} · ${item.evidence}`),
      ...bestEvidence.failurePatterns.map((item) => `保留任务 · ${item}`),
      ...trainingEvidence.failurePatterns,
    ].filter(Boolean).slice(0, 8);
    const state: GenerationLoopState = {
      ...DEFAULT_GENERATION_LOOP,
      status: passed ? "passed" : stableAtCeiling ? "stable" : "attention",
      phase: "complete",
      rounds: Math.min(GENERATION_GOAL_MAX_ROUNDS, acceptedPatches + rejectedPatches),
      baselineScore: baselineMetrics.score,
      bestScore: bestMetrics.score,
      baselineQualityScore: finalComparison.baselineScore,
      bestQualityScore: finalComparison.skillScore,
      comparisonConfidence: blindResult.confidence,
      comparisonRevision,
      comparisonStage,
      comparisonCaseCount: selectionCases.length,
      comparisonVerdict: comparisonIsCurrent ? finalComparison.verdict : "not-run",
      comparisonEvidence: comparisonIsCurrent ? finalComparison.cases : [],
      benchmarkSuiteCases: selectionCases,
      lift: finalComparison.lift,
      passRate: bestMetrics.passRate,
      closureScore: bestClosure.score,
      acceptedPatches,
      rejectedPatches,
      contractDigest: bestHarness.contract.digest,
      benchmarkCases: selectionCases.length,
      benchmarkRepeatsPerCase: Math.min(baselineHarness.benchmark.repeatsPerCase, bestHarness.benchmark.repeatsPerCase),
      benchmarkRuns: baselineHarness.benchmark.runs + bestHarness.benchmark.runs,
      baselineStddev: baselineHarness.benchmark.repeatScoreStddev,
      bestStddev: bestHarness.benchmark.repeatScoreStddev,
      meanDurationMs: Math.round((baselineHarness.benchmark.meanDurationMs + bestHarness.benchmark.meanDurationMs) / 2),
      blindWinner: finalBlindWinner,
      minimalityChecked: true,
      issues: remainingIssues,
      stopReason: stableAtCeiling
        ? "冻结断言评测已完整跑完并触顶，匿名逐项质量比较结果接近；新候选没有证明额外提升，系统已回滚并保留当前最佳版本。"
        : passed
          ? stopReason
          : remainingIssues.length ? `${stopReason}；仍有需要观察的问题` : stopReason,
    };
    showLocalBusy("精简检查已完成，正在固定通过验证的最佳版本");
    await durableOptimization?.complete("mutate", { acceptedPatches, rejectedPatches });
    await durableOptimization?.complete("regression", {
      baselineScore: baselineMetrics.score,
      bestScore: bestMetrics.score,
      passRate: bestMetrics.passRate,
      remainingIssues,
    });
    await durableOptimization?.complete("commit", {
      outcome: state.status,
      revision: finalBundleRevision,
      acceptedPatches,
      rejectedPatches,
    });
    setGenerationLoop(state);
    reportClientGenerationLoopEvent("generation_loop_finished", { phase: "complete", round: state.rounds, accepted: state.status === "passed", beforeCount: state.baselineScore, afterCount: state.bestScore, reason: state.stopReason });
    notifyGenerationLoopResult(state);
    return { files: bestFiles, state };
  }
  /* eslint-enable react-hooks/immutability */

  async function retrieveInternalMcpEvidence(
    phase: InternalMcpEvidenceReport["phase"],
    queries: string[],
    maxCalls = 3,
  ): Promise<InternalMcpEvidenceReport> {
    const empty: InternalMcpEvidenceReport = { phase, sources: [], attempts: [], connectionsScanned: 0, toolsDiscovered: 0 };
    const normalizedQueries = Array.from(new Set(queries.map((item) => item.trim()).filter(Boolean))).slice(0, 4);
    // MCP is an optional side branch. With no successfully discovered
    // connection, preserve the pre-MCP workflow exactly: do not call the API,
    // start a timeout, write a receipt, or affect Knowledge/Optimization state.
    if (!normalizedQueries.length || !mcpConnections.length) return empty;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 32_000);
    try {
      const response = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "collect-evidence", phase, queries: normalizedQueries, maxCalls }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as Partial<InternalMcpEvidenceReport> & { error?: string };
      if (!response.ok) throw new Error(payload.error || `MCP evidence failed (${response.status})`);
      const report: InternalMcpEvidenceReport = {
        phase,
        sources: normalizeRetrievedSources(payload.sources),
        attempts: Array.isArray(payload.attempts) ? payload.attempts : [],
        connectionsScanned: Number(payload.connectionsScanned || 0),
        toolsDiscovered: Number(payload.toolsDiscovered || 0),
      };
      setInternalMcpEvidenceReports((current) => ({
        ...current,
        [phase]: mergeInternalMcpEvidenceReports(current[phase], report),
      }));
      reportClientGenerationLoopEvent("generation_loop_phase", {
        phase: `mcp-${phase}`,
        accepted: report.sources.length > 0,
        beforeCount: report.connectionsScanned,
        afterCount: report.sources.length,
        reason: report.sources.length
          ? `MCP Evidence Router 通过 ${report.attempts.filter((item) => item.status === "completed").length} 次只读调用取得 ${report.sources.length} 份证据`
          : "已检查可用 MCP，但没有取得可编译证据；继续使用其他来源或安全降级",
      });
      return report;
    } catch (error) {
      const reason = error instanceof Error && error.name === "AbortError" ? "内部 MCP 取证超过 32 秒" : error instanceof Error ? error.message : "内部 MCP 取证失败";
      const failedReport: InternalMcpEvidenceReport = { ...empty, error: reason };
      setInternalMcpEvidenceReports((current) => ({
        ...current,
        [phase]: mergeInternalMcpEvidenceReports(current[phase], failedReport),
      }));
      reportClientGenerationLoopEvent("generation_loop_failed", {
        phase: `mcp-${phase}`,
        reason,
      });
      return empty;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function runBuildTimeKnowledgeCompiler(basePlan: CapabilityPlan): Promise<KnowledgePack> {
    setBuildLoop((current) => ({ ...current, status: "checking", phase: "knowledge" }));
    setInternalMcpEvidenceReports((current) => ({ ...current, "knowledge-compile": undefined }));
    showLoopBusy("正在判断哪些领域知识能真正改变 Skill 的专业判断与工作分支");
    const rawPlan = await callAI<unknown>("knowledge-plan", {
      idea,
      sourceText: contextBundle,
      answers: interviewEvidence,
      capabilityPlan: basePlan,
    });
    const plan = normalizeKnowledgePlan(rawPlan);
    const workflowMcpEnabled = mcpConnections.length > 0;
    if (!plan.required) {
      const skipped: KnowledgePack = {
        ...EMPTY_KNOWLEDGE_PACK,
        status: "not-needed",
        summary: plan.reason || "现有用户资料和模型能力已经足够，不额外制造领域知识文件",
        plan,
        generatedAt: new Date().toISOString(),
      };
      setKnowledgePack(skipped);
      return skipped;
    }
    const researching: KnowledgePack = {
      ...EMPTY_KNOWLEDGE_PACK,
      status: "researching",
      summary: `正在围绕 ${plan.domain} 通过${workflowMcpEnabled ? `已授权 MCP${researchReady ? "与" : ""}` : ""}${researchReady ? "网页检索" : workflowMcpEnabled ? "" : "现有资料"}核对 ${plan.queries.length} 个专业问题`,
      plan,
      generatedAt: new Date().toISOString(),
    };
    setKnowledgePack(researching);
    setBusyExecutionKind("loop");
    setBusyExecutionNote(workflowMcpEnabled
      ? `正在查询已授权的专业知识 MCP：${plan.queries[0] || plan.knowledgeGaps[0]}`
      : researchReady
        ? `正在检索专业知识：${plan.queries[0] || plan.knowledgeGaps[0]}`
        : "正在根据现有资料整理专业判断");
    try {
      const mcpReport = workflowMcpEnabled
        ? await retrieveInternalMcpEvidence("knowledge-compile", plan.queries, 3)
        : { phase: "knowledge-compile" as const, sources: [], attempts: [], connectionsScanned: 0, toolsDiscovered: 0 };
      let sources = mcpReport.sources;
      let webResearchIssue = "";
      if (researchReady) {
        setBusyExecutionNote(workflowMcpEnabled
          ? `MCP 已返回 ${mcpReport.sources.length} 份证据，正在补充网页一手来源`
          : "正在读取并筛选网页一手来源");
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 58_000);
        try {
          const response = await fetch("/api/research", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: researchProvider,
              apiKey: researchApiKey,
              baseUrl: researchBaseUrl || RESEARCH_PROVIDERS[researchProvider].baseUrl,
              queries: plan.queries,
            }),
            signal: controller.signal,
          });
          const rawResponse = await response.text();
          let payload: { sources?: unknown; error?: string } = {};
          try { payload = JSON.parse(rawResponse) as { sources?: unknown; error?: string }; } catch { /* handled below */ }
          if (!response.ok) throw new Error(payload.error || `专业知识检索失败（${response.status}）`);
          sources = dedupeResearchSources([...sources, ...normalizeRetrievedSources(payload.sources)], 18);
        } catch (error) {
          webResearchIssue = error instanceof Error && error.name === "AbortError" ? "网页检索超过 58 秒" : error instanceof Error ? error.message : "网页检索失败";
          if (!sources.length) throw error;
        } finally {
          window.clearTimeout(timeout);
        }
      }
      if (!sources.length) {
        throw new Error(researchReady
          ? workflowMcpEnabled
            ? "MCP 与网页结果均缺少可用于编译的正文和来源地址"
            : "网页结果缺少可用于编译的正文和来源地址"
          : workflowMcpEnabled
            ? "已连接的 MCP 没有返回可编译证据，网页检索也未配置；不会把模型常识伪装成来源知识"
            : "网页检索未配置；不会把模型常识伪装成来源知识");
      }

      const compiling: KnowledgePack = { ...researching, status: "compiling", sources, summary: `已取得 ${sources.length} 个来源${workflowMcpEnabled ? `（MCP ${mcpReport.sources.length}）` : ""}，正在提炼会改变 Skill 行为的专业规则${webResearchIssue ? `；网页补充未完成：${webResearchIssue}` : ""}` };
      setKnowledgePack(compiling);
      setBusyExecutionNote(`已读取 ${sources.length} 个来源，正在核对适用条件、例外和失败处理`);
      let evidencePayload = buildKnowledgeEvidencePayload(sources);
      const compiled = await callAI<unknown>("knowledge-compile", {
        idea,
        answers: interviewEvidence,
        knowledgePlan: plan,
        researchSources: evidencePayload,
      });
      let pack = reconcileKnowledgePackContentPermission(normalizeKnowledgePack({ raw: compiled, plan, sources }), interviewEvidence);
      reportClientGenerationLoopEvent("generation_loop_phase", {
        phase: "knowledge-validation",
        beforeCount: pack.diagnostics.candidateCount,
        afterCount: pack.atoms.length,
        blockers: pack.rejected.slice(-8),
        reason: pack.diagnostics.validatorRejectedCount
          ? `首轮 ${pack.diagnostics.candidateCount} 条候选中有 ${pack.diagnostics.validatorRejectedCount} 条未通过本地编译校验`
          : `首轮形成 ${pack.atoms.length} 条可追溯规则`,
      });
      const densityGate = knowledgePackNeedsExpansion(pack);
      if (densityGate.needsExpansion) {
        const needsCompilerRepair = pack.diagnostics.validatorRejectedCount > 0;
        setBusyExecutionKind("loop");
        setBusyExecutionNote(needsCompilerRepair
          ? `${densityGate.reason}；来源已经足够，正在根据校验原因自动重写不合格候选`
          : `${densityGate.reason}，正在针对未覆盖维度补搜更高权威来源`);
        try {
          const followupQueries = needsCompilerRepair ? [] : buildFollowupResearchQueries(plan, densityGate.missingDimensions);
          if (followupQueries.length > 0) {
            if (workflowMcpEnabled) {
              const followupMcp = await retrieveInternalMcpEvidence("knowledge-compile", followupQueries, 2);
              sources = dedupeResearchSources([...sources, ...followupMcp.sources], 18);
            }
            if (researchReady) {
              const followupController = new AbortController();
              const followupTimeout = window.setTimeout(() => followupController.abort(), 45_000);
              try {
                const followupResponse = await fetch("/api/research", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    provider: researchProvider,
                    apiKey: researchApiKey,
                    baseUrl: researchBaseUrl || RESEARCH_PROVIDERS[researchProvider].baseUrl,
                    queries: followupQueries,
                  }),
                  signal: followupController.signal,
                });
                if (followupResponse.ok) {
                  const followupPayload = await followupResponse.json() as { sources?: unknown };
                  sources = dedupeResearchSources([...sources, ...normalizeRetrievedSources(followupPayload.sources)], 18);
                }
              } finally {
                window.clearTimeout(followupTimeout);
              }
            }
            evidencePayload = buildKnowledgeEvidencePayload(sources);
          }
          setBusyExecutionNote(needsCompilerRepair
            ? `正在把 ${pack.diagnostics.validatorRejectedCount} 条校验反馈送回 Knowledge Compiler，重新生成可执行规则`
            : `已扩展到 ${sources.length} 个分级来源，正在对缺失维度做第 2 轮定向蒸馏`);
          const refined = await callAI<unknown>("knowledge-compile", {
            idea,
            answers: interviewEvidence,
            knowledgePlan: { ...plan, knowledgeGaps: densityGate.missingDimensions.length ? densityGate.missingDimensions : plan.knowledgeGaps },
            researchSources: evidencePayload,
            priorKnowledgePack: serializeKnowledgePackForRefinement(pack, evidencePayload),
          });
          pack = reconcileKnowledgePackContentPermission(
            mergeKnowledgePacks({ ...pack, sources }, normalizeKnowledgePack({ raw: refined, plan, sources })),
            interviewEvidence,
          );
        } catch (error) {
          const refinementIssue = error instanceof Error ? error.message : "第 2 轮专业知识蒸馏失败";
          pack = { ...pack, status: "partial", summary: `${pack.summary}；补充蒸馏未完成：${refinementIssue}` };
          reportClientGenerationLoopEvent("generation_loop_failed", { phase: "knowledge-density-refinement", reason: refinementIssue, covered: pack.coverage.covered.length, target: pack.coverage.target });
        }
      }
      setKnowledgePack(pack);
      setBusyExecutionNote(knowledgePackIsPublishable(pack)
        ? `已保留 ${pack.atoms.length} 条有来源的专业知识，覆盖 ${pack.coverage.score}% 决策维度；高证据内容形成规则，较弱证据作为参考洞察写入`
        : pack.atoms.length
          ? `找到 ${pack.atoms.length} 条候选知识，但仍缺少可追溯来源，正在继续核对`
        : "来源不足以形成可执行专业规则，已保留缺口但不会硬写进 Skill");
      return pack;
    } catch (error) {
      const message = error instanceof Error && error.name === "AbortError" ? "专业知识检索超过 58 秒，已停止当前检索" : error instanceof Error ? error.message : "专业知识联网失败";
      const failed: KnowledgePack = {
        ...EMPTY_KNOWLEDGE_PACK,
        status: "error",
        summary: `${message}；Skill 仍会继续生成，但不会把未核验知识写成专业规则。`,
        plan,
        generatedAt: new Date().toISOString(),
      };
      setKnowledgePack(failed);
      reportClientGenerationLoopEvent("generation_loop_failed", { phase: "knowledge-compiler", reason: message, queries: plan.queries });
      return failed;
    }
  }

  async function compileSkill() {
    let goalLoopError = "";
    let durableBuild: DurableWorkflowJournal | null = null;
    let generationPlan = ensureTaskCapabilities(capabilityPlan, idea, demoAnswers);
    setCapabilityPlan(generationPlan);
    const unresolvedMcp = generationPlan.items.find((item) => capabilityIsActive(item) && item.kind === "mcp" && item.status === "requires-setup");
    if (unresolvedMcp) {
      setToast(`先确认「${unresolvedMcp.name}」已经可用，或选择无 MCP 方案`);
      return;
    }
    beginBusy("build", "compile-skill");
    setAiGenerationIssue("");
    setBuildLoop({ ...DEFAULT_BUILD_LOOP, status: "checking", phase: "contract" });
    setGenerationLoop({ ...DEFAULT_GENERATION_LOOP, status: "running", phase: "contract", stopReason: "正在固定 Goal 与能力契约" });
    try {
      if (!hasRealModel) throw new Error("模型配置已缺失，请重新连接");
      durableBuild = await DurableWorkflowJournal.start("build", {
        goal: idea.slice(0, 2_000),
        hasRepresentativeTask: Boolean(demoAnswers.__previewInput?.trim()),
      });
      let liveKnowledgePack = EMPTY_KNOWLEDGE_PACK;
      try {
        liveKnowledgePack = await runBuildTimeKnowledgeCompiler(generationPlan);
      } catch (error) {
        const message = error instanceof Error ? error.message : "专业知识规划没有完成";
        liveKnowledgePack = {
          ...EMPTY_KNOWLEDGE_PACK,
          status: "error",
          summary: `${message}；本次不会把模型常识冒充成来源知识。`,
          generatedAt: new Date().toISOString(),
        };
        setKnowledgePack(liveKnowledgePack);
      }
      generationPlan = attachCompiledKnowledgeCapability(generationPlan, liveKnowledgePack);
      setCapabilityPlan(generationPlan);
      const liveKnowledgeText = serializeKnowledgePack(liveKnowledgePack);
      const liveBuildContext = [contextBundle, liveKnowledgeText ? `# Build-time professional knowledge pack\n${liveKnowledgeText}` : ""].filter(Boolean).join("\n\n").slice(0, 70_000);
      const canonicalIR = createCanonicalSkillIR({
        skillName: deriveSkillIdentity(idea, demoAnswers).name,
        idea,
        answers: demoAnswers,
        plan: generationPlan,
        loop: loopPlan,
        sourceEvidence: `${sourceInsightText}\n${liveKnowledgeText}`,
      });
      await durableBuild?.complete("intent", { goal: canonicalIR.identity.stableGoal, skillName: canonicalIR.identity.skillName });
      await durableBuild?.complete("representative-task", { available: Boolean(demoAnswers.__previewInput?.trim()) });
      await durableBuild?.complete("contract", { semanticDigest: semanticSkillIRDigest(canonicalIR) });
      await durableBuild?.complete("capability-plan", {
        activeCapabilityIds: generationPlan.items.filter(capabilityIsActive).map((item) => item.id),
      });
      await durableBuild?.complete("knowledge-compile", {
        status: liveKnowledgePack.status,
        sourceCount: liveKnowledgePack.sources.length,
        adoptedRuleCount: liveKnowledgePack.atoms.length,
      });
      setBuildLoop((current) => ({ ...current, phase: "contract" }));
      setBusyPhaseIndex(1);
      const result = await callAI<{ files: Record<string, string> }>("build", {
        idea,
        sourceText: liveBuildContext,
        answers: interviewEvidence,
        blueprint,
        capabilityPlan: generationPlan,
        loopPlan,
        skillIR: canonicalIR,
      });
      setBuildLoop((current) => ({ ...current, phase: "bundle" }));
      setBusyPhaseIndex(2);
      showLocalBusy("候选已完整返回，正在校验文件结构与输出契约");
      if (!result.files?.["SKILL.md"]) throw new Error("模型没有生成有效的 SKILL.md");
      let compiledFiles = finalizeSkillFiles(applyKnowledgePackToFiles(result.files, liveKnowledgePack), idea, demoAnswers, sourceInsightText, generationPlan, loopPlan);
      const initialStaticRepair = await runP0StaticRepairLoop(compiledFiles, generationPlan);
      const contractRepair = await runP1ContractRepairLoop({
        files: initialStaticRepair.files,
        validation: initialStaticRepair.validation,
        generationPlan,
        answers: demoAnswers,
        sourceText: contextBundle,
        skillIR: canonicalIR,
      });
      compiledFiles = contractRepair.files;
      let audit = contractRepair.audit;
      const repairRounds = initialStaticRepair.rounds + contractRepair.rounds + contractRepair.nestedP0Rounds;
      await durableBuild?.complete("bundle", {
        files: Object.keys(compiledFiles).sort(),
        executionReady: contractRepair.validation.executionReady,
        contractReady: contractRepair.validation.contractReady,
        repairRounds,
      });

      if (contractRepair.passed) {
        await durableBuild?.complete("freeze", {
          revision: skillBundleRevision(compiledFiles),
          executionReady: contractRepair.validation.executionReady,
          contractReady: contractRepair.validation.contractReady,
        });
        try {
          const goalLoopResult = await runOptimizationLoop(compiledFiles, generationPlan);
          compiledFiles = goalLoopResult.files;
          audit = auditSkillFiles(compiledFiles, demoAnswers);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Optimization Loop 没有完成";
          goalLoopError = message;
          reportClientGenerationLoopEvent("generation_loop_failed", { phase: "runtime", reason: message });
          const failedState: GenerationLoopState = { ...DEFAULT_GENERATION_LOOP, status: "attention", phase: "complete", issues: [message], stopReason: `自动优化停在：${message}` };
          setGenerationLoop(failedState);
          notifyGenerationLoopResult(failedState);
        }
      } else {
        await durableBuild?.fail(new Error("P1 Contract Gate did not converge"));
        const blockedState: GenerationLoopState = {
          ...DEFAULT_GENERATION_LOOP,
          status: "attention",
          phase: "complete",
          closureScore: contractRepair.closure.score,
          issues: contractRepair.issues.map((issue) => issue.evidence).slice(0, 8),
          stopReason: contractRepair.validation.executionReady
            ? "P1 Contract Gate 未收敛，Bundle 未冻结，Optimization Loop 与 Eval 没有启动"
            : "P0 Execution Gate 未通过，P1 Contract Gate、Optimization Loop 与 Eval 没有启动",
        };
        setGenerationLoop(blockedState);
        notifyGenerationLoopResult(blockedState);
      }

      setBusyPhaseIndex(9);
      showLocalBusy("生成与自动优化已结束，正在保存当前最佳版本");
      setFiles(compiledFiles);
      const unresolvedBuildIssues = contractRepair.passed ? audit.blockers : contractRepair.issues.map((issue) => issue.evidence);
      setBuildLoop({ ...DEFAULT_BUILD_LOOP, status: unresolvedBuildIssues.length ? "attention" : "passed", phase: unresolvedBuildIssues.length ? "bundle" : "frozen", rounds: repairRounds, issues: unresolvedBuildIssues, frozen: !unresolvedBuildIssues.length });
      setEvalRan(false);
      setSkillDemo(null);
      setDemoReviewPending(false);
      setDemoExpanded(true);
      setPersonalizationRound(0);
      setDemoRunCount(0);
      setFeedbackLoopSummary("");
      setRepaired(repairRounds > 0);
      setMutationHistory([]);
      setRejectedOptimizations([]);
      setOptimizationSession(null);
      setFeedbackOptions([]);
      setFeedbackReasons([]);
      setFeedbackCustom("");
      setFeedbackSaved(false);
      setAllowSensitiveExport(false);
      markComplete("blueprint");
      markComplete("build");
      setStep("build");
      setSelectedFile("SKILL.md");
      setRetryAction(goalLoopError ? "rerun-optimization-loop" : null);
      setToast(goalLoopError
        ? `Skill 文件已生成，但自动优化停在：${goalLoopError}`
        : unresolvedBuildIssues.length
        ? "内部编译没有收敛，已保留当前候选并自动记录失败节点"
        : repairRounds
          ? `已完成生成、质检和 ${repairRounds} 轮定向修复`
          : "已完成目标拆解、循环设计和生成质检");
    } catch (error) {
      await durableBuild?.fail(error);
      const message = error instanceof Error ? error.message : "AI Skill 生成失败";
      setAiGenerationIssue(message);
      setBuildLoop((current) => ({ ...current, status: "attention", issues: [message] }));
      notifyGenerationLoopResult({ ...DEFAULT_GENERATION_LOOP, status: "attention", phase: "complete", issues: [message], stopReason: message });
      setToast(`${message}；没有生成模板 Skill`);
    } finally {
      finishBusy();
    }
  }

  async function rerunOptimizationLoop() {
    if (optimizationRunInFlight.current) return;
    if (!files["SKILL.md"]) {
      setToast("当前还没有可优化的 Skill 文件");
      return;
    }
    if (!hasRealModel) {
      setToast("模型配置已缺失，请重新连接");
      return;
    }
    optimizationRunInFlight.current = true;
    beginBusy("build", "rerun-optimization-loop", 4);
    setAiGenerationIssue("");
    try {
      const generationPlan = ensureTaskCapabilities(capabilityPlan, idea, demoAnswers);
      const reconciledFiles = finalizeSkillFiles(files, idea, demoAnswers, sourceInsightText, generationPlan, loopPlan, parseCanonicalSkillIR(files) || undefined);
      setCapabilityPlan(generationPlan);
      const result = await runOptimizationLoop(reconciledFiles, generationPlan);
      const nextAudit = auditSkillFiles(result.files, demoAnswers);
      const staticBlocked = result.state.stopReason.includes("P0 Execution Gate");
      const buildIssues = staticBlocked ? result.state.issues : nextAudit.blockers;
      setFiles(result.files);
      setBuildLoop({
        ...DEFAULT_BUILD_LOOP,
        status: buildIssues.length ? "attention" : "passed",
        phase: buildIssues.length ? "bundle" : "frozen",
        rounds: 0,
        issues: buildIssues,
        frozen: !buildIssues.length,
      });
      setRetryAction(result.state.status === "passed" ? null : "rerun-optimization-loop");
      setToast(result.state.status === "passed" ? "Optimization Loop 已完成并通过回归门控" : result.state.stopReason);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Optimization Loop 没有完成";
      reportClientGenerationLoopEvent("generation_loop_failed", { phase: "runtime", reason: message });
      const failedState: GenerationLoopState = { ...DEFAULT_GENERATION_LOOP, status: "attention", phase: "complete", issues: [message], stopReason: `自动优化停在：${message}` };
      setGenerationLoop(failedState);
      notifyGenerationLoopResult(failedState);
      setAiGenerationIssue(message);
      setRetryAction("rerun-optimization-loop");
      setToast(`${message}；当前 Skill 文件没有被覆盖`);
    } finally {
      optimizationRunInFlight.current = false;
      finishBusy();
    }
  }

  async function rerunMultiSceneComparison() {
    if (optimizationRunInFlight.current) return;
    if (!files["SKILL.md"]) {
      setToast("当前还没有可评测的 Skill 文件");
      return;
    }
    if (!hasRealModel) {
      setToast("模型配置已缺失，请重新连接");
      return;
    }
    optimizationRunInFlight.current = true;
    beginBusy("evaluate", "rerun-multi-scene-comparison", 0);
    showLoopBusy("正在重跑普通 AI 与当前 Skill 的冻结多场景对照，不会生成或应用优化候选");
    setAiGenerationIssue("");
    try {
      const restoredPlan = reconcileCapabilityPlanWithCanonicalIR(capabilityPlan, parseCanonicalSkillIR(files));
      // A benchmark-only rerun must evaluate the exact Bundle currently shown in
      // the editor. Re-projecting here can normalize bytes and create a different
      // digest, which makes freshly collected evidence look stale immediately.
      const currentFiles = { ...files };
      const evalBank = harnessRunnableEvalBank(parseAndSplitEvalCases(currentFiles["evals/evals.json"] || ""), restoredPlan);
      const requiredCapabilityIds = harnessVerifiableCapabilityIds(restoredPlan);
      // Keep the project-level held-out suite stable across Bundle revisions.
      // Re-sampling from a candidate's own eval bank makes historical scores
      // incomparable and lets a regenerated Skill silently change its exam.
      const selectionCases = generationLoop.benchmarkSuiteCases.length >= 2
        ? generationLoop.benchmarkSuiteCases
        : sampleOptimizationCases(evalBank, "selection", OPTIMIZATION_SELECTION_SAMPLE, { requiredCapabilityIds });
      if (selectionCases.length < 2) throw new Error("当前评测集没有足够的独立保留任务，无法重跑多场景对照");

      setGenerationLoop((current) => ({
        ...current,
        phase: "rollout",
        stopReason: "正在重新执行普通 AI 与当前 Skill 的冻结多场景对照",
      }));
      reportClientGenerationLoopEvent("generation_loop_phase", {
        phase: "benchmark-only",
        reason: `只重跑 ${selectionCases.length} 个冻结场景的基线、当前 Skill 与匿名对照，不进入候选优化`,
      });

      const baselineHarness = await runIsolatedEvalHarness({ cases: selectionCases, configuration: "without_skill", repeats: 2 });
      const currentHarness = await runIsolatedEvalHarness({ cases: selectionCases, skillFiles: currentFiles, configuration: "with_skill", repeats: 2 });
      const blindResult = await runBlindHarnessComparison(baselineHarness, currentHarness);
      const baselineMetrics = summarizeGenerationEvidence(baselineHarness.evidence);
      const currentMetrics = summarizeGenerationEvidence(currentHarness.evidence);
      const revision = skillBundleRevision(files);
      const blindWinner = blindResult.revealedWinner === "left" ? "baseline" : blindResult.revealedWinner === "tie" ? "tie" : "candidate";
      const comparison = compareHarnessBenchmarks(baselineHarness, currentHarness, blindWinner);
      const comparisonIssues = comparison.cases
        .filter((item) => !item.skillPassed || item.delta < 0)
        .map((item) => `${item.caseId}：${item.baselineScore}→${item.skillScore}${item.failureReason ? `；${item.failureReason}` : ""}${item.dimensionGaps.length ? `；落后维度 ${item.dimensionGaps.join("、")}` : ""}`)
        .slice(0, 8);
      const nextStatus: GenerationLoopState["status"] = comparison.verdict === "improved" ? "passed" : comparison.verdict === "equivalent" ? "stable" : "attention";
      const nextStopReason = comparison.verdict === "improved"
        ? `正式对照完成：当前 Skill 稳定优于普通 AI ${comparison.lift} 分`
        : comparison.verdict === "equivalent"
          ? "正式对照完成：当前 Skill 与普通 AI 表现接近，未宣称获得增益"
          : comparison.lift > 0
            ? `正式对照完成：当前 Skill 总分高于普通 AI ${comparison.lift} 分，但冻结通过率或匿名质量对照未达到接受门槛，暂不接受为有效候选`
            : comparison.lift === 0
              ? "正式对照完成：当前 Skill 总分与普通 AI 持平，但冻结通过率或匿名质量对照未达到接受门槛"
              : `正式对照发现回退：当前 Skill 比普通 AI 低 ${Math.abs(comparison.lift)} 分，未接受为有效候选`;

      setGenerationLoop((current) => ({
        ...current,
        status: nextStatus,
        phase: "complete",
        baselineScore: baselineMetrics.score,
        bestScore: currentMetrics.score,
        baselineQualityScore: comparison.baselineScore,
        bestQualityScore: comparison.skillScore,
        comparisonConfidence: blindResult.confidence,
        comparisonRevision: revision,
        comparisonStage: current.comparisonStage === "initial" ? "initial" : "optimized",
        comparisonCaseCount: selectionCases.length,
        comparisonVerdict: comparison.verdict,
        comparisonEvidence: comparison.cases,
        benchmarkSuiteCases: selectionCases,
        lift: comparison.lift,
        passRate: currentMetrics.passRate,
        contractDigest: currentHarness.contract.digest,
        benchmarkCases: selectionCases.length,
        benchmarkRepeatsPerCase: Math.min(baselineHarness.benchmark.repeatsPerCase, currentHarness.benchmark.repeatsPerCase),
        benchmarkRuns: baselineHarness.benchmark.runs + currentHarness.benchmark.runs,
        baselineStddev: baselineHarness.benchmark.repeatScoreStddev,
        bestStddev: currentHarness.benchmark.repeatScoreStddev,
        meanDurationMs: Math.round((baselineHarness.benchmark.meanDurationMs + currentHarness.benchmark.meanDurationMs) / 2),
        blindWinner,
        issues: comparisonIssues,
        stopReason: nextStopReason,
      }));
      reportClientGenerationLoopEvent("generation_loop_finished", {
        phase: "benchmark-only",
        accepted: comparison.verdict === "improved",
        verdict: comparison.verdict,
        contractDigest: currentHarness.contract.digest,
        cases: comparison.cases,
        reason: `正式对照已绑定当前 Bundle ${revision.slice(0, 12)}：${comparison.baselineScore} → ${comparison.skillScore}；${nextStopReason}`,
      });
      setToast(nextStopReason);
    } catch (error) {
      const message = error instanceof Error ? error.message : "多场景正式对照没有完成";
      setAiGenerationIssue(message);
      setRetryAction("rerun-multi-scene-comparison");
      setToast(`${message}；当前 Skill 与旧评测结果均未被覆盖`);
      reportClientGenerationLoopEvent("generation_loop_failed", { phase: "benchmark-only", reason: message });
    } finally {
      optimizationRunInFlight.current = false;
      finishBusy();
    }
  }

  function confirmMcpCapability(item: CapabilityItem) {
    const server = (mcpDrafts[item.id] || item.connection?.server || "").trim();
    if (server.length < 2) {
      setToast("请填写你已安装并授权的 MCP Server 名称");
      return;
    }
    setCapabilityPlan((current) => ({
      ...current,
      items: current.items.map((candidate) => candidate.id === item.id ? {
        ...candidate,
        enabled: true,
        status: "use-provided",
        reason: `你已确认目标 Agent 中的 ${server} 已安装并授权；Skill 会在每次调用前再次检查真实可用性`,
        connection: { server, tools: candidate.connection?.tools || [], verified: true },
      } : candidate),
    }));
    setToast("MCP 已确认，会生成调用契约与降级方案");
  }

  function chooseMcpFallback(item: CapabilityItem) {
    setCapabilityPlan((current) => ({
      ...current,
      items: current.items.map((candidate) => candidate.id === item.id ? {
        ...candidate,
        enabled: false,
        status: candidate.optional ? "requires-setup" : "not-needed",
        reason: "已选择不依赖 MCP：优先使用上传资料、当前 Agent 能力或人工输入完成任务",
        connection: candidate.optional ? candidate.connection : undefined,
      } : candidate),
    }));
    setMcpDrafts((current) => ({ ...current, [item.id]: "" }));
    setToast("已切换为无 MCP 方案，不会再作为待配置项");
  }

  function editMcpCapability(item: CapabilityItem) {
    setCapabilityPlan((current) => ({
      ...current,
      items: current.items.map((candidate) => candidate.id === item.id ? {
        ...candidate,
        enabled: true,
        status: "requires-setup",
        connection: candidate.connection ? { ...candidate.connection, verified: false } : undefined,
      } : candidate),
    }));
  }

  function toggleOptionalCapability(item: CapabilityItem) {
    setCapabilityPlan((current) => ({
      ...current,
      items: current.items.map((candidate) => candidate.id === item.id ? {
        ...candidate,
        enabled: !capabilityIsActive(candidate),
        status: candidate.status === "not-needed"
          ? candidate.kind === "mcp" ? "requires-setup" : "use-provided"
          : candidate.status,
      } : candidate),
    }));
  }

  function toggleCatalogCapability(libraryItem: CapabilityCatalogItem) {
    setCapabilityPlan((current) => {
      const existing = current.items.find((item) => item.id === libraryItem.id);
      if (existing) {
        return {
          ...current,
          items: current.items.map((item) => item.id === libraryItem.id ? {
            ...item,
            enabled: !capabilityIsActive(item),
            status: capabilityIsActive(item)
              ? item.status
              : item.kind === "mcp" ? "requires-setup" : "use-provided",
          } : item),
        };
      }
      const capability: CapabilityItem = libraryItem;
      return { ...current, items: [...current.items, { ...capability, enabled: true }] };
    });
    if (libraryItem.kind === "mcp" && libraryItem.connection?.server) {
      setMcpDrafts((current) => ({ ...current, [libraryItem.id]: current[libraryItem.id] || libraryItem.connection?.server || "" }));
    }
  }

  function addCustomMcpCapability() {
    const name = customMcpName.trim();
    const server = customMcpServer.trim();
    if (name.length < 2 || server.length < 2) {
      setToast("请填写具体外部服务和 MCP Server 名称");
      return;
    }
    const slug = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 38) || "service";
    const id = `custom-mcp-${slug}-${capabilityPlan.items.filter((item) => item.id.startsWith(`custom-mcp-${slug}`)).length + 1}`;
    const item: CapabilityItem = {
      id, kind: "mcp", name, path: "integrations/tool-contracts.json", layer: "runtime",
      requirement: `在 ${name} 中读取真实状态或执行经用户确认的动作`, purpose: `通过 ${server} 把 Skill 连接到 ${name}`,
      reason: "由你主动添加的具体外部服务能力", status: "requires-setup", input: "只发送完成当前任务所需的最小输入",
      output: "来自外部服务的可验证结果或动作回执", fallback: "改为上传资料、生成待执行草稿或由用户手动完成外部动作",
      routingCondition: `只有任务明确需要 ${name} 中的数据或动作时`, deterministicAdvantage: "MCP 返回外部服务中的真实状态，而不是由模型猜测",
      evaluationCriteria: ["调用前验证连接与授权", "写入前获得用户确认", "失败时不声称已完成"],
      connection: { server, tools: [], verified: false }, optional: true, enabled: true, recommended: false,
    };
    setCapabilityPlan((current) => ({ ...current, items: [...current.items, item] }));
    setMcpDrafts((current) => ({ ...current, [id]: server }));
    setCustomMcpName("");
    setCustomMcpServer("");
    setToast("已加入自定义 MCP；确认安装与授权后才会写成可调用");
  }

  async function handleDemoChatFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []).slice(0, Math.max(0, 3 - demoChatAttachments.length));
    event.target.value = "";
    if (!selected.length) {
      if (demoChatAttachments.length >= 3) setToast("每轮最多添加 3 个文件");
      return;
    }
    setDemoChatFilesLoading(true);
    setDemoChatError("");
    try {
      const parsed = await Promise.all(selected.map(async (file, index): Promise<DemoChatAttachment> => {
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (isPdf && file.size > 8 * 1024 * 1024) throw new Error(`${file.name} 超过 8 MB`);
        if (!isPdf && file.size > 2_000_000) throw new Error(`${file.name} 超过 2 MB`);

        let extracted = "";
        if (isPdf) {
          const form = new FormData();
          form.append("file", file, file.name);
          const response = await fetch("/api/parse-pdf", { method: "POST", body: form });
          const data = await response.json() as { error?: string; text?: string; scannedLikely?: boolean };
          if (!response.ok) throw new Error(`${file.name}：${data.error || "解析失败"}`);
          if (data.scannedLikely || !data.text?.trim()) throw new Error(`${file.name} 没有可读取文字，请先完成 OCR`);
          extracted = data.text;
        } else {
          extracted = await file.text();
        }
        const textLimit = 12_000;
        return {
          id: `demo-file-${Date.now()}-${index}`,
          name: file.name,
          type: file.type || "text/plain",
          size: file.size,
          text: extracted.slice(0, textLimit),
          truncated: extracted.length > textLimit,
        };
      }));
      setDemoChatAttachments((current) => [...current, ...parsed].slice(0, 3));
      setToast(`已加入 ${parsed.length} 个文件，会随下一条消息发送`);
    } catch (error) {
      setDemoChatError(error instanceof Error ? error.message : "文件读取失败");
    } finally {
      setDemoChatFilesLoading(false);
    }
  }

  function removeDemoChatAttachment(id: string) {
    setDemoChatAttachments((current) => current.filter((item) => item.id !== id));
  }

  async function sendDemoChatMessage() {
    const message = demoChatInput.trim();
    const attachments = demoChatAttachments;
    if ((!message && !attachments.length) || !skillDemo || demoChatBusy || demoChatFilesLoading) return;
    if (!hasRealModel) {
      setToast("继续对话前需要先连接模型");
      setSettingsOpen(true);
      return;
    }
    const sequence = demoChatSequence + 1;
    const visibleMessage = message || `请结合我刚上传的${attachments.length === 1 ? "文件" : `${attachments.length} 个文件`}继续。`;
    const userMessage: DemoChatMessage = {
      id: `user-${demoRunCount}-${sequence}`,
      role: "user",
      content: visibleMessage.slice(0, 3_000),
      attachments: attachments.length ? attachments : undefined,
    };
    const conversation = [...demoConversation, userMessage].slice(-12);
    setDemoConversation(conversation);
    setDemoChatInput("");
    setDemoChatAttachments([]);
    setDemoChatError("");
    setDemoChatBusy(true);
    setDemoChatSequence(sequence);
    try {
      const result = await callAI<{ reply?: unknown }>("demo-chat", {
        idea,
        sourceText: contextBundle,
        answers: interviewEvidence,
        capabilityPlan,
        loopPlan,
        skill: files,
        demo: skillDemo,
        conversation,
        message: visibleMessage,
      });
      const reply = typeof result.reply === "string" ? result.reply.trim().slice(0, 12_000) : "";
      if (!reply) throw new Error("AI 没有完成这轮回复");
      setDemoConversation((current) => [...current, { id: `assistant-${demoRunCount}-${sequence}`, role: "assistant", content: reply }].slice(-12));
    } catch (error) {
      setDemoConversation((current) => current.filter((item) => item.id !== userMessage.id));
      setDemoChatInput(message);
      setDemoChatAttachments(attachments);
      setDemoChatError(error instanceof Error ? error.message : "继续对话失败，请重试");
    } finally {
      setDemoChatBusy(false);
    }
  }

  async function reevaluateDemoConversation() {
    if (!skillDemo || demoConversationScoreBusy) return;
    const completedReplies = demoConversation.filter((item) => item.role === "assistant");
    const completedTurns = completedReplies.length;
    const latestReplyId = completedReplies.at(-1)?.id || "";
    if (!latestReplyId) {
      setToast("先继续对话一轮，AI 回复后即可更新评分");
      return;
    }
    if (latestReplyId === demoConversationScoredReplyId) {
      setToast("当前对话已经评分；继续对话后可再次更新");
      return;
    }
    if (!hasRealModel) {
      setToast("重新评分前需要先连接模型");
      setSettingsOpen(true);
      return;
    }
    setDemoConversationScoreBusy(true);
    setDemoChatError("");
    try {
      const review = await callAI<{ results?: EvalResult[]; feedbackOptions?: unknown }>("evaluate", {
        idea,
        sourceText: contextBundle,
        answers: interviewEvidence,
        loopPlan,
        skill: files,
        demo: skillDemo,
        conversationEvidence: demoConversation,
      });
      const normalized = normalizeEvalResults(review.results, files, demoAnswers);
      if (normalized.length !== 5) throw new Error("AI 没有完成五项对话证据评估");
      const fallback = createDemoFeedbackFallback(skillDemo, normalized, createPersonalizedFeedbackOptions(demoAnswers, sourceNames.length > 0));
      const hasVisibleMismatch = normalized.some((item) => item.coverage !== "not-covered" && item.score < 90 && !/无实质缺陷|完全符合|准确|流程正确|本轮未覆盖|不构成缺陷/i.test(item.issue || ""));
      setEvals(normalized);
      setFeedbackOptions(hasVisibleMismatch ? normalizeFeedbackOptions(review.feedbackOptions, fallback) : []);
      setFeedbackReasons([]);
      setFeedbackCustom("");
      setEvalRan(true);
      setDemoConversationScoredTurns(completedTurns);
      setDemoConversationScoredReplyId(latestReplyId);
      setToast(`已更新本次场景评分（${completedTurns} 轮对话）；顶部多场景对照需单独重新运行`);
    } catch (error) {
      setDemoChatError(error instanceof Error ? error.message : "对话证据重新评分失败");
    } finally {
      setDemoConversationScoreBusy(false);
    }
  }

  function enterEvaluation() {
    setStep("evaluate");
    if (!evalRan && !busy) void runEvaluation();
  }

  function openWorkspaceStep(nextStep: StepId) {
    if (nextStep === "evaluate") {
      enterEvaluation();
      return;
    }
    setStep(nextStep);
  }

  async function runDemoAndReview(candidateFiles: Record<string, string>, previousDemo: SkillDemo | null, feedback: string[], phaseOffset = 0, savedDemo: SkillDemo | null = null, candidateCapabilityPlan: CapabilityPlan = capabilityPlan, persistCheckpoint = true) {
    let demo = savedDemo;
    if (!demo) {
      setBusyPhaseIndex(phaseOffset);
      let trial = await callAI<{ demo?: unknown }>("demo", {
        idea,
        sourceText: contextBundle,
        answers: interviewEvidence,
        capabilityPlan: candidateCapabilityPlan,
        loopPlan,
        skill: candidateFiles,
        previousDemo,
        feedback,
      });
      demo = normalizeSkillDemo(trial.demo);
      if (!demo || !demo.output) throw new Error("AI 没有完成可查看的 Skill Demo");
      if (!demoDiffersMeaningfully(previousDemo, demo)) {
        trial = await callAI<{ demo?: unknown }>("demo", {
          idea,
          sourceText: contextBundle,
          answers: interviewEvidence,
          capabilityPlan: candidateCapabilityPlan,
          loopPlan,
          skill: candidateFiles,
          previousDemo,
          feedback: [
            ...feedback,
            "上一份候选 Demo 与前一轮重复，必须换用不同标题、不同输入数据和不同决策分支。优先测试缺失值、异常值、未提供公式、不同公式或不同输出要求；禁止复用上一轮数据行。",
          ],
        });
        demo = normalizeSkillDemo(trial.demo);
        if (!demo || !demo.output || !demoDiffersMeaningfully(previousDemo, demo)) throw new Error("AI 连续生成了重复 Demo；上一轮结果已保留，请再次换场景验证");
      }

      if (persistCheckpoint) {
        // A normal Demo is a durable checkpoint. Candidate-commit validation
        // opts out so an uncommitted revision can never become the visible
        // Demo for the still-current Skill.
        setSkillDemo(demo);
        setDemoRunCount((current) => current + 1);
        setDemoExpanded(true);
        setDemoConversation([]);
        setDemoChatSequence(0);
        setDemoChatInput("");
        setDemoChatAttachments([]);
        setDemoConversationScoredTurns(0);
        setDemoConversationScoredReplyId("");
        setDemoChatError("");
        setDemoReviewPending(true);
        setEvalRan(false);
      }
    }

    setBusyPhaseIndex(phaseOffset + 1);
    const review = await callAI<{ results?: EvalResult[]; feedbackOptions?: unknown }>("evaluate", {
      idea,
      sourceText: contextBundle,
      answers: interviewEvidence,
      loopPlan,
      skill: candidateFiles,
      demo,
    });
    setBusyPhaseIndex(phaseOffset + 2);
    const normalized = normalizeEvalResults(review.results, candidateFiles, demoAnswers);
    if (normalized.length !== 5) throw new Error("AI 没有完成五项 Demo 对照评估");
    const fallback = createDemoFeedbackFallback(demo, normalized, createPersonalizedFeedbackOptions(demoAnswers, sourceNames.length > 0));
    const hasVisibleMismatch = normalized.some((item) => item.coverage !== "not-covered" && item.score < 90 && !/无实质缺陷|完全符合|准确|流程正确|本轮未覆盖|不构成缺陷/i.test(item.issue || ""));
    const options = hasVisibleMismatch ? normalizeFeedbackOptions(review.feedbackOptions, fallback) : [];
    if (persistCheckpoint) setDemoReviewPending(false);
    return { demo, results: normalized, feedbackOptions: options };
  }

  async function runEvaluation() {
    if (!hasRealModel) {
      setToast("真实 Demo 需要先连接模型；不会用静态分数冒充试跑结果");
      setSettingsOpen(true);
      return;
    }
    const hadResult = evalRan;
    setEvalDetailsOpen(false);
    beginBusy("evaluate", "evaluate");
    try {
      const savedDemo = demoReviewPending ? skillDemo : null;
      const reviewed = await runDemoAndReview(files, skillDemo, [], 0, savedDemo);
      setBusyPhaseIndex(3);
      setSkillDemo(reviewed.demo);
      setDemoExpanded(true);
      setEvals(reviewed.results);
      setFeedbackOptions(reviewed.feedbackOptions);
      setFeedbackReasons([]);
      setFeedbackCustom("");
      setFeedbackSaved(false);
      if (!savedDemo) setFeedbackLoopSummary("");
      setPersonalizationRound((current) => Math.max(1, current));
      setEvalRan(true);
      setRejectedOptimizations([]);
      setOptimizationSession(null);
      markComplete("evaluate");
      setRetryAction(null);
      setToast("Demo 已生成，具体不足已根据本次结果列出");
    } catch (error) {
      if (!hadResult || demoReviewPending) setEvalRan(false);
      setToast(`${error instanceof Error ? error.message : "Skill Demo 试跑失败"}${skillDemo && demoReviewPending ? "；Demo 已保存，只需继续评估" : ""}`);
    } finally {
      finishBusy();
    }
  }

  async function repairSkill() {
    const blockersBefore = bundleAudit.blockers;
    if (!blockersBefore.length) {
      setToast("发布前检查已经通过，不需要再次修复");
      return;
    }
    beginBusy("repair", "repair-skill");
    setAiGenerationIssue("");
    try {
      const repairPlan = ensureTaskCapabilities(capabilityPlan, idea, demoAnswers);
      setCapabilityPlan(repairPlan);
      let repairedFiles = finalizeSkillFiles(files, idea, demoAnswers, sourceInsightText, repairPlan, loopPlan, parseCanonicalSkillIR(files) || undefined);
      let repairedAudit = auditSkillFiles(repairedFiles, demoAnswers);
      let repairRounds = 0;
      let repairSummary = "确定性编译器已重建不合格评测并统一用户确认的内容权限。";
      let requestFailure = "";
      const compilerClosedArtifactContract = blockersBefore.includes("任务要求文件交付，但输出契约没有声明可检查的文件模式")
        && !repairedAudit.blockers.includes("任务要求文件交付，但输出契约没有声明可检查的文件模式");

      if (compilerClosedArtifactContract && !repairedAudit.blockers.length) {
        reportClientRepairEvent("repair_gate_checked", {
          round: 0,
          beforeCount: blockersBefore.length,
          afterCount: 0,
          accepted: true,
          resolved: ["任务要求文件交付，但输出契约没有声明可检查的文件模式"],
          updatedPaths: ["references/output-contract.md", "evals/evals.json", "evals/capability-manifest.json"],
          reason: "编译器已根据已确认的交付形式补齐可检查文件模式",
        });
        setFiles(repairedFiles);
        setBuildLoop({ ...DEFAULT_BUILD_LOOP, status: "checking", phase: "bundle" });
        try {
          const goalResult = await runOptimizationLoop(repairedFiles, repairPlan);
          repairedFiles = goalResult.files;
          repairedAudit = auditSkillFiles(repairedFiles, demoAnswers);
          setFiles(repairedFiles);
          if (goalResult.state.status !== "passed") {
            setBuildLoop({ ...DEFAULT_BUILD_LOOP, status: repairedAudit.blockers.length ? "attention" : "passed", phase: repairedAudit.blockers.length ? "bundle" : "frozen", issues: repairedAudit.blockers, frozen: !repairedAudit.blockers.length });
            setRetryAction("rerun-optimization-loop");
            setToast(`文件交付契约已自动补齐；${goalResult.state.stopReason}`);
            return;
          }
          repairSummary = "已补齐文件交付模式，并通过 Optimization Loop 的基线、定向修补与独立验证。";
        } catch (error) {
          const message = error instanceof Error ? error.message : "Optimization Loop 没有完成";
          reportClientGenerationLoopEvent("generation_loop_failed", { phase: "repair-handoff", reason: message });
          setGenerationLoop((current) => ({ ...current, status: "attention", phase: "complete", issues: [message], stopReason: `文件契约已修复，但自动优化停在：${message}` }));
          setBuildLoop({ ...DEFAULT_BUILD_LOOP, status: "passed", phase: "frozen", frozen: true });
          setRetryAction("rerun-optimization-loop");
          setToast(`文件交付契约已自动补齐；Optimization Loop 可从当前文件继续：${message}`);
          return;
        }
      }

      while (repairedAudit.blockers.length && hasRealModel && repairRounds < MANUAL_REPAIR_MAX_ROUNDS) {
        const round = repairRounds + 1;
        const roundBlockers = repairedAudit.blockers;
        setBusyPhaseIndex(round === 1 ? 1 : 2);
        setBuildLoop({ ...DEFAULT_BUILD_LOOP, status: "repairing", phase: "bundle", rounds: repairRounds, issues: roundBlockers });

        let result: CanonicalRepairResponse;
        try {
          result = await callAI<CanonicalRepairResponse>("repair", {
            idea,
            sourceText: contextBundle,
            answers: interviewEvidence,
            capabilityPlan: repairPlan,
            loopPlan,
            skillIR: repairedFiles["evals/skill-ir.json"] || createCanonicalSkillIR({
              skillName: deriveSkillIdentity(idea, demoAnswers).name,
              idea,
              answers: demoAnswers,
              plan: repairPlan,
              loop: loopPlan,
              sourceEvidence: sourceInsightText,
              files: repairedFiles,
            }),
            skill: repairedFiles,
            evaluation: { priority: "P1", category: "P1_CONTRACT_BLOCKER", repairRoute: "semantic-contract", blockers: roundBlockers, warnings: repairedAudit.warnings },
          });
        } catch (error) {
          requestFailure = error instanceof Error ? error.message : "模型修复请求没有完成";
          reportClientRepairEvent("repair_gate_stalled", {
            round,
            beforeCount: roundBlockers.length,
            afterCount: roundBlockers.length,
            blockers: roundBlockers,
            reason: requestFailure,
          });
          break;
        }

        let canonicalCandidate: ReturnType<typeof applyCanonicalCandidate>;
        try {
          canonicalCandidate = applyCanonicalCandidate({
            currentFiles: repairedFiles,
            rawMutations: result.canonicalMutations,
            implementationFiles: result.implementationFiles,
            idea,
            answers: demoAnswers,
            sourceEvidence: sourceInsightText,
            capabilityPlan: repairPlan,
            loopPlan,
          });
        } catch (error) {
          reportClientRepairEvent("repair_gate_stalled", {
            round,
            beforeCount: roundBlockers.length,
            afterCount: roundBlockers.length,
            blockers: roundBlockers,
            reason: error instanceof Error ? error.message : "CanonicalMutation 无法应用",
          });
          break;
        }
        const updatedPaths = [...canonicalCandidate.changedTargets, ...canonicalCandidate.implementationPaths];
        if (!canonicalCandidate.materialDiff) {
          reportClientRepairEvent("repair_gate_stalled", {
            round,
            beforeCount: roundBlockers.length,
            afterCount: roundBlockers.length,
            blockers: roundBlockers,
            reason: "修复在 Canonical Projection 后没有产生语义或实现变化",
          });
          break;
        }

        const nextFiles = canonicalCandidate.files;
        const nextAudit = auditSkillFiles(nextFiles, demoAnswers);
        const gateDiff = compareGateBlockers(roundBlockers, nextAudit.blockers);
        const accepted = nextAudit.blockers.length === 0 || gateDiff.improvedWithoutRegression;
        reportClientRepairEvent("repair_gate_checked", {
          round,
          beforeCount: roundBlockers.length,
          afterCount: nextAudit.blockers.length,
          accepted,
          resolved: gateDiff.resolved,
          introduced: gateDiff.introduced,
          blockers: nextAudit.blockers,
          updatedPaths,
        });

        if (!accepted) {
          reportClientRepairEvent("repair_gate_stalled", {
            round,
            beforeCount: roundBlockers.length,
            afterCount: nextAudit.blockers.length,
            blockers: roundBlockers,
            introduced: gateDiff.introduced,
            updatedPaths,
            reason: gateDiff.introduced.length ? "候选版本引入了新的发布问题" : "候选版本没有解决当前发布问题",
          });
          break;
        }

        repairedFiles = nextFiles;
        repairedAudit = nextAudit;
        repairRounds = round;
        if (typeof result.summary === "string" && result.summary.trim()) repairSummary = result.summary.trim().slice(0, 500);

        // Preserve every accepted round immediately. A later timeout or stalled
        // candidate must not send the next click back to the original files.
        setFiles(repairedFiles);
        setEvals(createStaticEvalResults(repairedFiles, demoAnswers));
        setBuildLoop({ ...DEFAULT_BUILD_LOOP, status: repairedAudit.blockers.length ? "repairing" : "passed", phase: repairedAudit.blockers.length ? "bundle" : "frozen", rounds: repairRounds, issues: repairedAudit.blockers, frozen: !repairedAudit.blockers.length });
      }

      setBusyPhaseIndex(2);
      setFiles(repairedFiles);
      setEvals(createStaticEvalResults(repairedFiles, demoAnswers));
      setEvalRan(false);
      setRepaired(repairRounds > 0);
      setRejectedOptimizations([]);
      setOptimizationSession(null);

      if (repairedAudit.blockers.length) {
        setBuildLoop({ ...DEFAULT_BUILD_LOOP, status: "attention", phase: "bundle", rounds: repairRounds, issues: repairedAudit.blockers });
        setRetryAction("repair-skill");
        reportClientRepairEvent("repair_gate_finished", {
          round: repairRounds,
          beforeCount: blockersBefore.length,
          afterCount: repairedAudit.blockers.length,
          accepted: repairRounds > 0,
          blockers: repairedAudit.blockers,
          reason: requestFailure || "达到本轮安全停止条件",
        });
        if (requestFailure) {
          setAiGenerationIssue(`${requestFailure}；已保留本轮完成的 ${repairRounds} 次有效修复`);
        } else {
          setAiGenerationIssue("");
        }
        setToast(repairRounds
          ? `已保留 ${repairRounds} 轮有效修复；未收敛问题已写入内部诊断`
          : "候选版本没有安全解决内部编译问题，已保留原 Skill");
        return;
      }

      setBuildLoop({ ...DEFAULT_BUILD_LOOP, status: "passed", phase: "frozen", rounds: repairRounds, frozen: true });
      reportClientRepairEvent("repair_gate_finished", {
        round: repairRounds,
        beforeCount: blockersBefore.length,
        afterCount: 0,
        accepted: true,
        blockers: [],
      });

      if (hasRealModel) {
        const previousDemo = skillDemo;
        setSkillDemo(null);
        setDemoReviewPending(false);
        setBusyPhaseIndex(3);
        try {
          const reviewed = await runDemoAndReview(repairedFiles, previousDemo, [], 3);
          setSkillDemo(reviewed.demo);
          setDemoExpanded(true);
          setEvals(reviewed.results);
          setFeedbackOptions(reviewed.feedbackOptions);
          setEvalRan(true);
          setPersonalizationRound((current) => Math.max(1, current));
        } catch (error) {
          const reviewIssue = error instanceof Error ? error.message : "Demo 复评暂时失败";
          setEvalRan(false);
          setToast(`发布检查已修复；Demo 或对照评估可从当前进度继续：${reviewIssue}`);
          setRetryAction("evaluate");
          return;
        }
      }

      setRetryAction(null);
      setToast(`已通过 ${repairRounds || 1} 轮定向处理修复 ${blockersBefore.length} 项并重新评估：${repairSummary}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "发布前问题修复失败";
      setAiGenerationIssue(message);
      setToast(`${message}；当前 Skill 文件已保留`);
    } finally {
      finishBusy();
    }
  }

  function toggleFeedback(reason: string) {
    setFeedbackReasons((current) => current.includes(reason) ? current.filter((item) => item !== reason) : [...current, reason]);
    setFeedbackSaved(false);
  }

  async function applyPersonalFeedback() {
    const feedback = Array.from(new Set([...feedbackReasons, feedbackCustom]
      .map(normalizeFeedbackRequirement)
      .filter(Boolean)));
    if (!feedback.length) {
      setToast("先选择一个不符合你的地方");
      return;
    }
    if (!hasRealModel) {
      setToast("下一轮优化需要先连接模型");
      setSettingsOpen(true);
      return;
    }
    if (!skillDemo) {
      setToast("请先生成一轮 Demo，再根据结果反馈");
      return;
    }
    if (personalizationRound >= PERSONALIZATION_MAX_ROUNDS) {
      setToast(`已完成 ${PERSONALIZATION_MAX_ROUNDS} 轮自动优化，请先人工确认目标或直接编辑 Skill`);
      return;
    }

    beginBusy("personalize", "personalize");
    setFeedbackSaved(false);
    const baselineFiles = files;
    try {
      const previousDecisionFeedback = decisionLedgerFeedback(baselineFiles, { source: "personalization", limit: 6 });
      const effectiveCapabilityPlan = reconcileCapabilityPlanWithFeedback(
        ensureTaskCapabilities(capabilityPlan, `${idea}；${feedback.join("；")}`, demoAnswers),
        feedback,
      );
      setBusyPhaseIndex(1);
      let candidateFiles: Record<string, string> | null = null;
      let candidateTargets: string[] = [];
      let modelSummary = "";
      let verificationIssue = "";
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const workingFiles = candidateFiles || baselineFiles;
        const workingIR = parseCanonicalSkillIR(workingFiles);
        if (!workingIR) throw new Error("当前 Skill 缺少可变更的 Canonical SkillIR");
        const optimized = await callAI<CanonicalRepairResponse>("personalize", {
          idea,
          sourceText: contextBundle,
          answers: interviewEvidence,
          capabilityPlan: effectiveCapabilityPlan,
          loopPlan,
          skillIR: workingIR,
          skill: workingFiles,
          demo: skillDemo,
          feedback,
          verificationIssue,
          rejectedHistory: previousDecisionFeedback,
        });
        const deterministicFeedbackMutations = attempt === 0 ? feedbackRequirementMutations(workingIR, feedback) : [];
        const canonicalCandidate = applyCanonicalCandidate({
          currentFiles: workingFiles,
          rawMutations: [...deterministicFeedbackMutations, ...normalizeCanonicalMutations(optimized.canonicalMutations)],
          implementationFiles: optimized.implementationFiles,
          idea,
          answers: demoAnswers,
          sourceEvidence: sourceInsightText,
          capabilityPlan: effectiveCapabilityPlan,
          loopPlan,
        });
        if (!canonicalCandidate.materialDiff) {
          verificationIssue = "候选在 Canonical Projection 后没有产生可验证变化；必须修改 Requirement、Task、Input、Output、Capability、Constraint 或 Eval Source。";
          continue;
        }
        candidateFiles = canonicalCandidate.files;
        candidateTargets = [...new Set([...candidateTargets, ...canonicalCandidate.changedTargets, ...canonicalCandidate.implementationPaths])];
        if (typeof optimized.summary === "string" && optimized.summary.trim()) modelSummary = optimized.summary.trim().slice(0, 600);
        const uncovered = feedback.filter((item) => !feedbackAppearsInRuntimeFiles(candidateFiles!, item));
        reportClientPersonalizationCheck({
          round: Math.min(PERSONALIZATION_MAX_ROUNDS, Math.max(1, personalizationRound) + 1),
          attempt: attempt + 1,
          feedbackCount: feedback.length,
          uncoveredCount: uncovered.length,
          accepted: uncovered.length === 0,
          updatedPaths: candidateTargets,
        });
        if (!uncovered.length) break;
        verificationIssue = `上一版仍没有把这些要求落实到运行规则：${uncovered.join("；")}。不要只改总结或评测说明；请修改对应输入、工作流分支、输出字段或验收规则。`;
      }
      if (!candidateFiles) throw new Error("AI 没有生成能回应这些反馈的 Skill 修改");
      const updatedFiles = candidateFiles;
      const changedFiles = Object.keys(updatedFiles).filter((path) => updatedFiles[path] !== baselineFiles[path]);
      if (!changedFiles.length) throw new Error("这一轮没有产生可验证的 Skill 变化");

      const previousDemo = skillDemo;
      const loopSummary = `已采用本轮建议：${feedback.join("；")}。${modelSummary || `已修改 ${changedFiles.length} 个相关文件，并将用新场景重新试跑。`}`;
      const nextRound = Math.min(PERSONALIZATION_MAX_ROUNDS, Math.max(1, personalizationRound) + 1);
      setBusyPhaseIndex(2);
      const validation = await validatePersonalizationCandidate({ baselineFiles, candidateFiles: updatedFiles, feedback });
      const mutationEvidence = [
        ...validation.candidateEvidence.cases
          .filter((item) => validation.selectionCaseIds.includes(item.caseId))
          .slice(0, 4)
          .map((item) => `${item.caseId}：${item.evidence || item.failureReason}`),
        ...validation.gate.reasons,
        ...validation.gate.regressions,
      ].filter(Boolean);
      const personalizationEntry: PersonalizationHistoryEntry = {
        id: `${Date.now()}-${nextRound}`,
        round: nextRound,
        feedback,
        summary: loopSummary,
        changedFiles,
        testedCases: validation.selectionCaseIds.length,
      };
      const receipt: SkillMutationReceipt = {
        id: `personalization-${Date.now()}-${nextRound}`,
        source: "personalization",
        accepted: validation.gate.accepted,
        createdAt: Date.now(),
        baselineRevision: skillBundleRevision(baselineFiles),
        candidateRevision: skillBundleRevision(updatedFiles),
        changedFiles,
        testedCases: validation.selectionCaseIds.length,
        evidence: mutationEvidence,
        gateReasons: validation.gate.reasons,
        regressions: validation.gate.regressions,
        contractDigest: validation.contractDigest,
        runIds: validation.runIds,
        caseIds: validation.selectionCaseIds,
        baselineScore: validation.gate.beforeScore,
        candidateScore: validation.gate.candidateScore,
        textualFeedback: validation.candidateEvidence.textualFeedback,
        failedCases: validation.candidateEvidence.failedCases,
        consumedDecisionIds: previousDecisionFeedback.map((item) => item.decisionId),
        personalization: personalizationEntry,
      };
      if (!validation.gate.accepted) {
        commitSkillMutation(receipt);
        throw new Error(`个性化候选已回滚：${[...validation.gate.reasons, ...validation.gate.regressions].join("；") || "没有满足统一提交门禁"}`);
      }

      setBusyPhaseIndex(3);
      const reviewed = await runDemoAndReview(updatedFiles, previousDemo, feedback, 2, null, effectiveCapabilityPlan, false);
      // Atomic commit happens only after static checks, frozen held-out
      // regression and the new Demo have all completed successfully.
      commitSkillMutation(receipt, updatedFiles);
      setCapabilityPlan(effectiveCapabilityPlan);
      setFeedbackLoopSummary(loopSummary);
      setRejectedOptimizations([]);
      setOptimizationSession(null);
      setRepaired(true);
      const committedAudit = auditSkillFiles(updatedFiles, demoAnswers);
      setBuildLoop((current) => ({ ...current, status: committedAudit.blockers.length ? "attention" : "passed", phase: committedAudit.blockers.length ? "bundle" : "frozen", issues: committedAudit.blockers, frozen: !committedAudit.blockers.length }));
      setSkillDemo(reviewed.demo);
      setDemoRunCount((current) => current + 1);
      setDemoExpanded(true);
      setDemoConversation([]);
      setDemoChatSequence(0);
      setDemoChatInput("");
      setDemoConversationScoredTurns(0);
      setDemoConversationScoredReplyId("");
      setDemoChatError("");
      setDemoReviewPending(false);
      setEvals(reviewed.results);
      setEvalRan(true);
      setPersonalizationRound(nextRound);
      setFeedbackOptions(reviewed.feedbackOptions);
      setFeedbackReasons([]);
      setFeedbackCustom("");
      setFeedbackSaved(true);
      setRetryAction(null);
      setToast("新一轮 Demo 已完成，请直接比较结果是否更像你");
    } catch (error) {
      const message = error instanceof Error ? error.message : "下一轮优化失败";
      setFeedbackSaved(false);
      setToast(`${message}，已保留当前已验证 Skill`);
    } finally {
      finishBusy();
    }
  }

  async function testConnection() {
    if (!hasApiKey) {
      setConnectionState("error");
      return;
    }
    setConnectionState("testing");
    try {
      await callAI<{ ok: boolean }>("ping", {});
      setConnectionState("ok");
      setAiGenerationIssue("");
    } catch {
      setConnectionState("error");
    }
  }

  async function loadModels() {
    if (!hasApiKey) {
      setToast("先输入 API Key，才能读取账号可用模型");
      return;
    }
    setModelLoading(true);
    try {
      const result = await callAI<{ models: string[] }>("models", {});
      const ids = Array.isArray(result.models) ? result.models.filter((item) => typeof item === "string") : [];
      if (!ids.length) throw new Error("接口没有返回可用模型");
      setAvailableModels(ids.slice(0, 24));
      if (!ids.includes(model)) chooseModel(ids[0]);
      setToast(`已读取 ${ids.length} 个可用模型`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "模型列表读取失败");
    } finally {
      setModelLoading(false);
    }
  }

  async function saveModelSettings() {
    if (apiKey.trim() && !hasApiKey) {
      setToast("API Key 看起来不完整，请检查后再保存");
      return;
    }
    if (researchProvider === "firecrawl" && researchApiKey.trim() && researchApiKey.trim().length < 8) {
      setToast("Firecrawl API Key 看起来不完整，请检查后再保存");
      return;
    }
    if (researchProvider === "searxng" && researchBaseUrl.trim() && !/^https?:\/\//i.test(researchBaseUrl.trim())) {
      setToast("SearXNG 地址需要以 http:// 或 https:// 开头");
      return;
    }
    try {
      const response = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        provider,
        model,
        baseUrl,
        apiKey,
        researchProvider,
        researchApiKey,
        researchBaseUrl,
        }),
      });
      const result = await response.json() as { error?: string; configured?: boolean; researchConfigured?: boolean };
      if (!response.ok) throw new Error(result.error || "凭据保存失败");
      setCredentialStored(Boolean(result.configured));
      setResearchCredentialStored(Boolean(result.researchConfigured));
      setApiKey("");
      setResearchApiKey("");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "凭据保存失败；设置仍只在当前标签页有效");
      return;
    }
    closeSettings();
    const researchLabel = researchReady ? `；专业知识联网：${RESEARCH_PROVIDERS[researchProvider].name}` : researchProvider === "disabled" ? "；专业知识联网未开启" : "；专业知识联网配置尚未完成";
    setToast((hasApiKey
      ? connectionState === "ok"
        ? `${PROVIDERS[provider].name} · ${model} 已验证并保存`
        : `${PROVIDERS[provider].name} · ${model} 已保存，首次请求会自动验证`
      : "设置已保存；连接模型后才能开始 AI 生成") + researchLabel);
  }

  async function clearPersistedCredentials() {
    try {
      const response = await fetch("/api/credentials", { method: "DELETE" });
      if (!response.ok) throw new Error("服务端没有确认删除");
    } catch (error) {
      setToast(error instanceof Error ? `清除失败：${error.message}` : "清除凭据失败");
      return;
    }
    setApiKey("");
    setCredentialStored(false);
    setResearchApiKey("");
    setResearchCredentialStored(false);
    setConnectionState("idle");
    setToast("已清除服务端安全存储中的模型与检索凭据");
  }

  function updateSelectedFileContent(value: string) {
    setFiles((current) => ({ ...current, [selectedFile]: value }));
    setEvalRan(false);
    setSkillDemo(null);
    setDemoReviewPending(false);
    setRepaired(false);
    setRejectedOptimizations([]);
    setOptimizationSession(null);
    setFeedbackOptions([]);
    setFeedbackReasons([]);
    setFeedbackSaved(false);
  }

  function downloadBundle() {
    if (!platforms.length) {
      setToast("请先选择至少一个目标 Agent");
      return;
    }
    if (bundleAudit.blockers.length) {
      setToast(`还有 ${bundleAudit.blockers.length} 项发布前问题，请先修复`);
      return;
    }
    const exportFiles = allowSensitiveExport ? files : sanitizeSkillFiles(files);
    const frameName = "skillcanvas-download-frame";
    let frame = document.querySelector<HTMLIFrameElement>(`iframe[name="${frameName}"]`);
    if (!frame) {
      frame = document.createElement("iframe");
      frame.name = frameName;
      frame.hidden = true;
      document.body.appendChild(frame);
    }
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/download";
    form.target = frameName;
    form.hidden = true;
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "payload";
    input.value = JSON.stringify({ files: exportFiles, rootName: activeSkillName });
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    form.remove();
    markComplete("ship");
    setToast(allowSensitiveExport ? "原始 Skill 包下载已发起，请在浏览器下载列表确认" : "安全 Skill 包下载已发起，请在浏览器下载列表确认");
  }

  async function copySkill() {
    await navigator.clipboard.writeText(files["SKILL.md"] || "");
    setToast("SKILL.md 已复制");
  }

  function renderSkillDemoCard(pendingReview: boolean) {
    if (!skillDemo) return null;
    const completedConversationTurns = demoConversation.filter((message) => message.role === "assistant").length;
    const latestCompletedReplyId = [...demoConversation].reverse().find((message) => message.role === "assistant")?.id || "";
    const conversationScoreIsFresh = Boolean(latestCompletedReplyId) && demoConversationScoredReplyId === latestCompletedReplyId;
    const hasNewConversationEvidence = Boolean(latestCompletedReplyId) && !conversationScoreIsFresh;
    return (
      <section className={`skill-demo-card ${pendingReview ? "review-pending" : ""}`}>
        <div className="skill-demo-head">
          <div className="skill-demo-title"><span>第 {Math.max(1, demoRunCount)} 次试跑</span><h3>{skillDemo.title}</h3><p>{skillDemo.scenario}</p></div>
          <div className="skill-demo-aside">
            {pendingReview
              ? <div className="demo-score pending"><small>已保存</small><strong>✓</strong><span>等待评估</span></div>
              : observedEvals.length
                ? <div className="demo-score"><small>{demoConversationScoredTurns > 0 ? `当前单场景 · ${demoConversationScoredTurns} 轮对话` : `当前单场景 · ${observedEvals.length} 项证据`}</small><strong>{averageEvalScore}</strong><span>/ 100</span><em>不与多场景总分直接比较</em></div>
                : <div className="demo-score pending"><small>本轮证据</small><strong>0</strong><span>项可评分</span></div>}
            {!pendingReview && <div className="demo-head-actions">
              <button className="demo-rerun-button" type="button" onClick={runEvaluation} disabled={busy}><img src="https://unpkg.com/@tabler/icons@3.46.0/icons/outline/refresh.svg" alt="" aria-hidden="true" /><span>{busy ? "正在试跑…" : "换个场景"}</span></button>
              <button className={`demo-rerun-button demo-score-button${hasNewConversationEvidence ? " evidence-ready" : ""}`} type="button" onClick={() => void reevaluateDemoConversation()} disabled={!hasNewConversationEvidence || demoConversationScoreBusy || demoChatBusy}><img src="https://unpkg.com/@tabler/icons@3.46.0/icons/outline/star.svg" alt="" aria-hidden="true" /><span>{demoConversationScoreBusy ? "评分中…" : conversationScoreIsFresh ? "本次评分已更新" : "更新本次评分"}</span></button>
            </div>}
          </div>
        </div>
        <div className="demo-initial-transcript">
          <div className="demo-message user initial-turn">
            <span>你</span>
            <div className="demo-message-body">
              <small>本次输入</small>
              <p>{skillDemo.userPrompt}</p>
            </div>
          </div>
          <div className="demo-message assistant initial-turn">
            <span>AI</span>
            <div className="demo-message-body demo-output">
              <div><small>Skill 实际产出</small></div>
              <pre>{skillDemo.output}</pre>
            </div>
          </div>
        </div>
        <details className="demo-diagnostics">
          <summary><strong>查看本轮诊断</strong><span>{skillDemo.appliedRules.length} 项完成{skillDemo.uncertainties.length ? `，${skillDemo.uncertainties.length} 项待确认` : ""}</span><small>展开</small></summary>
          <div className="demo-observations">
            <div><span>已经做到</span><ul>{skillDemo.appliedRules.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div className="demo-uncertainties"><span>还需确认</span>{skillDemo.uncertainties.length ? <ul>{skillDemo.uncertainties.map((item) => <li key={item}>{item}</li>)}</ul> : <p>本轮没有需要额外确认的事项。</p>}</div>
          </div>
        </details>
        <div className="demo-conversation">
          <div className="demo-conversation-heading"><div><strong>继续对话</strong><small>补充材料或修改意见，AI 会基于当前结果继续处理。</small></div></div>
          {demoConversation.length > 0 && (
            <div className="demo-message-list" aria-live="polite">
              {demoConversation.map((message) => <div className={`demo-message ${message.role}`} key={message.id}><span>{message.role === "user" ? "你" : "AI"}</span><div className="demo-message-body"><p>{message.content}</p>{message.attachments?.length ? <div className="demo-message-files">{message.attachments.map((attachment) => <span key={attachment.id}>{attachment.name}</span>)}</div> : null}</div></div>)}
              {demoChatBusy && <div className="demo-message assistant pending"><span>AI</span><p><i /><i /><i /></p></div>}
            </div>
          )}
          {demoChatAttachments.length > 0 && <div className="demo-chat-files" aria-label="待发送文件">{demoChatAttachments.map((attachment) => <span key={attachment.id}><b>{attachment.name}</b>{attachment.truncated && <small>已读取前段内容</small>}<button type="button" onClick={() => removeDemoChatAttachment(attachment.id)} aria-label={`移除 ${attachment.name}`}>×</button></span>)}</div>}
          <div className="demo-chat-composer">
            <input
              ref={demoChatFileInputRef}
              className="demo-chat-file-input"
              type="file"
              multiple
              accept=".pdf,.md,.txt,.json,.csv,.html,.js,.ts,.tsx,.py"
              onChange={handleDemoChatFiles}
              tabIndex={-1}
            />
            <button className="demo-chat-attach" type="button" onClick={() => demoChatFileInputRef.current?.click()} disabled={demoChatBusy || demoChatFilesLoading || demoChatAttachments.length >= 3} aria-label={demoChatFilesLoading ? "正在读取文件" : "添加文件"}>{demoChatFilesLoading ? <span>读取中</span> : <img src="https://unpkg.com/@tabler/icons@3.46.0/icons/outline/paperclip.svg" alt="" aria-hidden="true" />}</button>
            <textarea
              value={demoChatInput}
              onChange={(event) => { setDemoChatInput(event.target.value); setDemoChatError(""); }}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendDemoChatMessage(); } }}
              placeholder="继续追问、补充条件，或让它基于这份结果再改一版…"
              aria-label="继续与 Demo 对话"
              rows={1}
            />
            <button className="demo-chat-send" type="button" onClick={() => void sendDemoChatMessage()} disabled={(!demoChatInput.trim() && !demoChatAttachments.length) || demoChatBusy || demoChatFilesLoading}><span>{demoChatBusy ? "回复中…" : "发送"}</span><img src="https://unpkg.com/@tabler/icons@3.46.0/icons/outline/send.svg" alt="" aria-hidden="true" /></button>
          </div>
          {demoChatError && <div className="demo-chat-error" role="alert"><span>{demoChatError}</span><button type="button" onClick={() => void sendDemoChatMessage()} disabled={demoChatBusy || (!demoChatInput.trim() && !demoChatAttachments.length)}>重试</button></div>}
        </div>
        {pendingReview && <div className="demo-actions"><small>本次结果已保存。</small><button className="secondary-button" onClick={runEvaluation} disabled={busy}>{busy ? "正在完成评估…" : "继续完成评估"}</button></div>}
      </section>
    );
  }

  const knowledgeMcpReport = internalMcpEvidenceReports["knowledge-compile"];
  const knowledgeMcpUrls = new Set(knowledgePack.sources.filter((source) => source.origin === "mcp").map((source) => source.url));
  const knowledgeMcpAdoptedCount = knowledgePack.atoms.filter((atom) => atom.sourceUrls.some((url) => knowledgeMcpUrls.has(url))).length;
  const knowledgeMcpCompletedCalls = knowledgeMcpReport?.attempts.filter((attempt) => attempt.status === "completed").length || 0;
  const knowledgeMcpReceiptState = !knowledgeMcpReport
    ? "idle"
    : knowledgeMcpReport.error
      ? "error"
      : knowledgeMcpReport.sources.length > 0
        ? "used"
        : knowledgeMcpReport.connectionsScanned > 0
          ? "empty"
          : "unconfigured";
  const knowledgeMcpReceiptTitle = knowledgeMcpReceiptState === "used"
    ? `MCP 已提供 ${knowledgeMcpReport?.sources.length || 0} 份可追溯证据`
    : knowledgeMcpReceiptState === "unconfigured"
      ? "本轮没有可用的知识 MCP 连接"
      : knowledgeMcpReceiptState === "error"
        ? "MCP 取证本轮未完成"
        : knowledgeMcpReceiptState === "empty"
          ? "MCP 已检查，但没有证据通过编译"
          : "本版没有 MCP 证据进入知识包";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div>
            <div className="brand-name brand-script"><span className="brand-letter-accent">S</span>kill<span className="brand-letter-accent">C</span>anvas</div>
            <div className="brand-sub">YOUR <span>PERSONAL SKILL</span> STUDIO</div>
          </div>
        </div>
        <div className="topbar-center">
          <span className="workspace-dot" />
          <span>{workspaceName}</span>
          <span className="saved-state" title="当前标签页会自动恢复；关闭标签页后清除，请在结束前下载">本标签页自动保存</span>
        </div>
        <div className="topbar-actions">
          <button className={`model-button ${connectionState === "ok" ? "connected" : hasApiKey ? "configured" : ""}`} onClick={openSettings}>
            <span className="provider-mark"><ProviderLogo id={provider} /></span>
            <span>{hasApiKey ? model : "连接模型"}</span>
            <span className="chevron">⌄</span>
          </button>
        </div>
      </header>

      <div className={`workspace-grid ${step === "brief" && !briefSidebarOpen ? "sidebar-collapsed" : "sidebar-expanded"}`}>
        {step === "brief" && <button type="button" className={`sidebar-edge-toggle ${briefSidebarOpen ? "open" : ""}`} onClick={() => setBriefSidebarOpen((current) => !current)} aria-label={briefSidebarOpen ? "收起创建流程" : "展开创建流程"} aria-expanded={briefSidebarOpen}><span>{briefSidebarOpen ? "‹" : "›"}</span></button>}
        <aside className="step-rail" aria-hidden={step === "brief" && !briefSidebarOpen}>
          <div className="rail-heading">
            <span><img src="https://unpkg.com/@tabler/icons@3.46.0/icons/outline/chart-line.svg" alt="" aria-hidden="true" /></span>
            <strong>创建进度</strong>
          </div>
          <nav aria-label="Skill 创建步骤">
            {WORKFLOW_STEPS.map((item) => {
              const active = item.id === step;
              const done = completedSteps.has(item.id);
              const canOpen = canNavigateToWorkflowStep(item.id, step, completedSteps);
              return (
                <button
                  key={item.id}
                  className={`step-item ${active ? "active" : ""} ${done ? "done" : ""}`}
                  onClick={() => (canOpen ? openWorkspaceStep(item.id) : setToast("请先完成前面的步骤"))}
                >
                  <span className="step-index">{done ? "✓" : item.eyebrow}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

        </aside>

        <section className="main-stage">
          {aiGenerationIssue && step !== "brief" && (
            <div className="ai-generation-error" role="alert"><span>!</span><p><strong>AI 生成已暂停，当前回答已保留</strong><small>{aiGenerationIssue}。系统没有切换到固定模板。</small></p><div className="ai-generation-error-actions">{retryAction && <button className="retry" type="button" onClick={retryCurrentAiAction}>重试当前步骤</button>}<button type="button" onClick={openSettings}>检查模型</button></div></div>
          )}
          {step === "brief" && (
            <div className="stage-content brief-stage">
              <h1><span className="headline-line">AI 不懂你</span><br /><span className="brand-script"><span className="brand-letter-accent">S</span>kill<span className="brand-letter-accent">C</span>anvas</span> 来帮你</h1>

              <div className="idea-composer">
                <textarea
                  value={idea}
                  onChange={(event) => setIdea(event.target.value)}
                  placeholder="例如：帮我规划旅行 / 帮我写小红书 / 帮我做产品分析……"
                  aria-label="Skill 想法"
                />
                <div className="composer-footer">
                  <label className={`upload-button ${sourcesLoading ? "loading" : ""}`}>
                    <input type="file" multiple accept=".pdf,.md,.txt,.json,.csv,.html,.js,.ts,.tsx,.py" onChange={handleSources} disabled={sourcesLoading} />
                    <span>{sourcesLoading ? "·" : "＋"}</span> {sourcesLoading ? "正在解析资料…" : "添加你的资料"}
                  </label>
                  <button className="primary-button" onClick={startInterview} disabled={busy || sourcesLoading}>
                    {sourcesLoading ? "等待资料解析" : busy ? "AI 正在先做一次…" : hasRealModel ? "Let‘s Start！" : "连接模型后开始 AI 理解"}<span>→</span>
                  </button>
                </div>
                {(sourcesLoading || sourceReceipt) && (
                  <div className={`source-upload-receipt ${sourcesLoading ? "reading" : sourceReceipt?.tone || "ready"}`} role="status" aria-live="polite">
                    <span>{sourcesLoading ? "···" : sourceReceipt?.tone === "ready" ? "✓" : sourceReceipt?.tone === "error" ? "!" : "i"}</span>
                    <p><strong>{sourcesLoading ? "正在读取资料" : sourceReceipt?.title}</strong><small>{sourcesLoading ? `正在解析文件并提取 PDF 页码，请稍候。` : sourceReceipt?.detail}</small></p>
                  </div>
                )}
              </div>

              <div className="starter-row">
                <button onClick={() => setIdea("根据 JD 定制我的简历")}>根据 JD 定制我的简历</button>
                <button onClick={() => setIdea("把我的写作习惯做成小红书 Skill")}>把我的写作习惯做成小红书 Skill</button>
                <button onClick={() => setIdea("根据固定模板帮我做竞品分析")}>根据固定模板帮我做竞品分析</button>
                <button onClick={() => setIdea("把我的旅行偏好变成长期规划助手")}>把我的旅行偏好变成长期规划助手</button>
              </div>

              <div className={`context-builder ${contextPanelOpen ? "open" : ""}`}>
                <button className={`context-builder-toggle ${contextPanelOpen ? "expanded" : ""} ${contextFilledCount + sourceNames.length ? "" : "without-status"}`} type="button" aria-expanded={contextPanelOpen} onClick={() => setContextPanelOpen((current) => !current)}>
                  {!contextPanelOpen && <span><img src="https://unpkg.com/@tabler/icons@3.46.0/icons/outline/books.svg" alt="" aria-hidden="true" /></span>}
                  <div><strong>补充参考 <b>（可选）</b></strong><small>有现成方法、样例或偏好，可以让 Skill 更懂你</small></div>
                  {!contextPanelOpen && contextFilledCount + sourceNames.length > 0 && <em>已补充 {contextFilledCount + sourceNames.length} 项</em>}
                  <i>{contextPanelOpen ? "⌃" : "⌄"}</i>
                </button>
                {contextPanelOpen && (
                  <div className="context-panel">
                    <div className="context-tabs" role="tablist" aria-label="补充参考类型">
                      {CONTEXT_FIELDS.map((field) => (
                        <button
                          key={field.id}
                          type="button"
                          role="tab"
                          aria-selected={activeContextField === field.id}
                          className={activeContextField === field.id ? "active" : ""}
                          onClick={() => setActiveContextField(field.id)}
                        >
                          <img src={field.icon} alt="" aria-hidden="true" />
                          <strong>{field.tabLabel}</strong>
                          <i>{activeContextField === field.id ? "⌃" : "⌄"}</i>
                        </button>
                      ))}
                    </div>
                    <div className="context-fields">
                      {CONTEXT_FIELDS.filter((field) => field.id === activeContextField).map((field) => (
                        <label className="context-field" key={field.id}>
                          <span><strong>{field.label}</strong><em>{field.tag}</em></span>
                          <small>{field.description}</small>
                          <textarea
                            value={contextNotes[field.id]}
                            maxLength={20_000}
                            onChange={(event) => setContextNotes((current) => ({ ...current, [field.id]: event.target.value }))}
                            placeholder={field.placeholder}
                          />
                          <i>{contextNotes[field.id].length.toLocaleString()} / 20,000</i>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {sourceNames.length > 0 && (
                <div className="source-strip">
                  <span className="source-label">已读取</span>
                  {sourceNames.map((name) => <span className="source-chip" key={name}>{name}</span>)}
                </div>
              )}
              {sourceWarnings.length > 0 && (
                <div className="source-strip warning" role="status">
                  <span className="source-label">需要处理</span>
                  {sourceWarnings.map((warning) => <span className="source-chip" key={warning}>{warning}</span>)}
                </div>
              )}

            </div>
          )}

          {step === "interview" && (
            <div className="stage-content interview-stage">
              <div className="stage-heading-row">
                <div>
                  <div className="stage-kicker">先展示理解，再继续追问</div>
                  <h2>先看它做得像不像，再告诉它哪里不对</h2>
                  <p>下面不是最终 Skill，而是一份理解预演。AI 会根据你的反应只追问真正影响结果的选择，最多四轮。</p>
                </div>
                <div className="completeness-badge"><strong>{completeness}%</strong><span>需求完整度</span></div>
              </div>

              {discoveryPreview && (
                <article className="discovery-preview-card">
                  <div className="discovery-preview-head">
                    <div className="discovery-preview-title">
                      <span><img src="https://unpkg.com/@tabler/icons@3.46.0/icons/outline/file-description.svg" alt="" aria-hidden="true" /></span>
                      <h3>{discoveryPreview.title}</h3>
                      <em>本轮预演结果</em>
                    </div>
                    <button type="button" aria-expanded={discoveryPreviewExpanded} aria-controls="discovery-preview-body" onClick={() => setDiscoveryPreviewExpanded((current) => !current)}>
                      <span>{discoveryPreviewExpanded ? "收起结果" : "展开结果"}</span>
                      <img className={discoveryPreviewExpanded ? "expanded" : ""} src="https://unpkg.com/@tabler/icons@3.46.0/icons/outline/chevron-down.svg" alt="" aria-hidden="true" />
                    </button>
                  </div>
                  {discoveryPreviewExpanded && <div className="discovery-preview-body" id="discovery-preview-body">
                    <div className="discovery-preview-prompt">
                      <span><img src="https://unpkg.com/@tabler/icons@3.46.0/icons/outline/user.svg" alt="" aria-hidden="true" /></span>
                      <div><strong>你的原始需求</strong><p>{discoveryPreview.userPrompt}</p></div>
                    </div>
                    <div className="discovery-preview-output-card">
                      <div><span><img src="https://unpkg.com/@tabler/icons@3.46.0/icons/outline/sparkles.svg" alt="" aria-hidden="true" /></span><strong>AI 当前生成预览</strong></div>
                      <pre className="discovery-preview-output">{discoveryPreview.output}</pre>
                    </div>
                    <div className="discovery-preview-evidence">
                      <div><span><img src="https://unpkg.com/@tabler/icons@3.46.0/icons/outline/circle-check.svg" alt="" aria-hidden="true" />我已经理解</span><ul>{discoveryPreview.learned.map((item) => <li key={item}>{item}</li>)}</ul></div>
                      <div className="uncertain"><span><img src="https://unpkg.com/@tabler/icons@3.46.0/icons/outline/help-circle.svg" alt="" aria-hidden="true" />还需要你确认</span>{discoveryPreview.uncertainties.length ? <ul>{discoveryPreview.uncertainties.map((item) => <li key={item}>{item}</li>)}</ul> : <p>当前没有明显缺口，下面的问题会继续验证理解。</p>}</div>
                    </div>
                    <div className="discovery-preview-feedback">
                      <div><strong>这版哪里还不像你？</strong></div>
                      <div className="discovery-preview-options">
                        <button type="button" className={previewFeedback.length === 0 && !previewFeedbackCustom.trim() ? "selected positive" : "positive"} disabled={interviewRoundIndex > 0} onClick={() => { invalidateFutureRounds(); setPreviewFeedback([]); setPreviewFeedbackCustom(""); setInterviewReadiness((current) => ({ ...current, canFinish: false })); }}>方向基本对，继续细化</button>
                        {discoveryPreview.feedbackOptions.map((option) => <button type="button" className={previewFeedback.includes(option) ? "selected" : ""} aria-pressed={previewFeedback.includes(option)} disabled={interviewRoundIndex > 0} onClick={() => togglePreviewFeedback(option)} key={option}>{option}</button>)}
                      </div>
                      <textarea
                        value={previewFeedbackCustom}
                        disabled={interviewRoundIndex > 0}
                        maxLength={500}
                        onChange={(event) => { invalidateFutureRounds(); setPreviewFeedbackCustom(event.target.value); setInterviewReadiness((current) => ({ ...current, canFinish: false })); }}
                        placeholder="直接告诉我哪里不对、需要补充什么，或哪些内容要保留……"
                        aria-label="对理解预演的补充反馈"
                      />
                      {interviewRoundIndex === 0 && (
                        <div className="discovery-preview-continue-row">
                          <button className="discovery-preview-continue" type="button" onClick={() => void advanceInterview()} disabled={busy || !interviewReady}>
                            <img src="https://unpkg.com/@tabler/icons@3.46.0/icons/outline/sparkles.svg" alt="" aria-hidden="true" />
                            {busy ? "AI 正在细化…" : "继续细化"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>}
                </article>
              )}

              {sourceInsights.map((insight, index) => (
                <article className="source-impact-card" key={`${insight.sourceName}-${index}`}>
                  <div className="source-impact-head"><span>PDF → 需求证据</span><div><strong>{insight.sourceName}</strong><small>{insight.documentType} · AI 判断为“{insight.roleLabel}”</small></div><em>已影响本轮问题</em></div>
                  <p>{insight.summary}</p>
                  <div className="source-trait-list">{insight.observableTraits.map((trait) => <span key={trait}>{trait}</span>)}</div>
                  <div className="source-evidence-row"><span>依据</span><p>{insight.evidence.join("；") || insight.roleReason}</p></div>
                  <div className="source-role-control"><span>这份资料应该作为</span>{(Object.keys(SOURCE_ROLE_LABELS) as SourceInsight["role"][]).map((role) => <button type="button" aria-pressed={insight.role === role} className={insight.role === role ? "selected" : ""} onClick={() => updateSourceRole(index, role)} key={role}>{SOURCE_ROLE_LABELS[role]}</button>)}</div>
                  <small className="source-privacy-note">{insight.privacyNote} · 这里只保存特征和页码证据，不把完整 PDF 塞进 Skill。</small>
                </article>
              ))}

              <div className={`understanding-evidence ${interviewEvidenceOpen ? "open" : ""}`}>
                <button className="understanding-evidence-toggle" type="button" aria-expanded={interviewEvidenceOpen} onClick={() => setInterviewEvidenceOpen((current) => !current)}>
                  <span><img src="https://unpkg.com/@tabler/icons@3.46.0/icons/outline/file-star.svg" alt="" aria-hidden="true" /></span>
                  <div><strong>告诉 AI 什么样才算对</strong><small>理想结果和反例能让 AI 看见你的标准，再把这些特征变成更准确的选择题。</small></div>
                  <em>{contextFilledCount + sourceNames.length ? `正在参考 ${contextFilledCount + sourceNames.length} 项上下文` : "还没有示例"}</em>
                  <i><img className={interviewEvidenceOpen ? "expanded" : ""} src="https://unpkg.com/@tabler/icons@3.46.0/icons/outline/chevron-down.svg" alt="" aria-hidden="true" /></i>
                </button>
                {interviewEvidenceOpen && (
                  <div className="understanding-example-fields">
                    <div className="understanding-example-field">
                      <span><strong>你理想的产出</strong><em>AI 提取结构与标准</em></span>
                      <textarea
                        id="understanding-ideal-output"
                        aria-label="你理想的产出"
                        value={contextNotes.idealOutput}
                        maxLength={20_000}
                        onChange={(event) => setContextNotes((current) => ({ ...current, idealOutput: event.target.value }))}
                        placeholder="粘贴一份你觉得很好的方案、文章、报告、代码或其他结果……"
                      />
                    </div>
                    <div className="understanding-example-field">
                      <span><strong>你不喜欢的结果</strong><em>AI 识别跑偏模式</em></span>
                      <textarea
                        id="understanding-negative-output"
                        aria-label="你不喜欢的结果"
                        value={contextNotes.negativeOutput}
                        maxLength={20_000}
                        onChange={(event) => setContextNotes((current) => ({ ...current, negativeOutput: event.target.value }))}
                        placeholder="粘贴反例，或直接写下哪里让你觉得不对……"
                      />
                    </div>
                    <div className="understanding-evidence-action">
                      <button type="button" onClick={regenerateCurrentInterviewRound} disabled={busy}>让 AI 参考示例，重做本轮理解</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="round-navigator" aria-label="需求澄清轮次">
                {INTERVIEW_ROUND_META.map((round, index) => (
                  <button
                    type="button"
                    className={`${index === interviewRoundIndex ? "active" : ""} ${index < highestRoundReached ? "done" : ""}`}
                    disabled={index > highestRoundReached}
                    onClick={() => setInterviewRoundIndex(index)}
                    key={round.title}
                  >
                    <span>{index < highestRoundReached ? "✓" : index + 1}</span>
                    <div><strong>{round.label}</strong></div>
                  </button>
                ))}
              </div>

              <div className="round-transition" key={`interview-round-${interviewRoundIndex}`}>
                <div className="round-heading">
                  <div><h3>{INTERVIEW_ROUND_META[interviewRoundIndex].title}</h3></div>
                  <strong>{currentAnsweredCount}/{questions.length}<small>本轮已回答</small></strong>
                </div>
                <div className="question-list">
                {questions.map((question, index) => {
                  const currentAnswer = answers[question.id] || "";
                  const selectedOptions = question.options.filter((option) => question.selectionMode === "multiple"
                    ? currentAnswer.split("；").includes(option)
                    : currentAnswer === option);
                  const isCustomAnswer = customQuestionIds.has(question.id)
                    || Boolean(currentAnswer && selectedOptions.length === 0);
                  return (
                    <div className={`question-card selection-${question.selectionMode}`} key={question.id}>
                      <span className="question-number">{String(index + 1).padStart(2, "0")}</span>
                      <span className="question-copy">
                        <span className="question-meta"><b>{question.dimension}</b><i>{question.selectionMode === "multiple" ? "可多选" : "单选"}</i></span>
                        <strong>{question.label}</strong><small>{question.helper}</small>
                      </span>
                      <div className="question-answer">
                        <div className={`question-options ${question.selectionMode}`} role={question.selectionMode === "single" ? "radiogroup" : "group"} aria-label={question.label}>
                          {question.options.map((option) => {
                            const selected = selectedOptions.includes(option) && !isCustomAnswer;
                            return (
                              <button
                               type="button"
                                className={`${selected ? "selected" : ""} ${autoSelectedQuestionIds.has(question.id) && selected ? "auto-selected" : ""} ${option === UNSURE_OPTION ? "unsure" : ""}`}
                                role={question.selectionMode === "single" ? "radio" : "checkbox"}
                                aria-checked={selected}
                                key={option}
                                onClick={() => toggleQuestionOption(question, option)}
                              >
                                <i className="choice-indicator" aria-hidden="true" />
                                <span className="choice-label">{option}</span>
                                {option === question.recommendedOption && <em>{autoSelectedQuestionIds.has(question.id) && selected ? "AI 自动选择" : selected ? "AI 推荐 · 已预选" : "AI 推荐"}</em>}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            className={`custom ${isCustomAnswer ? "selected" : ""}`}
                            role={question.selectionMode === "single" ? "radio" : "checkbox"}
                            aria-checked={isCustomAnswer}
                            onClick={() => showCustomQuestionInput(question)}
                          >
                            <i className="choice-indicator" aria-hidden="true" />
                            <span className="choice-label">都不符合，我自己说</span>
                          </button>
                        </div>
                        {isCustomAnswer && (
                          <input
                            value={currentAnswer}
                            onChange={(event) => updateCustomQuestionAnswer(question.id, event.target.value)}
                            placeholder={question.placeholder}
                            aria-label={`${question.label}的自定义回答`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>

              </div>
              <div className="stage-footer">
                <button className="secondary-button" onClick={() => interviewRoundIndex > 0 ? setInterviewRoundIndex(interviewRoundIndex - 1) : setStep("brief")}>{interviewRoundIndex > 0 ? "返回上一轮" : "返回修改一句话"}</button>
                <div className="adaptive-footer-actions">
                  {canFinishInterviewEarly && interviewRoundIndex < INTERVIEW_ROUND_META.length - 1 && <button className="secondary-button continue-detail" type="button" onClick={advanceInterview} disabled={busy || !interviewReady}>继续补充下一轮</button>}
                  <button className="primary-button" onClick={() => canFinishInterviewEarly ? void buildBlueprint(true) : void advanceInterview()} disabled={busy || (!canFinishInterviewEarly && !interviewReady)}>{busy ? "AI 正在处理…" : canFinishInterviewEarly ? "理解已足够，生成需求蓝图" : interviewRoundIndex === INTERVIEW_ROUND_META.length - 1 ? "生成完整需求蓝图" : "继续细化下一轮"}<span>→</span></button>
                </div>
              </div>
            </div>
          )}

          {step === "blueprint" && (
            <div className="stage-content blueprint-stage">
              <div className="stage-heading-row">
                <div>
                  <h2>这就是 AI 目前理解的你</h2>
                </div>
              </div>
              <div className="blueprint-grid">
                {blueprint.map((section) => (
                  <article className={`blueprint-card ${section.status}`} key={section.id}>
                    <div className="blueprint-top">
                      <div className="blueprint-title">
                        <span className="module-letter">{section.index}</span>
                        <h3>{section.title}</h3>
                      </div>
                      {section.status !== "ready" && <span className={`module-status ${section.status}`}>建议确认</span>}
                    </div>
                    <textarea
                      value={section.content}
                      onChange={(event) => setBlueprint((current) => current.map((item) => item.id === section.id ? { ...item, content: event.target.value } : item))}
                      aria-label={`${section.title}内容`}
                    />
                  </article>
                ))}
              </div>
              <section className={`loop-plan-card ${loopPlan.mode}`}>
                <div className="loop-plan-heading">
                  <div>
                    <span className="stage-kicker">AI 已推荐并采用一条可执行流程</span>
                    <h3>推荐工作流：目标、子目标与循环</h3>
                    <p>{loopPlan.reason}</p>
                  </div>
                  <span className="status-pill">✓ 已采用 · {loopPlan.label} · 最多 {loopPlan.maxRounds} 回合</span>
                </div>
                <div className="loop-goal">
                  <span>总目标</span>
                  <strong>{loopPlan.goal}</strong>
                </div>
                <div className="loop-columns">
                  <div className="loop-subgoals">
                    <div className="loop-section-title"><span>01</span><div><strong>必要子目标</strong><small>只保留完成总目标必须经过的中间状态</small></div></div>
                    {loopPlan.subgoals.map((item, index) => (
                      <article key={item.id}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <div><strong>{item.title}</strong><p>{item.outcome}</p><small>怎么确认：{item.verification}</small></div>
                      </article>
                    ))}
                  </div>
                  <div className="loop-gates">
                    <div className="loop-section-title"><span>02</span><div><strong>独立质检</strong><small>质检标准不是目标，只负责发现差距</small></div></div>
                    {loopPlan.qualityGates.map((item) => (
                      <article key={item.id}>
                        <div><strong>{item.criterion}</strong><em>{item.owner === "ai" ? "AI 可检查" : item.owner === "user" ? "需要你判断" : "AI 先检，你确认"}</em></div>
                        <p>{item.check}</p>
                      </article>
                    ))}
                  </div>
                </div>
              </section>
              <section className="capability-plan-card">
                <section className="tool-ability-picker">
                  <div className="tool-ability-heading">
                    <div><span>AI 工具建议</span></div>
                    <small>{optionalToolCapabilities.length ? `${optionalToolCapabilities.filter(capabilityIsActive).length} / ${optionalToolCapabilities.length} 已添加` : `${coreCapabilities.filter(capabilityIsActive).length} 项核心能力已采用`}</small>
                  </div>
                  {optionalToolCapabilities.length ? (
                    <div className="tool-ability-grid">
                      {optionalToolCapabilities.map((item) => {
                        const active = capabilityIsActive(item);
                        return (
                          <article className={`tool-ability-card ${active ? "selected" : ""}`} key={item.id}>
                            <button type="button" className="tool-ability-toggle" aria-pressed={active} onClick={() => toggleOptionalCapability(item)}>
                              <span className="capability-icon">{CAPABILITY_KIND_META[item.kind].icon}</span>
                              <span className="tool-ability-copy"><small>{CAPABILITY_KIND_META[item.kind].label}{item.recommended ? " · AI 推荐" : " · 可选"}</small><strong>{item.name}</strong><em>{item.reason}</em></span>
                              <span className="tool-toggle-state">{active ? "✓ 已添加" : "+ 添加能力"}</span>
                            </button>
                            {active && <div className="capability-contract"><span>何时用：{item.routingCondition}</span><span>输入：{item.input || "由当前任务提供"}</span><span>产出：{item.output || "可验证结果"}</span></div>}
                            {active && item.kind === "mcp" && item.status === "requires-setup" && (
                              <div className="mcp-setup-panel">
                                <div><strong>确认目标 Agent 中的连接</strong><p>只有安装并授权后才会写成可调用；否则取消添加即可，不会留下发布待办。</p></div>
                                <label><span>MCP Server 名称</span><input value={mcpDrafts[item.id] || ""} onChange={(event) => setMcpDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder={item.connection?.server || "例如：Notion MCP、GitHub MCP"} /></label>
                                {!!item.connection?.tools.length && <small>预计使用：{item.connection.tools.join("、")}</small>}
                                <div className="mcp-setup-actions"><button onClick={() => confirmMcpCapability(item)}>我已安装并授权</button><button onClick={() => chooseMcpFallback(item)}>取消添加</button></div>
                              </div>
                            )}
                            {active && item.kind === "mcp" && item.status === "use-provided" && item.connection?.verified && (
                              <div className="mcp-confirmed"><span>✓</span><div><strong>已确认 {item.connection.server}</strong><small>会生成调用契约、运行前检查和不可用时的替代路径。</small></div><button onClick={() => editMcpCapability(item)}>修改</button></div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  ) : <div className="tool-ability-empty"><strong>本次无需额外安装</strong><span>AI 已把完成任务必需的能力放进核心流程，没有为了显得“专业”而机械添加 MCP。你仍可从下面的能力库自行扩展。</span></div>}
                  <div className="capability-library-control">
                    <div><span>完整能力库</span><strong>宿主 Tools 与外部 MCP 分开选择</strong><p>宿主能力来自 Codex、Claude Code 等 Agent；MCP 是另行安装和授权的外部连接。Skill 只声明何时调用，不能凭空安装能力。</p></div>
                    <button type="button" aria-expanded={toolLibraryOpen} onClick={() => setToolLibraryOpen((current) => !current)}>{toolLibraryOpen ? "收起能力库" : `浏览全部 ${CAPABILITY_LIBRARY.length} 项`}<span>{toolLibraryOpen ? "↑" : "↓"}</span></button>
                  </div>
                  {toolLibraryOpen && (
                    <div className="capability-library">
                      <div className="capability-library-summary"><span>已从能力库添加 {selectedCatalogCapabilityCount} 项</span><small>真正可用范围以目标 Agent 当次暴露的 Tools / MCP 为准</small></div>
                      {(["文件与内容", "代码与自动化", "联网与界面", "外部服务 MCP"] as const).map((category) => (
                        <section className="capability-library-section" key={category}>
                          <div className="capability-library-section-heading"><strong>{category}</strong><span>{category === "外部服务 MCP" ? "需安装、授权并在运行时复查" : "需目标 Agent 实际提供"}</span></div>
                          <div className="capability-library-grid">
                            {CAPABILITY_LIBRARY.filter((item) => item.category === category).map((item) => {
                              const currentItem = capabilityPlan.items.find((candidate) => candidate.id === item.id);
                              const selected = Boolean(currentItem && capabilityIsActive(currentItem));
                              const recommended = Boolean(currentItem?.recommended);
                              return (
                                <button type="button" className={`capability-library-item ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={() => toggleCatalogCapability(item)} key={item.id}>
                                  <span className="capability-icon">{CAPABILITY_KIND_META[item.kind].icon}</span>
                                  <span><strong>{item.name}</strong><small>{item.reason}</small><em>{item.hosts.join(" · ")}</em></span>
                                  <b>{selected ? recommended ? "✓ AI 推荐 · 已添加" : "✓ 已添加" : "+ 添加"}</b>
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                      <details className="custom-mcp-disclosure">
                        <summary><span><strong>添加其他 MCP</strong><small>上面没有你要连接的服务时再展开</small></span><i>＋</i></summary>
                        <section className="custom-mcp-builder">
                          <div><strong>连接一个具体外部服务</strong><p>填写你真正准备连接的服务和 Server，不使用“万能 MCP”这类泛化名称。</p></div>
                          <label><span>外部服务</span><input value={customMcpName} onChange={(event) => setCustomMcpName(event.target.value)} placeholder="例如：Figma、Airtable、内部知识库" /></label>
                          <label><span>MCP Server</span><input value={customMcpServer} onChange={(event) => setCustomMcpServer(event.target.value)} placeholder="已安装或准备安装的具体 Server 名称" /></label>
                          <button type="button" onClick={addCustomMcpCapability}>加入并配置</button>
                        </section>
                      </details>
                    </div>
                  )}
                </section>
              </section>
              <div className="stage-footer">
                <button className="secondary-button" onClick={() => setStep("interview")}>继续让 AI 了解我</button>
                <button className="primary-button" onClick={() => setGenerationNoticeOpen(true)} disabled={busy || unresolvedMcpCount > 0}>{busy ? "正在生成专属文件…" : unresolvedMcpCount ? "先确认 MCP 再生成" : "确认理解并生成 Skill"}<span>→</span></button>
              </div>
            </div>
          )}

          {step === "build" && (
            <div className="build-stage">
              <div className="build-toolbar">
                <div><span className="stage-kicker">专属 Skill 已生成 · 所有文件都能直接编辑</span><h2>真正属于你的 Skill</h2></div>
                <div className="toolbar-actions"><button onClick={copySkill}>复制主文件</button><button className="primary-button compact" onClick={enterEvaluation} disabled={bundleAudit.blockers.length > 0 || busy}>{bundleAudit.blockers.length ? "修复后再评估" : busyTask === "evaluate" ? "正在开始评估…" : "进入评估"} <span>→</span></button></div>
              </div>
              {knowledgePack.status !== "idle" && (
                <section className={`knowledge-pack-panel ${knowledgePack.status}`} aria-label="生成阶段专业知识增强结果">
                  <div className="knowledge-pack-head">
                    <div><span>PROFESSIONAL KNOWLEDGE · 生成阶段联网编译</span><strong>{knowledgePackIsPublishable(knowledgePack) ? `已采纳 ${knowledgePack.atoms.length} 条专业知识与参考洞察` : knowledgePack.atoms.length ? `已保留 ${knowledgePack.atoms.length} 条候选，正在核对来源` : knowledgePack.status === "not-needed" ? "本次任务不需要额外领域知识" : knowledgePack.sources.length ? `已读取 ${knowledgePack.sources.length} 个来源，但没有形成具体可用的知识` : "已识别需要补充的专业知识"}</strong><p>{knowledgePack.summary}</p></div>
                    <div className="knowledge-pack-metrics"><span><b>{knowledgePack.sources.length}</b> 个来源</span><span><b>{knowledgePack.atoms.length}</b> 条采用</span><span><b>{knowledgePack.coverage.score}%</b> 维度覆盖</span><span><b>{knowledgePack.valueDensity}</b> 价值密度</span></div>
                  </div>
                  {knowledgePack.plan.knowledgeGaps.length > 0 && <div className="knowledge-gap-row"><span>本次重点寻找</span>{knowledgePack.plan.knowledgeGaps.map((gap) => <em key={gap}>{gap}</em>)}</div>}
                  {mcpConnections.length > 0 && knowledgeMcpReport && <div className={`knowledge-mcp-receipt ${knowledgeMcpReceiptState}`}>
                    <div className="knowledge-mcp-receipt-copy">
                      <span>INTERNAL MCP · 生成器取证回执</span>
                      <strong>{knowledgeMcpReceiptTitle}</strong>
                      <p>{knowledgeMcpReceiptState === "used"
                        ? `扫描 ${knowledgeMcpReport?.connectionsScanned || 0} 个连接、发现 ${knowledgeMcpReport?.toolsDiscovered || 0} 个 Tool，完成 ${knowledgeMcpCompletedCalls} 次只读调用；其中 ${knowledgeMcpAdoptedCount} 条 Knowledge Atom 使用了 MCP 来源。`
                        : knowledgeMcpReceiptState === "unconfigured"
                          ? "Evidence Router 已运行，但当前会话没有授权任何可检索的 MCP Server。本页专业知识来自网页检索，不会把网页来源冒充成 MCP。"
                          : knowledgeMcpReceiptState === "empty"
                            ? `扫描 ${knowledgeMcpReport?.connectionsScanned || 0} 个连接、发现 ${knowledgeMcpReport?.toolsDiscovered || 0} 个 Tool，但没有返回满足只读、可自动构造参数且正文可编译的证据。`
                            : knowledgeMcpReceiptState === "error"
                              ? knowledgeMcpReport?.error || "内部 MCP 调用失败，已安全降级到其他来源。"
                              : "这份结果生成时尚未保存 MCP 扫描回执；现有来源列表中没有 MCP 来源。下次生成会在这里显示连接、Tool、调用和采纳结果。"}</p>
                    </div>
                    <div className="knowledge-mcp-receipt-metrics" aria-label="MCP 取证统计">
                      <span><b>{knowledgeMcpReport?.connectionsScanned ?? "—"}</b> 连接</span>
                      <span><b>{knowledgeMcpReport?.toolsDiscovered ?? "—"}</b> Tools</span>
                      <span><b>{knowledgeMcpReport?.sources.length ?? 0}</b> 证据</span>
                      <span><b>{knowledgeMcpAdoptedCount}</b> 采用</span>
                    </div>
                    {knowledgeMcpReport?.attempts.length ? <details><summary>查看 MCP 调用记录</summary><ul>{knowledgeMcpReport.attempts.map((attempt, index) => <li key={`${attempt.query}-${attempt.toolName}-${index}`}><b>{attempt.status === "completed" ? "已返回" : attempt.status === "skipped" ? "已跳过" : attempt.status === "input_required" ? "需补充输入" : attempt.status === "authorization_required" ? "需授权" : "失败"}</b><span>{attempt.toolName || "未找到检索 Tool"}{attempt.query ? ` · ${attempt.query}` : ""}</span>{attempt.reason ? <em>{attempt.reason}</em> : null}</li>)}</ul></details> : null}
                  </div>}
                  {knowledgePack.sources.length > 0 && (knowledgePack.diagnostics?.candidateCount || 0) > 0 && <div className="knowledge-validation-note">联网检索已完成。Knowledge Compiler 共检查 {knowledgePack.diagnostics?.candidateCount || 0} 条候选，保留 {knowledgePack.atoms.length} 条；权威来源有 {knowledgePack.diagnostics?.authoritativeSourceCount || 0} 个，其中 {knowledgePack.diagnostics?.authoritativeSourceUseCount || 0} 个已进入运行规则。{(knowledgePack.diagnostics?.validatorRejectedCount || 0) > 0 ? `${knowledgePack.diagnostics?.validatorRejectedCount || 0} 条已带着具体原因进入自动修复。` : "其余候选属于模型主动放弃的泛化或冲突建议。"}</div>}
                  {knowledgePack.atoms.length > 0 && (
                    <details className="knowledge-atom-details">
                      <summary><span>查看已采纳的 {knowledgePack.atoms.length} 条知识明细</span><em>默认收起，按需展开</em><i>⌄</i></summary>
                      <div className="knowledge-atom-grid">
                        {knowledgePack.atoms.map((atom) => (
                          <article key={atom.id} className="knowledge-atom-card">
                            <div className="knowledge-atom-top"><span>{atom.applicationMode === "enforced" ? "权威规则" : atom.applicationMode === "conditional" ? "有条件实践" : "参考洞察"}</span><b>{atom.dimension} · {Math.round(atom.confidence * 100)}%</b></div>
                            <h3>{atom.title}</h3>
                            <p>{atom.knowledge}</p>
                            <dl><div><dt>什么时候使用</dt><dd>{atom.appliesWhen}</dd></div><div><dt>Skill 会怎么做</dt><dd>{atom.action}</dd></div></dl>
                            <div className="knowledge-source-row">{atom.sourceUrls.map((url) => {
                              const source = knowledgePack.sources.find((item) => item.url === url);
                              const authorityLabel = source?.authorityTier === "official" ? "官方一手"
                                : source?.authorityTier === "primary" ? "机构一手"
                                  : source?.authorityTier === "reputable_secondary" ? "专业二手"
                                    : source?.authorityTier === "community" ? "社区来源"
                                      : "待核来源";
                              return <a key={url} href={url} target="_blank" rel="noreferrer" title={source?.authorityReason}><span>↗ {source?.title || new URL(url).hostname}</span><em>{authorityLabel}</em></a>;
                            })}</div>
                            <div className="knowledge-write-row"><span>将写入</span>{atom.writeTo.map((path) => <code key={path}>{path}</code>)}</div>
                          </article>
                        ))}
                      </div>
                    </details>
                  )}
                  {knowledgePack.rejected.length > 0 && <details className="knowledge-rejected"><summary>为什么这 {knowledgePack.rejected.length} 条候选没有写入</summary><ul>{knowledgePack.rejected.map((item) => <li key={item}>{item}</li>)}</ul></details>}
                </section>
              )}
              <section className={`build-loop-result ${buildLoop.status}`} aria-label="Build Loop 结果">
                <div className="build-loop-copy">
                  <span>BUILD LOOP · 负责生成并冻结初始架构</span>
                  <strong>{gateOutcomes.build.verdict === "satisfied" ? "确定性结构验证完成，初始架构已冻结" : buildLoop.status === "attention" ? "Build Loop 仍有结构问题" : "正在从需求生成初始 Bundle"}</strong>
                  <p>{gateOutcomes.build.verdict === "satisfied" ? "这只证明语法、路径与跨文件契约可复现地成立，不代表实际任务效果已经验证。" : buildLoop.issues[0] || "需求 → Capability → Bundle"}</p>
                </div>
                <div className="gate-evidence-strip"><span>证据类型</span><strong>本地确定性检查</strong><em>{gateOutcomes.build.sampleSize} 项 · 可复现</em></div>
                <div className="build-loop-flow">
                  {BUILD_LOOP_STEPS.map((label, index) => {
                    const reachedIndex = buildLoop.frozen ? BUILD_LOOP_STEPS.length - 1 : BUILD_LOOP_PHASE_INDEX[buildLoop.phase];
                    const flowState = index < reachedIndex ? "done" : index === reachedIndex ? buildLoop.status === "attention" ? "failed" : "active" : "";
                    return <span className={flowState} key={label}><i>{flowState === "done" || buildLoop.frozen && index === reachedIndex ? "✓" : flowState === "failed" ? "!" : index + 1}</i>{label}</span>;
                  })}
                </div>
              </section>
              <section className={`generation-loop-result ${optimizationStableAtCeiling || optimizationCompletedWithRollback ? "completed" : generationLoop.status}`} aria-label="Optimization Loop 结果">
                <div className="generation-loop-head">
                  <div><span>OPTIMIZATION LOOP · 只做有证据的局部优化</span><strong>{gateOutcomes.optimization.verdict === "satisfied" ? "当前候选已被保留集与回归证据接受" : optimizationStableAtCeiling ? "评测已完成，当前版本处于稳定上限" : optimizationCompletedWithRollback ? "评测已完成，已保留当前最佳版本" : optimizationBlockedByBuild ? "等待 Build Loop 修复完成后启动" : generationLoop.status === "attention" ? "Optimization Loop 需要处理" : generationLoop.status === "running" ? "正在运行 Optimization Loop" : "尚未运行 Optimization Loop"}</strong><p>{optimizationStableAtCeiling ? "无 Skill 与当前版本都达到评测上限，保留任务全部通过。候选没有证明额外提升，系统已自动回滚并保留当前最佳版本。" : optimizationCompletedWithRollback ? "候选已完成真实试跑，但没有稳定优于当前版本，因此系统自动回滚候选。当前最佳版本没有被失败修改覆盖。" : generationLoop.stopReason}</p></div>
                  <div className="generation-loop-actions">
                    <em>{gateOutcomes.optimization.verdict === "satisfied" ? "✓ 已接受" : optimizationStableAtCeiling ? "✓ 已保留最佳版" : optimizationCompletedWithRollback ? "✓ 已安全回滚" : optimizationBlockedByBuild ? "未启动" : generationLoop.status === "attention" ? "需处理" : generationLoop.status === "running" ? "执行中" : "未运行"}</em>
                    {generationLoop.status === "attention" && !optimizationStableAtCeiling && files["SKILL.md"] && <button type="button" onClick={() => void rerunOptimizationLoop()} disabled={busy}>{busy ? "正在重跑…" : optimizationBlockedByBuild ? "继续修复并启动" : optimizationCompletedWithRollback ? "再次尝试优化" : "重跑 Optimization Loop"}</button>}
                  </div>
                </div>
                {optimizationBlockedByBuild
                  ? <div className="optimization-waiting-note">真实试跑尚未开始；当前只显示 Build Loop 的待修复原因，不提前展示评分、Lift 或 held-out 证据。</div>
                  : generationLoop.status !== "idle" && <div className="gate-evidence-strip"><span>证据类型</span><strong>{gateOutcomes.optimization.evidenceStrength === "repeated-held-out" ? "重复 held-out 比较" : "单次 held-out 观察"}</strong><em>{generationLoop.benchmarkCases} 个冻结场景 · 每个版本每场景 {generationLoop.benchmarkRepeatsPerCase} 次</em></div>}
                {!optimizationBlockedByBuild && <div className="generation-loop-flow optimization-loop-flow">
                  {OPTIMIZATION_LOOP_STEPS.map((label, index) => {
                    const reachedIndex = generationLoop.status === "passed" || generationLoop.minimalityChecked
                      ? OPTIMIZATION_LOOP_STEPS.length - 1
                      : generationLoop.phase === "complete"
                        ? generationLoop.benchmarkRuns > 0 ? 8 : 0
                        : generationLoop.phase === "validate" ? 8 : generationLoop.phase === "patch" ? 5 : generationLoop.phase === "diagnose" ? 4 : generationLoop.phase === "rollout" ? 3 : 0;
                    const flowState = generationLoop.status === "idle"
                      ? index === 0 ? "active" : ""
                      : generationLoop.minimalityChecked
                        ? "done"
                        : index < reachedIndex ? "done" : index === reachedIndex ? optimizationBlockedByBuild ? "" : generationLoop.status === "attention" ? "failed" : "active" : "";
                    return <span className={flowState} key={label}><i>{flowState === "done" ? "✓" : flowState === "failed" ? "!" : index + 1}</i>{label}</span>;
                  })}
                </div>}
                {generationLoop.status !== "idle" && !optimizationBlockedByBuild && <div className="generation-loop-metrics">
                  <div><span>独立评分 · 普通 AI</span><strong>{generationLoop.benchmarkRuns ? generationLoop.baselineScore : "—"}</strong></div>
                  <div><span>独立评分 · 当前 Skill</span><strong>{generationLoop.benchmarkRuns ? generationLoop.bestScore : "—"}</strong></div>
                  <div className={generationLoop.lift > 0 ? "positive" : ""}><span>独立评分 Lift</span><strong>{generationLoop.benchmarkRuns ? `${generationLoop.lift >= 0 ? "+" : ""}${generationLoop.lift}` : "—"}</strong></div>
                  <div><span>冻结断言通过率</span><strong>{generationLoop.benchmarkRuns ? `${generationLoop.passRate}%` : "—"}</strong></div>
                  <div><span>冻结场景正式总分</span><strong>{generationLoop.benchmarkRuns ? `${generationLoop.baselineQualityScore} / ${generationLoop.bestQualityScore}` : "—"}</strong></div>
                  <div><span>匿名 A/B 结果</span><strong>{generationLoop.blindWinner === "candidate" ? "当前 Skill 胜" : generationLoop.blindWinner === "baseline" ? "普通 AI 胜" : generationLoop.blindWinner === "tie" ? "两者持平" : "—"}</strong></div>
                  <div><span>试跑设计</span><strong>{generationLoop.benchmarkRuns ? `${generationLoop.benchmarkCases} 场景 × 每版 ${generationLoop.benchmarkRepeatsPerCase} 次` : "—"}</strong></div>
                  <div><span>重复运行稳定性</span><strong>{generationLoop.benchmarkRepeatsPerCase > 1 && generationLoop.bestStddev !== null ? `Skill σ ${generationLoop.bestStddev} · 基线 σ ${generationLoop.baselineStddev ?? "—"}` : "未测（每场景仅 1 次）"}</strong></div>
                </div>}
                {generationLoop.status !== "idle" && generationLoop.issues.length > 0 && <details className="generation-loop-issues"><summary>{optimizationStableAtCeiling ? `查看 ${generationLoop.issues.length} 条比较说明` : optimizationCompletedWithRollback ? `查看 ${generationLoop.issues.length} 条未采纳证据` : `查看仍需观察的 ${generationLoop.issues.length} 项`}</summary><ul>{generationLoop.issues.map((item) => <li key={item}>{friendlyReleaseBlocker(item)}</li>)}</ul></details>}
              </section>
              <div className="editor-shell">
                <div className="file-tree">
                  <div className="tree-heading">{activeSkillName.toUpperCase()}</div>
                  {Object.keys(files).map((name) => (
                    <button className={selectedFile === name ? "selected" : ""} key={name} onClick={() => setSelectedFile(name)}>
                      <span>{name.endsWith(".md") ? "M↓" : name.endsWith(".json") ? "{}" : name.endsWith(".py") ? ">_" : name.startsWith("assets/") ? "A" : "◇"}</span>{name}
                    </button>
                  ))}
                  <div className="tree-note"><strong>{Object.keys(files).length} 个文件</strong><span>按需加载，节省上下文</span></div>
                </div>
                <div className="code-pane">
                  <div className="code-tab"><span>{selectedFile}</span><span className="valid-mark">可编辑 · 本标签页自动保存</span></div>
                  <textarea
                    className="skill-file-editor"
                    value={files[selectedFile] || ""}
                    onChange={(event) => updateSelectedFileContent(event.target.value)}
                    aria-label={`编辑 ${selectedFile}`}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
                <div className="inspector-pane">
                  <div className="inspector-title"><span>文件解释</span><small>{selectedFileExplanation.kind}</small></div>
                  <div className="inspector-callout"><span>这个文件负责什么？</span><p>{selectedFileExplanation.summary}</p></div>
                  <section className="inspector-detail-section">
                    <strong>里面具体有什么</strong>
                    <ul>{selectedFileExplanation.contents.map((item) => <li key={item}>{item}</li>)}</ul>
                  </section>
                  <section className="inspector-detail-grid">
                    <div><span>什么时候会用</span><p>{selectedFileExplanation.usedWhen}</p></div>
                    <div><span>改了会影响什么</span><p>{selectedFileExplanation.affects}</p></div>
                    <div><span>怎么检查它</span><p>{selectedFileExplanation.validation}</p></div>
                    <div><span>关联文件</span><p>{selectedFileExplanation.related.length ? selectedFileExplanation.related.join("、") : "当前没有检测到直接文件引用"}</p></div>
                  </section>
                  <div className="inspector-stat"><span>预计上下文</span><strong>{Math.ceil((files[selectedFile]?.length || 0) / 4)} tokens</strong></div>
                  <div className="inspector-stat"><span>理解来源</span><strong>{sourceNames.length} 份资料 · {coveredDimensions.size} 个需求维度</strong></div>
                  <div className="inspector-stat"><span>发布前检查</span><strong className={bundleAudit.blockers.length ? "red-text" : "green-text"}>{bundleAudit.blockers.length ? `${bundleAudit.blockers.length} 项待修复` : "已通过"}</strong></div>
                </div>
              </div>
            </div>
          )}

          {step === "evaluate" && (
            <div className="stage-content eval-stage">
              <div className="stage-heading-row">
                <div><h2>验证效果</h2><p>让 Skill 真正完成一次任务，再分清哪些已经做好、哪些还能再提升、哪些还没有测到。</p></div>
              </div>

              {generationLoop.benchmarkRuns > 0 && generationLoop.comparisonRevision === currentBundleRevision && (() => {
                const comparisonPresentation = describeMultiSceneComparison(generationLoop);
                return (
                <section className={`user-proof-card ${comparisonPresentation.tone}`}>
                  <div className="user-proof-copy"><span>4 场景正式对照总分 · 与下方单场景分口径不同</span><strong>{comparisonPresentation.title}</strong><p>{comparisonPresentation.detail}</p></div>
                  <div className="user-proof-metrics">
                    <div><span>普通 AI · 4 场景总分</span><strong>{generationLoop.baselineQualityScore}</strong></div>
                    <div><span>你的 Skill · 4 场景总分</span><strong>{generationLoop.bestQualityScore}</strong></div>
                    {(() => {
                      const qualityDelta = generationLoop.bestQualityScore - generationLoop.baselineQualityScore;
                      return <div className={qualityDelta > 0 ? "positive" : qualityDelta < 0 ? "negative" : ""}><span>多场景变化</span><strong>{qualityDelta >= 0 ? "+" : ""}{qualityDelta}</strong></div>;
                    })()}
                    <div><span>评测证据</span><strong>{generationLoop.comparisonCaseCount} 个场景 · 每版每场景 {generationLoop.benchmarkRepeatsPerCase} 次</strong></div>
                  </div>
                  <button className="user-proof-refresh" type="button" onClick={() => void rerunMultiSceneComparison()} disabled={busy}>重新跑多场景对照 <span>→</span></button>
                  {generationLoop.comparisonEvidence.length > 0 && (
                    <details className="comparison-case-evidence">
                      <summary>查看每个冻结场景的真实得分与扣分原因</summary>
                      <ul>{generationLoop.comparisonEvidence.map((item) => (
                        <li key={item.caseId} className={item.delta < 0 ? "regressed" : item.delta > 0 ? "improved" : "equivalent"}>
                          <strong>{item.caseId}</strong>
                          <span>{item.baselineScore} → {item.skillScore}（{item.delta >= 0 ? "+" : ""}{item.delta}）</span>
                          {(item.failureReason || item.dimensionGaps.length > 0) && <p>{[item.failureReason, item.dimensionGaps.length ? `落后维度：${item.dimensionGaps.join("、")}` : ""].filter(Boolean).join("；")}</p>}
                        </li>
                      ))}</ul>
                    </details>
                  )}
                </section>
                );
              })()}
              {generationLoop.benchmarkRuns > 0 && generationLoop.comparisonRevision !== currentBundleRevision && (
                <section className="user-proof-card attention">
                  <div className="user-proof-copy"><span>最终版本对照尚未完成</span><strong>旧版本分数已隐藏</strong><p>Bundle 在最近一次匿名比较后发生了变化。系统不会把旧结果冒充为当前版本证据，请重新运行 Optimization Loop。</p></div>
                  <button className="user-proof-refresh" type="button" onClick={() => void rerunMultiSceneComparison()} disabled={busy}>重新验证当前版本 <span>→</span></button>
                </section>
              )}

              {!evalRan ? (
                demoReviewPending && skillDemo ? (
                  <>
                    {feedbackLoopSummary && <div className="loop-result-note"><span>本轮改了什么</span><p>{feedbackLoopSummary}</p></div>}
                    {renderSkillDemoCard(true)}
                    <div className="demo-review-checkpoint" role="status" aria-live="polite">
                      <span>✓</span>
                      <div><strong>Demo 已保存，不会重新生成</strong><p>{busy ? "AI 正在根据这份结果寻找具体差距。" : "刚才只中断了后续评估；点击继续时会直接使用上面的 Demo。"}</p></div>
                      <button className="primary-button compact" onClick={runEvaluation} disabled={busy}>{busy ? "正在评估…" : "继续完成评估"}<span>→</span></button>
                    </div>
                  </>
                ) : (
                  <div className="eval-empty">
                    <div className="radar-visual"><span>▶</span><small>真实 Demo</small></div>
                    <h3>先让它完成一次代表性任务</h3>
                    <p>AI 会根据你的目标和资料设计一条真实输入，再严格按当前 Skill 生成完整结果。之后才会指出不足，不再用文件是否齐全代替效果。</p>
                    <button className="primary-button" onClick={runEvaluation} disabled={busy}>{busy ? "正在生成 Demo…" : "生成第一版 Demo"}<span>↗</span></button>
                    <small>{hasRealModel ? `由 ${model} 试跑 · Key 通过服务端安全代理使用` : "需要先连接模型；不会用静态分数冒充真实试跑"}</small>
                  </div>
                )
              ) : (
                <>
                  {feedbackLoopSummary && <div className="loop-result-note"><span>本轮改了什么</span><p>{feedbackLoopSummary}</p></div>}
                  {personalizationHistory.length > 0 && (
                    <section className="personalization-history" aria-label="已经采用的迭代建议">
                      <div><span>不会丢失的迭代记录</span><strong>已经采用的建议</strong></div>
                      <ol>{personalizationHistory.slice(-4).reverse().map((entry) => <li key={entry.id}><em>第 {entry.round} 轮</em><p>{entry.feedback.map((item) => <span key={item}>{item}</span>)}</p><small>统一提交门禁 · 回归 {entry.testedCases || 0} 个冻结任务 · 修改 {entry.changedFiles.length} 个文件</small></li>)}</ol>
                    </section>
                  )}
                  {renderSkillDemoCard(false)}
                  <section className={`eval-report-panel ${evalDetailsOpen ? "expanded" : "collapsed"}`} aria-label="本轮效果报告">
                    <div className={`eval-report-summary ${needsWorkEvals.length ? "needs-work" : pendingEvals.length ? "partial" : "ready"}`}>
                      <div className="eval-report-verdict">
                        <span>本轮结论</span>
                        <strong>{evaluationHeadline}</strong>
                        <p>{evaluationSummary}</p>
                      </div>
                      <div className="eval-report-counts" aria-label="本轮证据状态">
                        <div><strong>{strongEvals.length}</strong><span>表现符合要求</span></div>
                        <div><strong>{needsWorkEvals.length}</strong><span>还能再提升</span></div>
                        <div><strong>{pendingEvals.length}</strong><span>还没有测到</span></div>
                      </div>
                      <button type="button" className="eval-report-toggle" onClick={() => setEvalDetailsOpen((current) => !current)} aria-expanded={evalDetailsOpen} aria-controls="eval-report-details">
                        {evalDetailsOpen ? "收起" : "展开"}<img src="https://unpkg.com/@tabler/icons@3.46.0/icons/outline/chevron-down.svg" alt="" aria-hidden="true" />
                      </button>
                    </div>
                    <div id="eval-report-details" className="eval-report-details" hidden={!evalDetailsOpen}>
                      <div className="eval-list" aria-label="五项效果验证">
                    {evals.map((result, index) => {
                      const history = optimizationHistory[result.label];
                      const delta = history ? result.score - history.before.score : 0;
                      const analyzingThis = optimizationOpen && optimizationTargetIndex === index && optimizationActive;
                      const pending = result.coverage === "not-covered";
                      const statusLabel = pending
                        ? "还没测到"
                        : result.score >= DEMO_SCORING_POLICY.observedGoodFloor
                          ? "这次表现符合要求"
                          : result.score >= DEMO_SCORING_POLICY.observedWarningFloor
                            ? "有一个明显差距"
                            : "优先提升";
                      return (
                        <article className={`eval-row ${history ? "optimized" : ""} ${pending ? "pending" : result.tone}`} key={result.label}>
                          <div className="eval-row-head">
                            <span className="eval-title-line"><strong>{result.label}</strong>{history && <em>复评 {delta >= 0 ? "+" : ""}{delta}</em>}</span>
                            <span className={`eval-status ${pending ? "pending" : result.tone}`}>{statusLabel}</span>
                          </div>
                          <div className={`eval-row-body ${pending ? "pending" : result.score < DEMO_SCORING_POLICY.observedGoodFloor ? "has-gap" : "good"}`}>
                            <div className="eval-observation"><span>{pending ? "为什么还不能判断" : "本轮看到的表现"}</span><p>{pending ? result.issue : result.strength || result.detail}</p></div>
                            {!pending && result.score < DEMO_SCORING_POLICY.observedGoodFloor && <div className="eval-next-gap"><span>还能再提升的地方</span><p>{result.issue || "本轮暂未发现明确差距。"}</p></div>}
                            {!pending && result.score >= DEMO_SCORING_POLICY.observedGoodFloor && <div className="eval-good-note"><span>结论</span><p>{result.detail}</p></div>}
                          </div>
                          <div className="eval-row-actions">
                            <details className="eval-evidence-details">
                              <summary>查看判断依据 <span>⌄</span></summary>
                              <div><p><strong>观察依据</strong>{result.evidence || "请结合上面的 Demo 判断。"}</p><p><strong>对实际使用的影响</strong>{result.impact || "这会影响结果是否真正可用。"}</p>{!pending && <p><strong>内部观察分</strong>{history && <del>{history.before.score}</del>} {result.score}/100</p>}</div>
                            </details>
                            {(pending || result.score < DEMO_SCORING_POLICY.observedGoodFloor || history) && <button className="eval-optimize-button" onClick={() => pending ? void runEvaluation() : void openOptimization(index)} disabled={optimizationActive || busy}>{pending ? "换场景验证" : analyzingThis ? "正在分析…" : history ? "继续优化" : "优化这一项"}<span>→</span></button>}
                          </div>
                        </article>
                      );
                    })}
                      </div>
                    </div>
                  </section>
                  <div className={`finding-card ${bundleAudit.blockers.length ? "" : "resolved"}`}>
                    <span className="finding-icon">{bundleAudit.blockers.length ? "!" : "✓"}</span>
                    <div><strong>{bundleAudit.blockers.length ? `文件发布检查还有 ${bundleAudit.blockers.length} 项` : "文件发布检查已通过"}</strong><p>{bundleAudit.blockers.length ? "这是文件结构、隐私和能力接入检查，与上面的 Demo 效果报告分开处理。" : bundleAudit.warnings.length ? "还有少量不会阻止下载的提醒，但不代表 Demo 已经符合你的主观标准。" : "文件可以正常发布；是否真的像你，仍以 Demo 和你的判断为准。"}</p></div>
                    {bundleAudit.blockers.length > 0 && <button onClick={() => void repairSkill()} disabled={busy}>{busyTask === "repair" ? "正在修复…" : "AI 修复并重新评估"}</button>}
                  </div>
                  <div className={`feedback-card ${feedbackSaved ? "saved" : ""}`}>
                    <div className="feedback-copy"><strong>{feedbackSaved ? "新一轮已经完成，再看一次结果" : "看完 Demo，哪里还不够懂你？"}</strong><p>这些选项来自本次产出的实际偏差。修改会先用既有保留任务检查回退，再生成新 Demo；只有全部完成才会替换当前 Skill。</p></div>
                    <div className="feedback-picker">
                      {personalizedFeedbackOptions.length
                        ? <div className="feedback-options">{personalizedFeedbackOptions.map((reason) => <button key={reason} className={feedbackReasons.includes(reason) ? "selected" : ""} onClick={() => toggleFeedback(reason)}>{feedbackReasons.includes(reason) ? "✓ " : "+ "}{reason}</button>)}</div>
                        : <div className="feedback-empty"><strong>这轮没有发现可见偏差</strong><span>可以换个场景继续验证；如果你看出了 AI 没发现的问题，也可以直接写在下面。</span><button type="button" onClick={() => void runEvaluation()} disabled={busy}>换个场景验证</button></div>}
                      <label className="feedback-custom"><span>或者直接说具体哪里不对</span><input value={feedbackCustom} onChange={(event) => { setFeedbackCustom(event.target.value); setFeedbackSaved(false); }} placeholder="例如：结论还是太晚，应该先给我可直接用的版本" /></label>
                    </div>
                    <button className="feedback-apply" onClick={() => void applyPersonalFeedback()} disabled={busy || personalizationRound >= PERSONALIZATION_MAX_ROUNDS}>{personalizationRound >= PERSONALIZATION_MAX_ROUNDS ? "已到自动优化上限" : busyTask === "personalize" ? "正在生成下一版…" : "确认并生成下一版 Demo"}</button>
                  </div>
                  <div className="stage-footer"><button className="secondary-button" onClick={() => setStep("build")}>查看 Skill 文件</button><button className="primary-button" onClick={() => setStep("ship")}>进入发布检查 <span>→</span></button></div>
                </>
              )}
            </div>
          )}

          {step === "ship" && (
            <div className="stage-content ship-stage">
              <div className="stage-heading-row">
                <div><div className="stage-kicker">把理解带在自己手里</div><h2>把懂你的 AI 带到任何地方</h2><p>选择目标 Agent，检查个人上下文范围，再下载专属 Skill。</p></div>
                <span className={`status-pill ${bundleAudit.blockers.length ? "attention" : "success"}`}>{bundleAudit.blockers.length ? `${bundleAudit.blockers.length} 项需要处理` : "发布前检查已通过"}</span>
              </div>
              <div className="platform-grid">
                {["Codex", "Claude Code", "Cursor", "GitHub Copilot", "Gemini CLI", "通用 SKILL.md"].map((name) => {
                  const selected = platforms.includes(name);
                  return <button key={name} aria-pressed={selected} className={selected ? "selected" : ""} onClick={() => setPlatforms((current) => selected ? current.filter((item) => item !== name) : [...current, name])}><span className="platform-icon"><PlatformMark name={name} /></span><strong>{name}</strong><small>{selected ? "已选择" : "点击添加"}</small><i>{selected ? "✓" : "+"}</i></button>;
                })}
              </div>
              {bundleAudit.blockers.length > 0 && (
                <section className="release-blocker-panel" role="alert" aria-live="polite">
                  <div className="release-blocker-icon">!</div>
                  <div className="release-blocker-copy">
                    <span>下载前还要处理 {bundleAudit.blockers.length} 项</span>
                    <h3>具体问题都在这里</h3>
                    <ol>{bundleAudit.blockers.map((item) => <li key={item}>{friendlyReleaseBlocker(item)}</li>)}</ol>
                  </div>
                  <div className="release-blocker-actions">
                    <button type="button" className="secondary-button" onClick={() => setStep("build")}>返回文件编辑</button>
                    <button type="button" className="primary-button" onClick={() => void repairSkill()} disabled={busy}>{busyTask === "repair" ? "正在修复…" : "让 AI 定向修复"}</button>
                  </div>
                </section>
              )}
              <section className="release-skill-preview">
                <div className="release-preview-head">
                  <div><span className="stage-kicker">发布前最后看一遍</span><h3>完整 Skill 文件</h3></div>
                  <button type="button" onClick={() => setStep("build")}>返回编辑</button>
                </div>
                <div className="release-preview-body">
                  <div className="release-file-list">
                    {Object.keys(files).map((name) => <button type="button" className={selectedFile === name ? "selected" : ""} key={name} onClick={() => setSelectedFile(name)}>{name}</button>)}
                  </div>
                  <div className="release-file-content"><div><span>{selectedFile}</span><small>{files[selectedFile]?.length || 0} 字符</small></div><pre><code>{files[selectedFile] || ""}</code></pre></div>
                </div>
              </section>
              <div className="deploy-summary">
                <div><span>将导出</span><strong>{Object.keys(files).length} 个文件 · {platforms.length} 个目标</strong></div>
                <div><span>规则与结构</span><strong className={bundleAudit.blockers.length ? "red-text" : "green-text"}>{bundleAudit.blockers.length ? `还有 ${bundleAudit.blockers.length} 个地方需要返回修复` : "什么时候出现、怎样做事、需要什么资料和如何自检都已通过"}</strong></div>
                <div><span>个人上下文</span><strong className="green-text">仅包含当前任务所需偏好</strong></div>
                <div><span>隐私扫描</span><strong>{bundleAudit.sensitive ? `检测到 ${bundleAudit.sensitive} 个常见直接标识` : "未检测到常见直接标识"}</strong></div>
              </div>
              <label className={`privacy-export-control ${allowSensitiveExport ? "raw" : ""}`}>
                <input type="checkbox" checked={allowSensitiveExport} onChange={(event) => setAllowSensitiveExport(event.target.checked)} />
                <span className="privacy-switch" aria-hidden="true"><i /></span>
                <span className="privacy-export-copy"><strong>允许导出原始敏感信息</strong><small>默认关闭：下载时会匿名化手机号、邮箱、证件号和常见密钥；开启前请确认分享范围。</small></span>
                <em>{allowSensitiveExport ? "原始导出" : "安全导出"}</em>
              </label>
              <div className="ship-actions"><button className="secondary-button" onClick={copySkill}>复制 SKILL.md</button><button className="primary-button large" onClick={downloadBundle} disabled={bundleAudit.blockers.length > 0}>{bundleAudit.blockers.length ? `先修复 ${bundleAudit.blockers.length} 项再下载` : "下载完整 Skill 包"} <span>↓</span></button></div>
              <p className="ship-footnote">ZIP 包可放入目标 Agent 的 skills 目录。默认安全导出不会修改你在页面中的原始资料。</p>
            </div>
          )}
        </section>

      </div>

      {generationNoticeOpen && (
        <div className="modal-backdrop generation-notice-backdrop" role="presentation" onPointerDown={(event) => { if (event.currentTarget === event.target) setGenerationNoticeOpen(false); }}>
          <section className="generation-notice-modal" aria-modal="true" role="dialog" aria-labelledby="generation-notice-title">
            <button className="close-button" aria-label="关闭生成提醒" onClick={() => setGenerationNoticeOpen(false)}>×</button>
            <span className="generation-notice-kicker">开始生成前</span>
            <h2 id="generation-notice-title">生成可能需要几分钟</h2>
            <p>SkillCanvas 会继续完成专业知识检索、Skill 生成、结构检查和自动优化。你不必一直停留在当前页面。</p>
            <div className={`generation-notice-permission ${notificationPermission}`}>
              <span aria-hidden="true">{notificationPermission === "granted" ? "✓" : "●"}</span>
              <div>
                <strong>{notificationPermission === "granted" ? "浏览器通知已开启" : notificationPermission === "denied" ? "浏览器已阻止通知" : notificationPermission === "unsupported" ? "当前浏览器不支持通知" : "完成后通过浏览器通知你"}</strong>
                <small>{notificationPermission === "granted" ? "生成完成、暂停或失败时都会自动提醒。" : notificationPermission === "denied" ? "你仍可继续生成，结果会保留在当前页面。" : notificationPermission === "unsupported" ? "你仍可继续生成，结果会保留在当前页面。" : "授权只用于本次网站的任务完成提醒。"}</small>
              </div>
            </div>
            <div className="generation-notice-actions">
              <button type="button" className="secondary-button" onClick={startGenerationWithoutNotification}>暂不通知，直接生成</button>
              <button type="button" className="primary-button" onClick={() => void startGenerationWithNotification()}>{notificationPermission === "granted" ? "开始生成" : notificationPermission === "denied" || notificationPermission === "unsupported" ? "继续生成" : "允许通知并开始生成"}<span>→</span></button>
            </div>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className={`modal-backdrop ${settingsClosing ? "closing" : ""}`} role="presentation" onPointerDown={(event) => { if (event.currentTarget === event.target) closeSettings(); }}>
          <section className="settings-modal" aria-modal="true" role="dialog" aria-labelledby="model-settings-title">
            <div className="modal-head"><div><span className="stage-kicker">BYOK · Bring your own key</span><h2 id="model-settings-title">连接你的 AI 模型</h2></div><button className="close-button" aria-label="关闭模型设置" onClick={closeSettings}>×</button></div>
            <div className="privacy-banner"><span>⌁</span><p><strong>Key 不再写入浏览器存储</strong><small>保存后会按当前会话隔离并加密存放在服务端凭据库；页面、日志和生成的 Skill 都拿不到明文。可随时在下方清除。</small></p></div>
            <div className="provider-options">
              {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => <button key={id} aria-pressed={provider === id} className={provider === id ? "selected" : ""} onClick={() => updateProvider(id)}><span><ProviderLogo id={id} /></span><strong>{PROVIDERS[id].name}</strong><i>{provider === id ? "●" : ""}</i></button>)}
            </div>
            <label className="form-field"><span>API Key {credentialStored && <em className="stored-credential">已加密保存</em>}</span><input type="password" autoComplete="off" value={apiKey} onChange={(event) => { setApiKey(event.target.value); setConnectionState("idle"); setAiGenerationIssue(""); }} placeholder={credentialStored ? "已安全保存；输入新 Key 可替换" : provider === "deepseek" ? "sk-••••••••••••" : "输入你的 API Key"} /></label>
            <div className="model-picker-head"><div><strong>选择模型</strong><span>可以直接选，也可以填写自定义模型 ID</span></div><button type="button" onClick={loadModels} disabled={modelLoading}>{modelLoading ? "读取中…" : "从 API 读取模型"}</button></div>
            {modelChoices.length > 0 && (
              <div className="model-options">
                {modelChoices.map((id) => {
                  const preset = PROVIDERS[provider].models.find((item) => item.id === id);
                  return (
                    <button type="button" key={id} aria-pressed={model === id} className={model === id ? "selected" : ""} onClick={() => chooseModel(id)}>
                      <span><strong>{preset?.label || id}</strong>{preset?.recommended && <em>推荐</em>}<small>{id}</small></span>
                      <p>{preset?.detail || "由当前 API 返回的可用模型"}</p>
                      <i>{model === id ? "当前" : "选择"}</i>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="form-row">
              <label className="form-field"><span>自定义模型 ID</span><input value={model} onChange={(event) => chooseModel(event.target.value)} /></label>
              <label className="form-field"><span>API 地址</span><input value={baseUrl} onChange={(event) => { setBaseUrl(event.target.value); setConnectionState("idle"); }} disabled={provider !== "compatible"} /></label>
            </div>
            <section className="research-settings">
              <div className="research-settings-head">
                <div><span className="stage-kicker">生成阶段 · 专业知识增强</span><h3>让 AI 先研究领域，再写 Skill</h3></div>
                <em className={researchReady ? "ready" : ""}>{researchReady ? "已配置" : researchProvider === "disabled" ? "未开启" : "待完成"}</em>
              </div>
              <p>它用于寻找专业流程、判断规则、例外和失败模式，并写入 Skill 的领域手册与评测；不是给生成后的 Skill 机械添加联网工具。</p>
              <div className="provider-options research-provider-options">
                {(Object.keys(RESEARCH_PROVIDERS) as ResearchProviderId[]).map((id) => (
                  <button type="button" key={id} aria-pressed={researchProvider === id} className={researchProvider === id ? "selected" : ""} onClick={() => updateResearchProvider(id)}>
                    <span>{RESEARCH_PROVIDERS[id].mark}</span><strong>{RESEARCH_PROVIDERS[id].name}</strong><i>{researchProvider === id ? "●" : ""}</i><small>{RESEARCH_PROVIDERS[id].detail}</small>
                  </button>
                ))}
              </div>
              {researchProvider === "firecrawl" && <label className="form-field"><span>Firecrawl API Key {researchCredentialStored && <em className="stored-credential">已加密保存</em>}</span><input type="password" autoComplete="off" value={researchApiKey} onChange={(event) => setResearchApiKey(event.target.value)} placeholder={researchCredentialStored ? "已安全保存；输入新 Key 可替换" : "fc-••••••••••••"} /></label>}
              {researchProvider === "searxng" && <label className="form-field"><span>SearXNG 地址</span><input value={researchBaseUrl} onChange={(event) => setResearchBaseUrl(event.target.value)} placeholder="https://search.your-domain.com" /></label>}
              <small className="research-privacy-note">检索服务只收到 AI 生成的专业问题和它自身的授权凭据；不会收到大模型 API Key、上传文件全文、原始业务材料或个人联系方式。网页证据会经过来源过滤后再交给模型编译。</small>
              <details className="internal-mcp-settings">
                <summary>
                  <span><strong>Workflow MCP 证据源</strong><small>供 Knowledge Compiler 与 Optimization Research 调用</small></span>
                  <em>{!mcpConnectionsLoaded ? "正在读取…" : mcpConnections.length ? `${mcpConnections.length} 个已连接` : "尚未连接"}</em>
                </summary>
                <div className="internal-mcp-settings-body">
                  <p>这里只连接生成器内部工作流要读取的 MCP Server。系统只会自动调用可识别的只读检索 Tool，并在最终页展示来源、调用与采纳记录。</p>
                  {mcpConnections.length > 0 && <div className="internal-mcp-connection-list">{mcpConnections.map((connection) => (
                    <div key={connection.id}><span><strong>{connection.name}</strong><small>{connection.serverUrl}</small></span><em>{connection.configured ? "已授权" : "无需 Token"}</em><button type="button" onClick={() => void removeMcpConnection(connection.id)} disabled={mcpConnectionBusy}>移除</button></div>
                  ))}</div>}
                  <div className="internal-mcp-connection-form">
                    <label className="form-field"><span>名称</span><input value={mcpConnectionName} onChange={(event) => setMcpConnectionName(event.target.value)} placeholder="例如：团队知识库" /></label>
                    <label className="form-field"><span>MCP Server URL</span><input value={mcpServerUrl} onChange={(event) => setMcpServerUrl(event.target.value)} placeholder="https://mcp.example.com" /></label>
                    <label className="form-field"><span>Bearer Token（可选）</span><input type="password" autoComplete="off" value={mcpBearerToken} onChange={(event) => setMcpBearerToken(event.target.value)} placeholder="只在 Server 要求时填写" /></label>
                    <button type="button" onClick={() => void registerMcpConnection()} disabled={mcpConnectionBusy}>{mcpConnectionBusy ? "正在验证…" : "连接并发现 Tools"}</button>
                  </div>
                  {mcpConnectionIssue && <div className="internal-mcp-connection-error" role="alert">{mcpConnectionIssue}</div>}
                </div>
              </details>
            </section>
            <div className="modal-footer">
              <button className="secondary-button" onClick={() => void clearPersistedCredentials()} disabled={!hasApiKey && !researchApiKey.trim() && !researchCredentialStored}>清除已保存凭据</button>
              <button className="secondary-button" onClick={testConnection} disabled={connectionState === "testing"}>{connectionState === "testing" ? "正在测试…" : "测试连接"}</button>
              <span className={`connection-result ${connectionState}`}>{connectionState === "ok" ? "✓ 连接成功" : connectionState === "error" ? "连接失败，请检查配置" : hasApiKey ? "测试可选，首次请求会自动验证" : "不填 Key 可以保存设置，但不能开始 AI 生成"}</span>
              <button className="primary-button" onClick={() => void saveModelSettings()}>保存设置</button>
            </div>
          </section>
        </div>
      )}

      {optimizationOpen && optimizationTarget && (
        <div className={`optimization-backdrop ${optimizationClosing ? "closing" : ""}`} role="presentation" onPointerDown={(event) => { if (event.currentTarget === event.target) closeOptimization(); }}>
          <section className="optimization-modal" aria-modal="true" role="dialog" aria-labelledby="optimization-title">
            <div className="optimization-head">
              <div><span className="stage-kicker">单项优化 · {optimizationTarget.label}</span><h2 id="optimization-title">{optimizationStatus === "complete" ? "看看这次优化有没有用" : "先选择真正值得改的点"}</h2></div>
              <button className="close-button" aria-label="关闭单项优化" onClick={closeOptimization} disabled={optimizationActive}>×</button>
            </div>

            <div className="optimization-baseline">
              <span className={`eval-dot ${optimizationTarget.tone}`} />
              <div><strong>当前评估</strong><p>{optimizationTarget.detail}</p></div>
              <b>{optimizationTarget.score}</b>
            </div>

            {optimizationStatus === "analyzing" && (
              <div className="optimization-loading" role="status" aria-live="polite">
                <div className="optimization-loading-copy"><span className="coach-avatar">AI</span><div><strong>正在用多项任务寻找共性问题</strong><small>训练任务用于找问题，独立验证任务不会提供给修改 Agent</small></div><b>{optimizationElapsed}s</b></div>
                <div className="optimization-scan"><span /></div>
                <p>系统会分别试跑训练组和验证组，只根据训练证据提出优化；验证组负责决定候选版本是否能够替换原版。</p>
              </div>
            )}

            {optimizationPlan && optimizationStatus !== "complete" && (
              <div className={`optimization-plan ${optimizationActive ? "working" : ""}`}>
                <div className="optimization-diagnosis"><span>诊断</span><p>{optimizationPlan.diagnosis}</p></div>
                <div className="optimization-choice-head"><div><strong>选择要执行的优化</strong><small>推荐项已预选，你可以自由增减</small></div><b>{selectedOptimizationIds.length}/{optimizationPlan.suggestions.length}</b></div>
                <div className="optimization-choices">
                  {optimizationPlan.suggestions.map((suggestion) => {
                    const selected = selectedOptimizationIds.includes(suggestion.id);
                    return (
                      <label className={selected ? "selected" : ""} key={suggestion.id}>
                        <input type="checkbox" checked={selected} disabled={optimizationActive} onChange={() => toggleOptimizationSuggestion(suggestion.id)} />
                        <span className="optimization-check" aria-hidden="true">{selected ? "✓" : ""}</span>
                        <span className="optimization-choice-copy">
                          <span><strong>{suggestion.title}</strong>{suggestion.recommended && <em>推荐</em>}{suggestion.risk === "medium" && <i>会改变行为</i>}</span>
                          <small>{suggestion.detail}</small>
                          <b>预期：{suggestion.impact}</b>
                          {suggestion.files.length > 0 && <span className="optimization-files">{suggestion.files.map((path) => <code key={path}>{path}</code>)}</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {optimizationActive && optimizationStatus !== "analyzing" && (
              <div className="optimization-run-state" role="status" aria-live="polite">
                <div><span className="coach-avatar">AI</span><p><strong>{optimizationStatus === "optimizing" ? "正在生成有限修改的候选版本" : "正在进行独立验证"}</strong><small>{optimizationStatus === "optimizing" ? `本轮最多 ${OPTIMIZATION_EDIT_BUDGET} 处局部修改，不直接覆盖当前 Skill` : "使用修改 Agent 没看过的保留任务；没有严格提升就自动回滚"}</small></p><b>{optimizationElapsed}s</b></div>
                <div className="optimization-scan"><span /></div>
              </div>
            )}

            <div className="optimization-steps" aria-label="优化进度">
              {["多任务找共性", "有限候选修改", "独立验证门控"].map((label, index) => (
                <span className={optimizationPhaseIndex > index ? "done" : optimizationPhaseIndex === index && optimizationStatus !== "ready" ? "active" : ""} key={label}><i>{optimizationPhaseIndex > index ? "✓" : index + 1}</i>{label}</span>
              ))}
            </div>

            {optimizationStatus === "error" && (
              <div className="optimization-error" role="alert"><span>!</span><div><strong>这一步没有完成</strong><p>{optimizationIssue}</p></div></div>
            )}

            {optimizationStatus === "complete" && optimizationTargetHistory && (
              <div className={`optimization-result ${optimizationTargetHistory.accepted ? "accepted" : "rejected"}`} aria-live="polite">
                <div className="optimization-gate-decision">
                  <span>{optimizationTargetHistory.accepted ? "✓" : "↶"}</span>
                  <div><strong>{optimizationTargetHistory.accepted ? "候选版本已通过，成为当前最佳版本" : "候选版本未通过，已自动回滚"}</strong><small>使用 {optimizationTargetHistory.testedCases} 项独立任务验证 · 目标维度必须严格提升且其他关键能力不能明显退步</small></div>
                </div>
                <div className="optimization-score-change">
                  <div><span>原版验证分</span><strong>{optimizationTargetHistory.before.score}</strong></div>
                  <i>→</i>
                  <div className="after"><span>候选验证分</span><strong>{optimizationTargetHistory.after.score}</strong></div>
                  <b>{optimizationTargetHistory.after.score - optimizationTargetHistory.before.score >= 0 ? "+" : ""}{optimizationTargetHistory.after.score - optimizationTargetHistory.before.score} pts</b>
                </div>
                <div className="optimization-result-copy"><strong>{optimizationTargetHistory.accepted ? "这次具体改变了什么" : "为什么没有采用"}</strong><p>{optimizationTargetHistory.summary}</p></div>
                <div className="optimization-applied"><span>{optimizationTargetHistory.accepted ? "已采用" : "候选修改"}</span>{optimizationTargetHistory.appliedTitles.map((title) => <b key={title}>{optimizationTargetHistory.accepted ? "✓" : "○"} {title}</b>)}</div>
                {optimizationTargetHistory.evidence.length > 0 && <div className="optimization-evidence"><span>验证证据</span>{optimizationTargetHistory.evidence.map((item, index) => <p key={`${index}-${item}`}>{item}</p>)}</div>}
                <div className="optimization-changed-files"><span>{optimizationTargetHistory.accepted ? "已修改" : "候选曾修改"} {optimizationTargetHistory.changedFiles.length} 个文件</span>{optimizationTargetHistory.changedFiles.map((path) => <code key={path}>{path}</code>)}</div>
              </div>
            )}

            <div className="optimization-footer">
              {optimizationStatus === "ready" && <><button className="secondary-button" onClick={closeOptimization}>暂不优化</button><button className="primary-button" onClick={() => void runSelectedOptimization()} disabled={!selectedOptimizationIds.length}>优化所选 {selectedOptimizationIds.length} 项 <span>→</span></button></>}
              {optimizationStatus === "error" && <><button className="secondary-button" onClick={closeOptimization}>稍后再试</button><button className="primary-button" onClick={() => optimizationPlan ? void runSelectedOptimization() : optimizationTargetIndex !== null ? void openOptimization(optimizationTargetIndex) : undefined}>重试当前步骤 <span>↗</span></button></>}
              {optimizationStatus === "complete" && <>{optimizationTargetHistory?.accepted && <button className="secondary-button" onClick={viewOptimizedFiles}>查看修改文件</button>}<button className="secondary-button" onClick={() => optimizationTargetIndex !== null ? void openOptimization(optimizationTargetIndex) : undefined}>继续优化</button><button className="primary-button" onClick={closeOptimization}>完成</button></>}
            </div>
          </section>
        </div>
      )}

      {busyTask && (
        <div className={`ai-progress-backdrop ${busyClosing ? "closing" : ""}`}>
          <section className="ai-progress-panel" role="status" aria-live="polite" aria-label="AI 正在处理">
            <div className="ai-progress-top">
              <span className="coach-avatar">AI</span>
              <div><strong>{BUSY_STAGES[busyTask].title}</strong><small>当前阶段：{busyStage}</small></div>
              <b>已等待 {busyElapsedLabel}</b>
            </div>
            <div className={`busy-execution-status ${busyExecutionKind}`} key={`${busyStage}-${busyExecutionKind}-${busyExecutionNote}`}>
              <span>{busyExecutionLabel}</span>
              <p>{busyExecutionNote}</p>
            </div>
            <div className={`thinking-warp ${busyTask} ${busyExecutionKind}`} aria-hidden="true">
              <span className="warp-core">AI</span>
              {thinkingWords.map((word, index) => (
                <i key={`${word}-${index}`} style={{ "--word-index": index, animationDelay: `${index * 170}ms` } as CSSProperties}>{word}</i>
              ))}
            </div>
            <div className="ai-progress-track"><span /></div>
            <div className="ai-progress-steps">
              {BUSY_STAGES[busyTask].stages.map((stageName, index) => (
                <div className={index < busyStageIndex ? "done" : index === busyStageIndex ? "active" : ""} key={stageName}>
                  <i aria-hidden="true">{index < busyStageIndex ? "✓" : index === busyStageIndex ? "●" : ""}</i>
                  <span><strong>{stageName}</strong><small>{index < busyStageIndex ? "已完成" : index === busyStageIndex ? "进行中" : "待进行"}</small></span>
                  {index < BUSY_STAGES[busyTask].stages.length - 1 && <img className="progress-step-arrow" src="https://unpkg.com/@tabler/icons@3.46.0/icons/outline/chevron-right.svg" alt="" aria-hidden="true" />}
                </div>
              ))}
            </div>
            <small className={`ai-progress-note ${busyExecutionKind === "model" && busyElapsed >= 25 ? "slow" : ""}`}>{busyStatusNote}</small>
          </section>
          </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
