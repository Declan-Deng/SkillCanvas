import type { FailedCaseEvidence, TextualGradientFeedback } from "./optimizer-core";

export const DECISION_LEDGER_PATH = "evals/decision-ledger.json";
export const DECISION_LEDGER_VERSION = "1.0" as const;

export type DecisionSource = "generation-loop" | "optimization" | "personalization" | "minimality-pass";
export type DecisionOutcome = "accepted" | "rolled-back";

export type DecisionLedgerEntry = {
  schemaVersion: typeof DECISION_LEDGER_VERSION;
  id: string;
  createdAt: string;
  source: DecisionSource;
  outcome: DecisionOutcome;
  baselineRevision: string;
  candidateRevision: string;
  contractDigest: string;
  policy: {
    id: string;
    version: string;
    mode: string;
  };
  evaluation: {
    runIds: string[];
    caseIds: string[];
    baselineScore: number | null;
    candidateScore: number | null;
    delta: number | null;
    regressions: string[];
  };
  textualGradient: TextualGradientFeedback;
  failedCases: FailedCaseEvidence[];
  decision: {
    reasons: string[];
    changedFiles: string[];
    rollbackReason: string;
  };
  consumedDecisionIds: string[];
  evidenceDigest: string;
};

export type DecisionLedger = {
  schemaVersion: typeof DECISION_LEDGER_VERSION;
  description: string;
  entries: DecisionLedgerEntry[];
};

const EMPTY_GRADIENT: TextualGradientFeedback = { summary: "", criticalProblems: [], preserve: [] };

function stableDigest(value: unknown) {
  const serialized = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `decision-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function strings(value: unknown, limit = 24) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()).slice(0, limit)
    : [];
}

function normalizeGradient(value: unknown): TextualGradientFeedback {
  if (!value || typeof value !== "object") return { ...EMPTY_GRADIENT };
  const raw = value as Partial<TextualGradientFeedback>;
  return {
    summary: typeof raw.summary === "string" ? raw.summary.trim().slice(0, 1_200) : "",
    criticalProblems: Array.isArray(raw.criticalProblems) ? raw.criticalProblems.flatMap((problem, index) => {
      if (!problem || typeof problem !== "object") return [];
      const item = problem as TextualGradientFeedback["criticalProblems"][number];
      if (!item.critique?.trim() || !item.direction?.trim()) return [];
      return [{
        id: item.id?.trim() || `gradient-${index + 1}`,
        critique: item.critique.trim().slice(0, 800),
        direction: item.direction.trim().slice(0, 800),
        caseIds: strings(item.caseIds, 12),
        affectedCapabilities: strings(item.affectedCapabilities, 12),
      }];
    }).slice(0, 6) : [],
    preserve: strings(raw.preserve, 12),
  };
}

export function createDecisionLedgerEntry(input: Omit<DecisionLedgerEntry, "schemaVersion" | "createdAt" | "evidenceDigest"> & { createdAt?: string }): DecisionLedgerEntry {
  const normalized = {
    ...input,
    schemaVersion: DECISION_LEDGER_VERSION,
    createdAt: input.createdAt || new Date().toISOString(),
    contractDigest: input.contractDigest || "not-recorded",
    policy: {
      id: input.policy.id || "unknown-policy",
      version: input.policy.version || "1",
      mode: input.policy.mode || "unspecified",
    },
    evaluation: {
      ...input.evaluation,
      runIds: strings(input.evaluation.runIds),
      caseIds: strings(input.evaluation.caseIds),
      regressions: strings(input.evaluation.regressions),
    },
    textualGradient: normalizeGradient(input.textualGradient),
    failedCases: Array.isArray(input.failedCases) ? input.failedCases.slice(0, 20) : [],
    decision: {
      reasons: strings(input.decision.reasons),
      changedFiles: strings(input.decision.changedFiles),
      rollbackReason: input.outcome === "rolled-back" ? input.decision.rollbackReason.trim() || "候选未通过提交策略" : "",
    },
    consumedDecisionIds: strings(input.consumedDecisionIds),
  };
  return { ...normalized, evidenceDigest: stableDigest(normalized) };
}

export function parseDecisionLedger(raw: string | undefined): DecisionLedger {
  if (!raw?.trim()) return {
    schemaVersion: DECISION_LEDGER_VERSION,
    description: "记录每个候选为何被接受或回滚，以及下一轮实际消费了哪些文本反馈。",
    entries: [],
  };
  try {
    const parsed = JSON.parse(raw) as Partial<DecisionLedger>;
    return {
      schemaVersion: DECISION_LEDGER_VERSION,
      description: typeof parsed.description === "string" && parsed.description.trim()
        ? parsed.description.trim()
        : "记录每个候选为何被接受或回滚，以及下一轮实际消费了哪些文本反馈。",
      entries: Array.isArray(parsed.entries)
        ? parsed.entries.filter((entry): entry is DecisionLedgerEntry => Boolean(entry && typeof entry === "object" && entry.id && entry.outcome)).slice(-40)
        : [],
    };
  } catch {
    return {
      schemaVersion: DECISION_LEDGER_VERSION,
      description: "记录每个候选为何被接受或回滚，以及下一轮实际消费了哪些文本反馈。",
      entries: [],
    };
  }
}

export function appendDecisionLedgerEntry(files: Record<string, string>, entry: DecisionLedgerEntry) {
  const ledger = parseDecisionLedger(files[DECISION_LEDGER_PATH]);
  const entries = [...ledger.entries.filter((item) => item.id !== entry.id), entry].slice(-40);
  return {
    ...files,
    [DECISION_LEDGER_PATH]: `${JSON.stringify({ ...ledger, entries }, null, 2)}\n`,
  };
}

export function decisionLedgerFeedback(files: Record<string, string>, input: { source?: DecisionSource; limit?: number } = {}) {
  const limit = Math.max(1, Math.min(12, input.limit || 6));
  return parseDecisionLedger(files[DECISION_LEDGER_PATH]).entries
    .filter((entry) => entry.outcome === "rolled-back" && (!input.source || entry.source === input.source))
    .slice(-limit)
    .map((entry) => ({
      decisionId: entry.id,
      evidenceDigest: entry.evidenceDigest,
      reason: entry.decision.rollbackReason || entry.decision.reasons.join("；"),
      changedFiles: entry.decision.changedFiles,
      textualFeedback: entry.textualGradient,
      failedCases: entry.failedCases,
    }));
}
