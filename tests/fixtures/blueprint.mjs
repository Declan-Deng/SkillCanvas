export const foundation = { sections: Array.from({ length: 6 }, (_, index) => ({ id: `section-${index}`, index: String.fromCharCode(65 + index), title: `Requirement ${index}`, description: "Confirmed evidence", content: "Keep supplied facts; ask before final delivery, not before drafting.", status: "ready" })) };
export const capabilities = { capabilityPlan: {
  summary: "Create a source-grounded report",
  outcomeModel: { ultimateGoal: "Deliver report", controllableOutcomes: ["Report"], uncontrollableOutcomes: [], observableIndicators: ["Sources linked"] },
  stateModel: { needed: false, scope: "none", reason: "One task", fields: [], expiry: "end", correction: "explicit corrections", missingBehavior: "Ask", privacyBoundary: "No persistence" },
  outputContract: { mode: "human", format: "Markdown", requiredSections: ["Evidence"], artifactPatterns: [], validation: ["Source trace"] },
  riskBranches: [], failureModes: ["Invented sources"],
  items: ["core", "eval"].map((id) => ({ id, kind: id === "core" ? "llm" : "eval", name: id, path: id === "core" ? "SKILL.md" : "evals/", layer: id === "core" ? "runtime" : "evaluation", scope: "task-specific", activationCondition: "Report requested", affects: ["report"], mustNotAffect: [], requirement: "Ground claims", purpose: "Report", reason: "Semantic task", status: "generate", optional: false, recommended: false, enabled: true, input: "Source", output: "Report", fallback: "Ask", routingCondition: "Source available", deterministicAdvantage: "none", evaluationCriteria: ["Sources linked"], connection: { server: "", tools: [], verified: false } })),
} };
export const workflow = {
  workflowSteps: [
    { id: "compose", capabilityIds: ["core"], role: "transform", when: "Source supplied", input: "Source", action: "Compose report", output: "Draft", fallback: "Ask", requires: ["input:material"], produces: ["$report"], mutates: [], delivers: [], resumeProduces: [] },
    { id: "deliver", capabilityIds: ["core"], role: "deliver", when: "Ready", input: "Report", action: "Deliver report", output: "Report", fallback: "Ask", requires: ["$report"], produces: ["$output"], mutates: [], delivers: ["$report"], resumeProduces: [] },
  ],
  loopPlan: { mode: "hybrid", label: "Review", reason: "Check evidence then confirm", goal: "Deliver report", subgoals: [], qualityGates: [], cycle: ["Check"], maxRounds: 2, stopConditions: ["Done"], escalationConditions: ["Missing source"], scopes: [] },
};
export const input = {
  foundationInput: { idea: "Create a report", sourceText: "User supplied source", answers: [{ dimension: "bad-example", answer: "Invent a source" }] },
  planInput: { idea: "Create a report", runtimeInputs: [{ token: "input:material", name: "Source", required: true, missingBehavior: "Ask" }], capabilityCatalog: [] },
  modelIdentity: { provider: "compatible", model: "test-model", baseUrl: "https://blueprint-stages.test/v1" },
};
export const stageResults = { "blueprint-foundation": foundation, "blueprint-capabilities": capabilities, "blueprint-workflow": workflow };

// Same 18 rejected paths seen in afa6a131-881, without storing user content.
export function capabilitiesWithInapplicableNulls() {
  const result = structuredClone(capabilities);
  result.capabilityPlan.items = Array.from({ length: 4 }, (_, index) => ({ ...structuredClone(capabilities.capabilityPlan.items[0]), id: `semantic-${index}`, path: null, routingCondition: null, deterministicAdvantage: null, connection: null }));
  result.capabilityPlan.items.push({ ...structuredClone(capabilities.capabilityPlan.items[1]), path: null, connection: null });
  return result;
}
