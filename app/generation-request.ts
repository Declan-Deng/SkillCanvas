/** One shared budget for the server's two bounded attempts and its caller.
 * Progress extends only the idle deadline, never the absolute deadline. */
export function generationAttemptBudget(mode: string, attempt: number) {
  if (mode !== "build" && mode !== "repair") return null;
  return { idleMs: 60_000, totalMs: attempt === 1 ? 180_000 : 120_000 };
}

export function structuredAttemptTimeout(mode: string, attempt: number, provider: string) {
  if (provider === "compatible") {
    if (mode === "blueprint") return attempt === 1 ? 78_000 : 58_000;
    if (mode === "blueprint-foundation") return attempt === 1 ? 54_000 : 46_000;
    if (["blueprint-plan", "blueprint-capabilities", "blueprint-workflow", "workflow-repair"].includes(mode)) return attempt === 1 ? 58_000 : 48_000;
    if (mode === "preview" || ["personalize", "eval-execute", "eval-grade", "eval-compare", "optimization-evidence"].includes(mode)) return attempt === 1 ? 68_000 : 52_000;
    if (mode === "interview") return attempt === 1 ? 62_000 : 48_000;
    return attempt === 1 ? 52_000 : 44_000;
  }
  return mode === "optimization-evidence" ? 38_000 : 42_000;
}

export function generationClientBudget(mode: string, provider = "deepseek") {
  // Capability-gap analysis can produce a long structured response. Treat it
  // like other substantive model stages, rather than the generic 60s default.
  if (mode === "capability-delta") return 132_000;
  const first = generationAttemptBudget(mode, 1);
  const second = generationAttemptBudget(mode, 2);
  if (first && second) return first.totalMs + second.totalMs + 15_000;
  if (["ping", "models"].includes(mode) || mode.startsWith("knowledge-")) return null;
  // The caller must not cancel attempt two while the server is still within
  // its advertised deadline. Before this, interview allowed 60s for 2x42s.
  return structuredAttemptTimeout(mode, 1, provider) + structuredAttemptTimeout(mode, 2, provider) + 12_000;
}

/** Remove duplicate projections, not decisions. Never slice serialized JSON:
 * the last capability / approval edge matters as much as the first one. */
export function canonicalBuildContext(body: Record<string, unknown>, answers: unknown) {
  const ir = body.skillIR;
  if (!ir || typeof ir !== "object" || Array.isArray(ir)) return null;
  const contract = ir as Record<string, unknown>;
  if (contract.compiler !== "skillcanvas" || !contract.identity || !Array.isArray(contract.capabilities)
      || !Array.isArray(contract.requirements) || !contract.runtimeContract || !contract.controlModel) return null;
  return JSON.stringify({
    canonicalSkillIR: ir,
    userGoal: body.idea,
    confirmedInterviewEvidence: answers,
    userProvidedMaterial: body.sourceText || "",
  });
}
