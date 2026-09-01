export type BlueprintPlanningMode = "blueprint-foundation" | "blueprint-capabilities" | "blueprint-workflow";
type JsonObject = Record<string, unknown>;
export type BlueprintIssue = { path: string; code: "missing" | "type" | "empty" | "invalid" | "duplicate"; expected: string };
const object = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);

// Shared with the generation/repair prompt. Null means “not applicable” only
// for these kind-specific wire fields, never for task content or permissions.
export const CAPABILITY_WIRE_RULES = `Capability field types: text fields are strings, flags are booleans, lists are arrays. Never use null for requirements, input/output, fallback, activationCondition or evaluationCriteria.
Kind-specific fields: llm path is SKILL.md; eval path is evals/; builtin-tool/mcp path is integrations/tool-contracts.json. These fixed packaging paths may be omitted/null. reference/script/asset must supply their real file path (scripts use scripts/*.py).
Resource ownership: runtime user documents belong to runtimeInputs, never to invented references/<input>.pdf paths. Read their resolved path/content with a builtin-tool and honest missing-input behavior. References are reusable knowledge with actual evidence; generated references must be UTF-8 .md/.txt, not binary PDF/Office files. A filename or uploaded-source summary is not proof that a binary file is bundled. Do not copy private examples into the reusable package.
deterministicAdvantage is required non-empty text for script; for other kinds omit it or use null/empty string when not applicable.
connection is an object {server:string,tools:string[],verified:boolean} for mcp only; omit it or use null for other kinds. Never invent a server, tools or verified authorization.
activationCondition must explicitly say when the capability applies. routingCondition may be omitted/null/empty when identical to activationCondition; otherwise preserve the distinct routing condition. Conditional/optional capabilities still require their real activation condition.`;

export class BlueprintStageError extends Error {
  mode: BlueprintPlanningMode;
  issues: BlueprintIssue[];
  constructor(mode: BlueprintPlanningMode, issues: BlueprintIssue[]) {
    super(`蓝图阶段 ${mode} 返回的结构不完整：${issues.slice(0, 4).map((issue) => `${issue.path} ${issue.code === "missing" ? "缺少" : "应为"}${issue.expected}`).join("；")}${issues.length > 4 ? `；另有 ${issues.length - 4} 项` : ""}。已保留此前完成的阶段`);
    this.name = "BlueprintStageError";
    this.mode = mode;
    this.issues = issues;
  }
}

/** Wire compatibility only. Never invent dataflow, delivery artifacts, approvals,
 * owners or loop limits. Missing semantic fields must go back to the model. */
