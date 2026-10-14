import type { BenchmarkCaseComparison } from "./real-eval-harness";

export type ComparisonDisplay = { title: string; baseline: string; skill: string };
export type AnonymousComparisonDisplay = { title: string; A: string; B: string };
export type ComparisonBenefit = { caseId: string; title: string; task: string; detail: string; baseline?: string; skill?: string };

/** Presentation is optional: bad/missing display copy must never block Eval. */
function readableChinese(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  const text = value.trim().slice(0, limit);
  const han = text.match(/[\u3400-\u9fff]/g)?.length || 0;
  const latin = text.match(/[a-z]/gi)?.length || 0;
  return han >= 4 && han / (han + latin) >= 0.3 ? text : "";
}

export function normalizeAnonymousComparisonDisplay(value: unknown): AnonymousComparisonDisplay | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const title = readableChinese(raw.title, 48);
  const A = readableChinese(raw.A, 240);
  const B = readableChinese(raw.B, 240);
  if (!title || !A || !B || A === B || /\[[^\]]+\]|^(帮我|我要|请你)/.test(title)) return undefined;
  return { title, A, B };
}

/** Reveal only after judging. Never assume A = ordinary AI. */
export function revealComparisonDisplay(
  value: unknown,
  reveal: { A: "left" | "right"; B: "left" | "right" },
): ComparisonDisplay | undefined {
  const display = normalizeAnonymousComparisonDisplay(value);
  if (!display || reveal.A === reveal.B) return undefined;
  return { title: display.title, baseline: reveal.A === "left" ? display.A : display.B, skill: reveal.A === "right" ? display.A : display.B };
}

export function comparisonBenefits(
  rows: Array<BenchmarkCaseComparison & { verdict: string; title: string; explanation: string }>,
  options: { current: boolean; pending: boolean },
): ComparisonBenefit[] {
  if (!options.current || options.pending) return [];
  const seen = new Set<string>();
  return rows.flatMap((row): ComparisonBenefit[] => {
    // Numeric lift, a tie, or praise from a single Demo is not a head-to-head win.
    if (row.verdict !== "candidate" || row.blindVerdict !== "candidate" || !row.baselineOutput?.trim() || !row.skillOutput?.trim()) return [];
    const display = row.comparisonDisplay;
    const title = readableChinese(display?.title, 48);
    const baseline = readableChinese(display?.baseline, 240);
    const skill = readableChinese(display?.skill, 240);
    const legacyDetail = readableChinese(row.explanation, 700);
    const hasDisplay = Boolean(title && baseline && skill && baseline !== skill);
    // Old English/anonymous-only receipts stay available in full results; do
    // not guess a translation or invent an advantage to populate the card.
    if (!hasDisplay && (!legacyDetail || /\b[AB]\b/.test(legacyDetail))) return [];
    const benefit: ComparisonBenefit = {
      caseId: row.caseId,
      task: row.title,
      title: hasDisplay ? title : "这次回答更符合你的要求",
      detail: hasDisplay ? "" : legacyDetail,
      ...(hasDisplay ? { baseline, skill } : {}),
    };
    const fingerprint = JSON.stringify([benefit.title, benefit.baseline, benefit.skill, benefit.detail]);
    if (seen.has(fingerprint)) return [];
    seen.add(fingerprint);
    return [benefit];
  });
}
