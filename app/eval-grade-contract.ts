/** Single-case grading has no cross-case join to generate. Keep its wire
 * envelope flat, then project it into the unchanged harness contract. All
 * assertions, claims and optimizer feedback remain model-authored evidence. */
export function singleCaseGradingRequest(body: Record<string, unknown>) {
  const executions = body.executions;
  if (!Array.isArray(executions) || executions.length !== 1) return false;
  const execution = executions[0];
  return Boolean(execution && typeof execution === "object" && typeof execution.caseId === "string");
}

export const SINGLE_CASE_GRADE_SCHEMA = `Single-case wire override: return ONE flat JSON object, not a grades array and not a grade wrapper:
{"caseId":"exact execution id","passed":false,"evidence":"observable evidence","failureReason":"root failure or empty","dimensions":[{"label":"exact dimension label","score":0,"evidence":"observable evidence"}],"assertions":[{"text":"exact frozen assertion","passed":false,"evidence":"observable evidence"}],"claims":[{"claim":"material output claim","type":"factual|process|quality","verified":false,"evidence":"source evidence"}],"evalFeedback":{"suggestions":[],"overall":"eval quality"},"textualFeedback":{"summary":"causal feedback","criticalProblems":[],"preserve":[]},"failedCases":[]}
Keep all five dimensions and every frozen required/forbidden assertion. Keep causal optimizer feedback and failed-case evidence exactly as required by the grading rules. This changes only the envelope, never the rubric. Close each nested object before its containing array. Do not include a grades key.`;

export const CONTRACT_OUTCOME_RULES = `Contract-first outcome checks:
- Distinguish an execution defect from an honest unknown. If the source omits a date, speaker identity or other fact, and the governing contract requires marking it unknown rather than inference, that marking is successful grounding, not a missing result. Do not recommend guessing, using context to invent the value, or treating an outcome as failed solely because the source lacks it.
- Conversely, ignoring a fact actually supplied, labeling it unknown unnecessarily, or repeatedly requesting information already supplied is a real defect. Cite the exact supplied fact and contrary output; do not confuse a missing value with a missing rule.
- Past examples or practice signals are not an explicit current decision. When the contract requires asking for today's duration/scenario or approval, do not treat background material as that answer. Judge the correct current-stage deliverable, not an unsolicited final product.
- Treat required pauses, no-invention boundaries and missing-source fallbacks as behavior to preserve when correctly followed. More text, inferred details or fewer questions cannot compensate for violating those boundaries.
- Return only observable mismatches. Lack of coverage needs another test, not an invented defect or a request to add unsupported facts. If a frozen assertion itself wrongly requires fabricating absent data, identify that eval defect without rewriting assertions, outputs or verdicts to hide it.`;

export function normalizeGradingEnvelope(value: unknown, expectedCaseId?: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const root = value as Record<string, unknown>;
  // Legacy/batch envelopes are unchanged. Only the uniquely identified single
  // execution can use the flat envelope; a different case cannot be accepted.
  if (Array.isArray(root.grades) || !expectedCaseId || root.caseId !== expectedCaseId) return value;
  const { textualFeedback, failedCases, ...grade } = root;
  return {
    grades: [grade],
    ...(textualFeedback !== undefined ? { textualFeedback } : {}),
    ...(failedCases !== undefined ? { failedCases } : {}),
  };
}