export function normalizeBlueprintStage(mode: BlueprintPlanningMode, value: unknown): unknown {
  const result = structuredClone(value);
  if (!object(result)) return result;
  if (mode === "blueprint-foundation") {
    if (Array.isArray(result.sections)) for (const section of result.sections) {
      // An omitted review badge is unknown, NOT an approved requirement.
      // Retain the complete evidence and ask for review instead of regenerating.
      if (object(section) && section.status == null) section.status = "attention";
    }
    return result;
  }
  if (mode === "blueprint-capabilities") {
    if (object(result.capabilityPlan) && Array.isArray(result.capabilityPlan.items)) {
      for (const item of result.capabilityPlan.items) {
        if (!object(item)) continue;
        const fixedPaths: Record<string, string> = { llm: "SKILL.md", eval: "evals/", "builtin-tool": "integrations/tool-contracts.json", mcp: "integrations/tool-contracts.json" };
        if (item.path == null && Object.hasOwn(fixedPaths, String(item.kind))) item.path = fixedPaths[String(item.kind)];
        if (item.kind !== "script" && item.deterministicAdvantage == null) item.deterministicAdvantage = "";
        if (item.kind !== "mcp" && item.connection == null) item.connection = { server: "", tools: [], verified: false };
        // Reuse the actual model-authored condition, never broaden it to “always”.
        if ((item.routingCondition == null || item.routingCondition === "") && typeof item.activationCondition === "string" && item.activationCondition.trim()) item.routingCondition = item.activationCondition;
      }
    }
    return result;
  }
  if (mode !== "blueprint-workflow") return result;
  if (object(result.capabilityPlan) && Array.isArray(result.capabilityPlan.workflowSteps) && (!Object.hasOwn(result, "workflowSteps") || JSON.stringify(result.workflowSteps) === JSON.stringify(result.capabilityPlan.workflowSteps))) {
    result.workflowSteps = structuredClone(result.capabilityPlan.workflowSteps);
    delete result.capabilityPlan.workflowSteps;
  }
  if (Array.isArray(result.workflowSteps)) {
    result.workflowSteps = result.workflowSteps.map((step: unknown) => {
      if (!object(step)) return step;
      // Non-delivery nodes do not hand off business artifacts. Non-checkpoints
      // cannot receive human reply tokens. Omitted inapplicable arrays mean [].
      if (["read", "transform", "validate", "await-input", "await-approval"].includes(String(step.role)) && !Object.hasOwn(step, "delivers")) step.delivers = [];
      if (["read", "transform", "validate", "persist", "deliver"].includes(String(step.role)) && !Object.hasOwn(step, "resumeProduces")) step.resumeProduces = [];
      return step;
    });
  }
  if (object(result.loopPlan)) {
    if (!Object.hasOwn(result.loopPlan, "label")) result.loopPlan.label = ""; // Presentation only.
    if (typeof result.loopPlan.maxRounds === "string" && /^[1-9]\d*$/.test(result.loopPlan.maxRounds) && Number.isSafeInteger(Number(result.loopPlan.maxRounds))) result.loopPlan.maxRounds = Number(result.loopPlan.maxRounds);
  }
  return result;
}

/** Diagnose exact schema paths, never store user prose or model output in logs.
 * This is a wire gate; topology, owner resolution and authorization remain in
 * the existing workflow preflight, which can repair those semantic problems. */
