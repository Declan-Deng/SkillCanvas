/** One shared budget for the server's two bounded attempts and its caller.
 * Progress extends only the idle deadline, never the absolute deadline. */
export function generationAttemptBudget(mode: string, attempt: number) {
  if (mode !== "build" && mode !== "repair") return null;
  return { idleMs: 60_000, totalMs: attempt === 1 ? 180_000 : 120_000 };
}

export function generationClientBudget(mode: string) {
  const first = generationAttemptBudget(mode, 1);
  const second = generationAttemptBudget(mode, 2);
  return first && second ? first.totalMs + second.totalMs + 15_000 : null;
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
