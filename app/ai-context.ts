import { classifyUserEvidence } from "./user-evidence.ts";

type SkillFileMap = Record<string, string>;

const TRIAL_CORE_PATHS = [
  "SKILL.md",
  "references/requirements.md",
  "references/quality-criteria.md",
  "references/examples.md",
  "references/personal-context.md",
  "references/source-evidence.md",
  "references/loop-plan.md",
  "references/capability-plan.md",
  "integrations/tool-contracts.json",
];

const OPTIMIZATION_CORE_PATHS = [
  "SKILL.md",
  "references/requirements.md",
  "references/quality-criteria.md",
  "references/domain-playbook.md",
  "references/capability-plan.md",
  "references/loop-plan.md",
  "integrations/tool-contracts.json",
];

function plainText(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "";
  }
}

function asSkillFiles(value: unknown): SkillFileMap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const files = Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => (
    typeof entry[0] === "string" && typeof entry[1] === "string"
  )));
  return Object.keys(files).length ? files : null;
}

function referencedPaths(content: string, available: Set<string>) {
  const matches = content.match(/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+/g) || [];
  return matches.map((path) => path.replace(/[),.;:'"`]+$/g, "")).filter((path) => available.has(path));
}

function boundedFileExcerpt(content: string, budget: number) {
  if (content.length <= budget) return content;
  const marker = "\n\n[COMPILER_CONTEXT_TRUNCATED: the source file continues; this transport excerpt is not evidence that the file or its final rule is incomplete.]";
  const usable = Math.max(120, budget - marker.length);
  const boundary = Math.max(content.lastIndexOf("\n### ", usable), content.lastIndexOf("\n## ", usable), content.lastIndexOf("\n", usable));
  const safeBoundary = boundary >= Math.floor(usable * 0.55) ? boundary : usable;
  return `${content.slice(0, safeBoundary).trimEnd()}${marker}`.slice(0, budget);
}

function balancedExcerpt(content: string, budget: number, marker: string) {
  if (content.length <= budget) return content;
  const usable = Math.max(160, budget - marker.length);
  const headBudget = Math.max(100, Math.floor(usable * 0.68));
  const tailBudget = Math.max(60, usable - headBudget);
  const headBoundary = Math.max(content.lastIndexOf("\n", headBudget), content.lastIndexOf("。", headBudget));
  const tailStart = Math.max(headBudget, content.length - tailBudget);
  const tailBoundary = content.indexOf("\n", tailStart);
  const head = content.slice(0, headBoundary >= Math.floor(headBudget * 0.55) ? headBoundary : headBudget).trimEnd();
  const tail = content.slice(tailBoundary > 0 ? tailBoundary + 1 : tailStart).trimStart();
  return `${head}${marker}${tail}`.slice(0, budget);
}

/**
 * Recreates Agent-style progressive disclosure for trial runs: start with the
 * Skill entrypoint, then include only core and explicitly linked resources.
 */
export function compactSkillBundleForTrial(value: unknown, maxChars = 20_000) {
  const files = asSkillFiles(value);
  if (!files) return plainText(value).slice(0, maxChars);

  const available = new Set(Object.keys(files));
  const entryLinks = referencedPaths(files["SKILL.md"] || "", available);
  const queue = [
    ...(available.has("SKILL.md") ? ["SKILL.md"] : []),
    ...entryLinks,
    ...TRIAL_CORE_PATHS.filter((path) => path !== "SKILL.md" && available.has(path) && !entryLinks.includes(path)),
  ];
  const selected: string[] = [];
  const seen = new Set<string>();

  while (queue.length) {
    const path = queue.shift();
    if (!path || seen.has(path)) continue;
    seen.add(path);
    selected.push(path);
    referencedPaths(files[path] || "", available).forEach((reference) => {
      if (!seen.has(reference)) queue.push(reference);
    });
  }

  let remaining = Math.max(1_000, maxChars);
  const sections: string[] = [];
  for (const [index, path] of selected.entries()) {
    if (remaining < 180) break;
    const header = `\n\n## ${path}\n`;
    const filesLeft = selected.length - index;
    const fairShare = Math.max(400, Math.floor(remaining / filesLeft) - header.length);
    const contentBudget = Math.min(path === "SKILL.md" ? 9_000 : 5_000, fairShare, remaining - header.length);
    if (contentBudget <= 0) break;
    const section = `${header}${boundedFileExcerpt(files[path], contentBudget)}`;
    sections.push(section);
    remaining -= section.length;
  }
  return sections.join("").trim().slice(0, maxChars);
}

/**
 * Route optimizer context by the issue surface instead of retransmitting the
 * complete bundle on every diagnose/replan request. Canonical SkillIR and Eval
 * evidence travel in their own fields, so this excerpt only needs the runtime
 * entrypoint, relevant canonical projections, and implementation bytes named by
 * the current issue. No source file is mutated or semantically summarized.
 */
export function compactSkillBundleForOptimization(
  value: unknown,
  routingEvidence: unknown,
  maxChars = 24_000,
) {
  const files = asSkillFiles(value);
  if (!files) return plainText(value).slice(0, maxChars);

  const available = new Set(Object.keys(files));
  const evidenceText = plainText(routingEvidence);
  const directlyNamed = Object.keys(files).filter((path) => evidenceText.includes(path));
  const selected: string[] = [];
  const seen = new Set<string>();
  const enqueue = (path: string) => {
    if (!available.has(path) || seen.has(path)) return;
    seen.add(path);
    selected.push(path);
  };

  enqueue("SKILL.md");
  directlyNamed.forEach(enqueue);
  OPTIMIZATION_CORE_PATHS.forEach(enqueue);

  // Include resources that the selected runtime files actually route to. This
  // preserves progressive disclosure without pulling in unrelated private
  // history, the full Eval bank, or compiler-generated projections.
  for (let index = 0; index < selected.length; index += 1) {
    referencedPaths(files[selected[index]] || "", available).forEach(enqueue);
  }

  let remaining = Math.max(1_000, maxChars);
  const sections: string[] = [];
  for (const [index, path] of selected.entries()) {
    if (remaining < 180) break;
    const header = `\n\n## ${path}\n`;
    const filesLeft = selected.length - index;
    const fairShare = Math.max(500, Math.floor(remaining / filesLeft) - header.length);
    const pathLimit = path === "SKILL.md" ? 7_000 : /^(?:scripts|assets)\//.test(path) ? 6_000 : 4_000;
    const contentBudget = Math.min(pathLimit, fairShare, remaining - header.length);
    if (contentBudget <= 0) break;
    const section = `${header}${boundedFileExcerpt(files[path], contentBudget)}`;
    sections.push(section);
    remaining -= section.length;
  }
  return sections.join("").trim().slice(0, maxChars);
}

/** Preserve evidence from multiple user-context sections instead of keeping
 * only the beginning of a large uploaded-material summary. */
export function compactSourceContextForTrial(value: unknown, maxChars = 8_000) {
  const source = plainText(value).trim();
  if (source.length <= maxChars) return source;
  const sections = source.split(/(?=^#\s)/m).map((item) => item.trim()).filter(Boolean);
  const marker = "\n\n[CONTEXT_MIDDLE_OMITTED: leading and trailing evidence retained.]\n\n";
  if (sections.length <= 1) return balancedExcerpt(source, maxChars, marker);

  const perSection = Math.max(600, Math.floor(maxChars / sections.length));
  return sections.map((section) => balancedExcerpt(section, perSection, marker)).join("\n\n").slice(0, maxChars);
}

/**
 * Retry transport for the requirements interview. Every confirmed answer is
 * retained; verbose question wording receives a fair per-item budget instead
 * of letting an early answer truncate later decisions.
 */
export function compactInterviewEvidenceForRetry(value: unknown, maxChars = 8_000) {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { return compactSourceContextForTrial(value, maxChars); }
  }
  if (!Array.isArray(parsed) || !parsed.length) return plainText(value).slice(0, maxChars);

  const perItem = Math.max(280, Math.floor(maxChars / parsed.length));
  const records = parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") return `${index + 1}. ${balancedExcerpt(plainText(entry), perItem, " … ")}`;
    const record = entry as Record<string, unknown>;
    const dimension = plainText(record.dimension || record.label || `decision-${index + 1}`).slice(0, 80);
    const answer = plainText(record.answer || record.value || record.choice).trim();
    const question = plainText(record.question || record.prompt).trim();
    const kind = record.evidenceKind === "negative_example" || record.evidenceKind === "explicit_authorization"
      ? record.evidenceKind : classifyUserEvidence(String(record.key || record.id || ""), dimension);
    const protectedAnswer = kind === "negative_example" || kind === "explicit_authorization";
    const answerBudget = Math.max(160, Math.floor(perItem * 0.68));
    const questionBudget = Math.max(40, perItem - answerBudget - dimension.length - kind.length - 45);
    return `${index + 1}. [${dimension}; ${kind}] answer=${protectedAnswer ? JSON.stringify(answer) : balancedExcerpt(answer, answerBudget, " … ")}; question=${balancedExcerpt(question, questionBudget, " … ")}`;
  });
  // A soft transport target must not silently drop a counterexample's trailing
  // condition or change permission scope. Shorten question wording, not those
  // owner-authored clauses, when protected evidence exceeds this target.
  return records.join("\n");
}