export function blueprintStageIssues(mode: BlueprintPlanningMode, value: unknown): BlueprintIssue[] {
  const issues: BlueprintIssue[] = [];
  const add = (path: string, code: BlueprintIssue["code"], expected: string) => { if (issues.length < 64) issues.push({ path, code, expected }); };
  const field = (v: JsonObject, key: string, path: string, expected: string, valid: (value: unknown) => boolean) => {
    if (!Object.hasOwn(v, key)) add(`${path}/${key}`, "missing", expected);
    else if (!valid(v[key])) add(`${path}/${key}`, "type", expected);
  };
  const text = (v: JsonObject, key: string, path: string, required = true) => field(v, key, path, required ? "non-empty string" : "string", (s) => typeof s === "string" && (!required || Boolean(s.trim())));
  const strings = (v: JsonObject, key: string, path: string, min = 0) => field(v, key, path, min ? "non-empty string[]" : "string[]", (a) => Array.isArray(a) && a.length >= min && a.every((s) => typeof s === "string" && Boolean(s.trim())));
  const enumeration = (v: JsonObject, key: string, path: string, allowed: string[]) => field(v, key, path, allowed.join("|"), (s) => typeof s === "string" && allowed.includes(s));
  const child = (v: JsonObject, key: string, path: string, visit: (child: JsonObject, path: string) => void) => {
    field(v, key, path, "object", object);
    if (object(v[key])) visit(v[key], `${path}/${key}`);
  };
  const entries = (v: JsonObject, key: string, path: string, visit: (entry: JsonObject, path: string) => void, min = 0) => {
    field(v, key, path, min ? "non-empty object[]" : "object[]", (a) => Array.isArray(a) && a.length >= min);
    if (!Array.isArray(v[key])) return;
    const ids = new Set<string>();
    v[key].forEach((entry: unknown, index: number) => {
      const entryPath = `${path}/${key}/${index}`;
      if (!object(entry)) { add(entryPath, "type", "object"); return; }
      visit(entry, entryPath);
      if (typeof entry.id === "string") {
        if (ids.has(entry.id)) add(`${entryPath}/id`, "duplicate", "unique id");
        ids.add(entry.id);
      }
    });
  };
  const positiveInteger = (v: JsonObject, key: string, path: string) => field(v, key, path, "positive integer", (n) => typeof n === "number" && Number.isSafeInteger(n) && n > 0);
  if (!object(value)) return [{ path: "", code: "type", expected: "object" }];
  if (mode === "blueprint-foundation") {
    entries(value, "sections", "", (section, path) => {
      for (const key of ["id", "title", "content"]) text(section, key, path);
      enumeration(section, "status", path, ["ready", "attention"]);
    }, 6);
    if (Array.isArray(value.sections) && value.sections.length !== 6) add("/sections", "invalid", "exactly six sections");
  } else if (mode === "blueprint-capabilities") {
    child(value, "capabilityPlan", "", (plan, path) => {
      text(plan, "summary", path);
      child(plan, "outcomeModel", path, (v, p) => {
        text(v, "ultimateGoal", p);
        for (const key of ["controllableOutcomes", "uncontrollableOutcomes", "observableIndicators"]) strings(v, key, p);
      });
      child(plan, "stateModel", path, (v, p) => {
        field(v, "needed", p, "boolean", (x) => typeof x === "boolean");
        enumeration(v, "scope", p, ["none", "session", "persistent"]);
        for (const key of ["reason", "expiry", "correction", "missingBehavior", "privacyBoundary"]) text(v, key, p, false);
        entries(v, "fields", p, (entry, ep) => {
          for (const key of ["name", "purpose", "updateRule"]) text(entry, key, ep);
          enumeration(entry, "source", ep, ["explicit", "user-claim", "inference", "hypothesis", "unknown"]);
        });
      });
      child(plan, "outputContract", path, (v, p) => {
        enumeration(v, "mode", p, ["human", "machine", "artifact", "mixed"]);
        text(v, "format", p);
        for (const key of ["requiredSections", "artifactPatterns", "validation"]) strings(v, key, p);
      });
      entries(plan, "riskBranches", path, (v, p) => { for (const key of ["id", "condition", "action", "stopOrRedirect"]) text(v, key, p); });
      strings(plan, "failureModes", path);
      entries(plan, "items", path, (v, p) => {
        for (const key of ["id", "name", "requirement", "purpose"]) text(v, key, p);
        for (const key of ["path", "activationCondition", "routingCondition"]) text(v, key, p);
        for (const key of ["reason", "input", "output", "fallback"]) text(v, key, p, false);
        text(v, "deterministicAdvantage", p, v.kind === "script");
        for (const key of ["affects", "mustNotAffect", "evaluationCriteria"]) strings(v, key, p);
        for (const key of ["optional", "recommended", "enabled"]) field(v, key, p, "boolean", (x) => typeof x === "boolean");
        enumeration(v, "kind", p, ["llm", "reference", "script", "asset", "builtin-tool", "mcp", "eval"]);
        enumeration(v, "layer", p, ["runtime", "evaluation", "build-time"]);
        enumeration(v, "scope", p, ["global", "task-specific", "conditional", "optional"]);
        enumeration(v, "status", p, ["generate", "use-provided", "requires-setup", "not-needed"]);
        child(v, "connection", p, (connection, cp) => {
          text(connection, "server", cp, false); strings(connection, "tools", cp);
          field(connection, "verified", cp, "boolean", (x) => typeof x === "boolean");
        });
      }, 1);
    });
  } else {
    if (object(value.capabilityPlan) && Array.isArray(value.capabilityPlan.workflowSteps) && Array.isArray(value.workflowSteps) && JSON.stringify(value.capabilityPlan.workflowSteps) !== JSON.stringify(value.workflowSteps)) add("/workflowSteps", "invalid", "one unambiguous workflow (conflicting root and nested copies)");
    entries(value, "workflowSteps", "", (step, path) => {
      for (const key of ["id", "action"]) text(step, key, path);
      for (const key of ["when", "input", "output", "fallback"]) text(step, key, path, false);
      enumeration(step, "role", path, ["read", "transform", "validate", "persist", "deliver", "await-input", "await-approval"]);
      // Empty owners reach the dedicated owner-binding repair; never guess one here.
      for (const key of ["capabilityIds", "requires", "produces", "mutates", "resumeProduces"]) strings(step, key, path);
      if (Object.hasOwn(step, "availableCapabilityIds")) strings(step, "availableCapabilityIds", path);
      strings(step, "delivers", path, ["deliver", "persist"].includes(String(step.role)) ? 1 : 0);
    }, 1);
    child(value, "loopPlan", "", (loop, path) => {
      enumeration(loop, "mode", path, ["turn-based", "goal-driven", "hybrid"]);
      text(loop, "goal", path); text(loop, "reason", path); text(loop, "label", path, false);
      positiveInteger(loop, "maxRounds", path);
      for (const key of ["cycle", "stopConditions", "escalationConditions"]) strings(loop, key, path);
      entries(loop, "subgoals", path, (v, p) => { for (const key of ["id", "title", "outcome", "verification"]) text(v, key, p); });
      entries(loop, "qualityGates", path, (v, p) => {
        for (const key of ["id", "criterion", "check"]) text(v, key, p);
        enumeration(v, "owner", p, ["ai", "user", "shared"]);
      });
      entries(loop, "scopes", path, (v, p) => {
        for (const key of ["id", "trigger", "action", "stop"]) text(v, key, p);
        text(v, "stateDependency", p, false);
        enumeration(v, "scope", p, ["inference", "task-retry", "interaction", "longitudinal"]);
        positiveInteger(v, "maxCycles", p);
      });
    });
  }
  return issues;
}

export function assertBlueprintStage(mode: BlueprintPlanningMode, value: unknown): asserts value is JsonObject {
  const issues = blueprintStageIssues(mode, value);
  if (issues.length) throw new BlueprintStageError(mode, issues);
}

export type BlueprintRepair = { candidate: unknown; issues: BlueprintIssue[] };

/** Allow changes only at validator-rejected paths. Keep all valid task text,
 * dependencies and outputs byte-for-byte instead of asking for a fresh plan. */
export function applyBlueprintFieldRepairs(mode: BlueprintPlanningMode, repair: BlueprintRepair, response: unknown): JsonObject {
  const fail = (expected: string): never => { throw new BlueprintStageError(mode, [{ path: "/repairs", code: "invalid", expected }]); };
  if (!object(response) || !Array.isArray(response.repairs) || response.repairs.length === 0) return fail("non-empty [{path,value}] array; return only field repairs");
  let candidate = structuredClone(repair.candidate);
  const allowed = new Set(repair.issues.map((issue) => issue.path));
  const changed = new Set<string>();
  for (const patch of response.repairs) {
    if (!object(patch) || typeof patch.path !== "string" || !Object.hasOwn(patch, "value") || !allowed.has(patch.path) || changed.has(patch.path)) return fail("unique repairs for exactly the reported paths; other fields are protected");
    changed.add(patch.path);
    if (patch.path === "") { candidate = structuredClone(patch.value); continue; }
    const segments = patch.path.slice(1).split("/");
    if (segments.some((segment) => ["__proto__", "prototype", "constructor"].includes(segment))) return fail("safe schema path");
    let parent: unknown = candidate;
    for (const segment of segments.slice(0, -1)) {
      if ((!object(parent) && !Array.isArray(parent)) || !Object.hasOwn(parent, segment)) return fail("existing parent for repaired field");
      parent = (parent as JsonObject)[segment];
    }
    if (!object(parent) && !Array.isArray(parent)) return fail("object or array parent");
    Object.defineProperty(parent, segments.at(-1)!, { value: structuredClone(patch.value), enumerable: true, writable: true, configurable: true });
  }
  candidate = normalizeBlueprintStage(mode, candidate);
  assertBlueprintStage(mode, candidate);
  return candidate;
}
