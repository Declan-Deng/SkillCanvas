// Output stages share the complete policy; splitting never relaxes task contracts.
import { assertBlueprintStage, normalizeBlueprintStage, CAPABILITY_WIRE_RULES, type BlueprintPlanningMode, type BlueprintRepair } from "./blueprint-contract.ts";
export { assertBlueprintStage } from "./blueprint-contract.ts";
export type { BlueprintPlanningMode } from "./blueprint-contract.ts";
export const BLUEPRINT_PLANNING_RULES = "Planning rules:\n- Use exact runtimeInputs tokens for user-owned materials. They are input contracts, not proof of availability: resolve the real material or follow its missingBehavior. Alternatively explicitly resolve materials from $request/$source before parsing them. Every other requires token needs a producer; extracted criteria, selected records and future feedback are not raw inputs. Future feedback belongs in an await-input checkpoint's resumeProduces after the draft. Supply both normal and revision delivery branches without forcing normal delivery to wait for optional feedback.\n- Preserve the foundation's evidence precedence, content permission, missing-input behavior, output contract, and unresolved attention points. Never add a stricter or more permissive rule.\n- Separate ultimate external value from controllable outcomes and observable indicators. Do not promise hiring, sales, distribution, attitudes, or other external outcomes.\n- Map every runtime requirement to one implementation owner and an observable evaluation criterion. Include one or more llm items for semantic work and exactly one eval item.\n- Model workflowSteps as a real DAG. Every step declares role, requires[], produces[], mutates[]. Only $request and $source are built-in inputs. $confirmed is NOT initially available: await-input/await-approval nodes emit $input_required/$approval_required now and declare resumeProduces tokens (including $confirmed) available ONLY after the actual user reply. Downstream steps require those reply tokens. Never auto-confirm. Only explicit deliver/persist steps produce $output and list the business artifacts in delivers[]. Reads, extraction and validation must feed concrete consumers; disconnected helpers are errors, not completions. File saving requires the final content token, never just $request. Keep every intermediate artifact, bind consumers to its exact token, and do not use terminal tokens as data dependencies. mutates[] requires the current named state in requires[]; order conflicting readers/writers through version or completion tokens. Preserve conditional pause paths without joining them into artificial AND dependencies. Reference resources may be owned by their consuming step instead of becoming independent completion steps.\n- References are only routed domain knowledge. Scripts are only repeated deterministic/calculation/validation/format work with a measurable advantage and an exact scripts/*.py path. Generated scripts require an independent evals/script-tests/test_*.py later. Assets are real output materials, not hidden instructions. Omit unjustified kinds.\n- builtin-tool is a real host ability. MCP is only a named external service required by the goal; default to omission, never generate it, never claim authorization, and provide an honest reduced fallback or stop condition.\n- Recommend optional catalog entries only when a concrete input, output, or workflow branch benefits. Preserve their exact id and kind; set optional/recommended/enabled true. Omit all other catalog entries.\n- Use state none for one-shot tasks, session for current multi-step work, persistent only for genuine longitudinal work with explicit fields, correction, expiry, missing behavior, and privacy boundary.\n- Human output needs observable required content; machine output needs an exact schema; artifact output needs real globs and validation. Do not invent artifact checks for text-only output.\n- Loop goal is the stable task outcome. Subgoals are observable intermediate states, never scores or quality criteria. Use turn-based for subjective judgment, goal-driven for objective checks, hybrid for both. Keep 2-5 subgoals, bounded retries, clear stops, and escalation for missing irreplaceable input, conflicts, max rounds, or external/irreversible action.\n- Never invent an unconfirmed threshold, formula, denominator, weight, budget, deadline, field mapping, operational default, capability, resource, state, or external connection.";
export const BLUEPRINT_LEGACY_PROMPT = "You are the execution-architecture stage of an Agent Skill compiler. The supplied six-section requirements foundation is already approved evidence. Convert it into a minimal complete capability plan and bounded loop plan without rewriting the requirements.\n\nReturn JSON only with two top-level keys: capabilityPlan and loopPlan.\nUse compact JSON without indentation or newlines outside string values. Preserve complete requirements, steps and contracts; remove only serialization whitespace, not behavior, to leave space for the closing workflow and loop structures.\ncapabilityPlan requires: summary; outcomeModel {ultimateGoal,controllableOutcomes[],uncontrollableOutcomes[],observableIndicators[]}; stateModel {needed,scope:none|session|persistent,reason,fields[{name,purpose,source:explicit|user-claim|inference|hypothesis|unknown,updateRule}],expiry,correction,missingBehavior,privacyBoundary}; outputContract {mode:human|machine|artifact|mixed,format,requiredSections[],artifactPatterns[],validation[]}; riskBranches[{id,condition,action,stopOrRedirect}]; failureModes[]; workflowSteps[{id,capabilityIds[],role,when,input,action,output,fallback,requires[],produces[],mutates[],delivers[],resumeProduces[]}]; items[].\nEach item requires: id,kind:llm|reference|script|asset|builtin-tool|mcp|eval,name,path,layer:runtime|evaluation|build-time,scope:global|task-specific|conditional|optional,activationCondition,affects[],mustNotAffect[],requirement,purpose,reason,status:generate|use-provided|requires-setup|not-needed,optional,recommended,enabled,input,output,fallback,routingCondition,deterministicAdvantage,evaluationCriteria[],connection:{server,tools[],verified}.\nloopPlan requires: mode:turn-based|goal-driven|hybrid,label,reason,goal,subgoals[{id,title,outcome,verification}],qualityGates[{id,criterion,check,owner:ai|user|shared}],cycle[],maxRounds,stopConditions[],escalationConditions[],scopes[{id,scope:inference|task-retry|interaction|longitudinal,trigger,action,maxCycles,stateDependency,stop}].\n\n" + BLUEPRINT_PLANNING_RULES;

type JsonObject = Record<string, unknown>;
const WORKFLOW_WIRING_RULES = `Wiring checklist (use the task's own products; these are token examples, not task templates):
- The supplied items contain runtime owners only. Never use an eval item, a tool not listed, or an actor such as user as an owner. Semantic validation belongs to the runtime LLM owner, not the offline evaluator.
- For ANY optional builtin-tool or MCP that is merely available but not needed by this task's current operations, list its exact ID in a consuming LLM read/transform step's optional availableCapabilityIds[] field, not capabilityIds and not a fake independent step. Availability never grants permission to execute. Required tools, actual artifact producers, mutations, confirmations and explicitly planned operations must stay in the normal graph; never demote them to availableCapabilityIds. Every concrete call must resolve real inputs, consume its actual result and retain authorization and write ordering. This applies to the entire catalog and custom tools, not a fixed list of tool names.
- Selected optional host tools are available adapters, not mandatory independent task steps. Attach document reading, image understanding, spreadsheet analysis and source lookup to the actual consuming read/transform operation's capabilityIds; explain the relevant input/condition and how returned evidence informs that operation. Skip inapplicable adapters and reuse upstream evidence. Do not invent an orphan *_output for each selection. Spreadsheet analysis does not imply file export: keep required persistence, writes, MCP actions and approvals in explicit dependency-ordered steps. If a tool needs a derived input or its result is consumed elsewhere, keep its real producer/consumer edges.
- input:<id>, $request and $source are external roots: no step may produce them. A missing-material await-input branch may end at $input_required and list the exact missing input:<id> in resumeProduces; only the user's actual reply supplies it. The normal input-present branch does not depend on that optional checkpoint. Do not fake a producer for the supplied file.
- Use exact artifact tokens, never human-readable labels, in delivers. If a step reads $draft_report, its delivers may include $draft_report, not Report. $output is the ONLY completed terminal; do not invent $output_revised/$output_final. Each delivered business token must be in that step's requires or produces.
- Feedback/approval requires a real checkpoint after the artifact: produces contains $input_required/$approval_required; resumeProduces contains the actual reply token, e.g. $feedback. A revision requires the draft AND that exact reply token. If a revision branch exists, its feedback checkpoint must exist. Approval to deliver is not automatically feedback to revise.
- Distinct checkpoints need distinct reply tokens (e.g. $draft_feedback and $revision_feedback, $draft_approved and $revision_approved). Never let two checkpoints produce the same confirmation variable. Only the pause terminals may be shared. Consumers must require the reply for the exact artifact version they use.
- Optional revision is branching, not an undefined final_* alias: original artifact -> review -> deliver original when approved; original artifact + that review's feedback -> revised artifact -> revision review -> deliver revised when approved. Give the two deliver/persist branches separate step IDs and the same $output terminal. Do not require both original and revised approval for normal delivery. Every name in these edges must be actually produced; never invent a union artifact with no producer.
- Carry every requested companion artifact (change explanation, evidence table, etc.) to its consuming review/delivery alongside the main artifact. If persistence returns a file path, declare that file path in produces as well as delivers. A file path is an output of saving, not a preexisting input.
- NEVER put $output, $input_required or $approval_required in delivers. They are control markers, not delivered products. Saving must produce both its own unique saved-file token and $output; delivers lists the saved-file token. Returning prose without the requested file is not file delivery.
- Prefer immutable draft and revision tokens. Writing a new $revised_report from $draft_report is produces, not mutates. Reserve mutates for actual mutable state required by the state contract; every reader/writer must be explicitly ordered. Do not create extra mutable state for temporary output revisions.
- Before returning, trace every requires to an external root or exact producer, every normal branch to delivery, and every wait branch to an honest pause. A user-facing explanation of waiting is not proof that the reply exists.`;
export type BlueprintFoundation = {
  sections: Array<{ id: string; index: string; title: string; description: string; content: string; status: "ready" | "attention" }>;
};

export function blueprintStagePrompt(mode: "blueprint-capabilities" | "blueprint-workflow", body: JsonObject) {
  const schema = mode === "blueprint-capabilities"
    ? "Return only {capabilityPlan:{...}}. Do not emit workflowSteps or loopPlan; a dedicated next stage will generate them.\ncapabilityPlan requires: summary; outcomeModel {ultimateGoal,controllableOutcomes[],uncontrollableOutcomes[],observableIndicators[]}; stateModel {needed,scope:none|session|persistent,reason,fields[{name,purpose,source:explicit|user-claim|inference|hypothesis|unknown,updateRule}],expiry,correction,missingBehavior,privacyBoundary}; outputContract {mode:human|machine|artifact|mixed,format,requiredSections[],artifactPatterns[],validation[]}; riskBranches[{id,condition,action,stopOrRedirect}]; failureModes[]; items[].\nEach item requires: id,kind:llm|reference|script|asset|builtin-tool|mcp|eval,name,path,layer:runtime|evaluation|build-time,scope:global|task-specific|conditional|optional,activationCondition,affects[],mustNotAffect[],requirement,purpose,reason,status:generate|use-provided|requires-setup|not-needed,optional,recommended,enabled,input,output,fallback,routingCondition,deterministicAdvantage,evaluationCriteria[],connection:{server,tools[],verified}."
    : "Return only {workflowSteps:[],loopPlan:{...}}. The supplied capabilityPlan is fixed; use its enabled runtime capability IDs exactly and do not rewrite or re-emit its items or contracts.\nworkflowSteps require: id,capabilityIds[],role:read|transform|validate|persist|deliver|await-input|await-approval,when,input,action,output,fallback,requires[],produces[],mutates[],delivers[],resumeProduces[].\nloopPlan requires: mode:turn-based|goal-driven|hybrid,label,reason,goal,subgoals[{id,title,outcome,verification}],qualityGates[{id,criterion,check,owner:ai|user|shared}],cycle[],maxRounds,stopConditions[],escalationConditions[],scopes[{id,scope:inference|task-retry|interaction|longitudinal,trigger,action,maxCycles,stateDependency,stop}].";
  return {
    system: "Plan an Agent Skill from the authoritative requirements foundation. Return complete compact JSON only. Preserve every confirmed constraint, permission and exception; avoid repeated prose.\n" + schema + "\nSchema rules: Array fields must be JSON arrays, not prose; maxRounds and maxCycles are positive integers. Every step must explicitly include requires, produces and mutates (use [] for no mutation). delivers is required and non-empty for deliver/persist only; it may be omitted otherwise. resumeProduces is required for await-input/await-approval (actual reply tokens, or [] if no continuation); omit it or use [] for other roles. A missing optional control field is not a missing task dependency.\n\n" + BLUEPRINT_PLANNING_RULES + (mode === "blueprint-workflow" ? "\n\n" + WORKFLOW_WIRING_RULES : "\n\n" + CAPABILITY_WIRE_RULES),
    // Retries preserve full values. The workflow receives actual selected owners,
    // not the optional catalog, and never has to serialize capabilities again.
    user: JSON.stringify({
      idea: body.idea, blueprintFoundation: body.blueprintFoundation, runtimeInputs: body.runtimeInputs,
      ...(mode === "blueprint-capabilities" ? { capabilityCatalog: body.capabilityCatalog } : { capabilityPlan: workflowPlanningContext(body.capabilityPlan) }),
    }),
  };
}

function workflowPlanningContext(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  // Compiler-synthesized placeholder steps are NOT an approved workflow. Only
  // the owners/contracts are fixed at this point; passing placeholders here
  // made the model copy missing edges and empty/inapplicable control fields.
  const { workflowSteps: _unplannedSteps, ...capabilityPlan } = value as JsonObject;
  if (Array.isArray(capabilityPlan.items)) capabilityPlan.items = capabilityPlan.items.filter((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const entry = item as JsonObject;
    return entry.enabled !== false && entry.status !== "not-needed" && entry.layer === "runtime" && entry.kind !== "eval";
  });
  return capabilityPlan;
}

export function blueprintRepairPrompt(mode: BlueprintPlanningMode, body: JsonObject, repair: BlueprintRepair, originalPrompt?: { system: string; user: string }) {
  const base = mode === "blueprint-foundation" ? originalPrompt : blueprintStagePrompt(mode, body);
  if (!base) throw new Error("Foundation repair requires its original evidence prompt");
  return {
    system: base.system + "\nREPAIR RESPONSE OVERRIDE: A candidate already exists. Return ONLY {\"repairs\":[{\"path\":\"/exact/reported/path\",\"value\":<correct field value>}]} using the supplied JSON Pointer paths. Do not return a new complete plan. Only the fields named in issues may change; all valid fields and dependencies are protected. Determine missing semantic values from the authoritative context; never fill with generic templates, fake approvals, or invented outputs. An omitted inapplicable control array has already been normalized, so fix the actual listed errors.",
    user: JSON.stringify({ context: mode === "blueprint-foundation" ? base.user : JSON.parse(base.user), candidate: repair.candidate, issues: repair.issues }),
  };
}


export type BlueprintCheckpoint = {
  key?: string;
  foundation?: BlueprintFoundation;
  capabilities?: JsonObject;
  workflow?: JsonObject;
  workflowOwnerKey?: string;
};

// Memory-only, keyed by complete evidence/configuration, never API credentials.
export async function runBlueprintPlanning(input: {
  foundationInput: JsonObject;
  planInput: JsonObject;
  modelIdentity: { provider: string; model: string; baseUrl: string };
  checkpoint: BlueprintCheckpoint;
  call: (mode: BlueprintPlanningMode, payload: JsonObject) => Promise<unknown>;
  prepareCapabilities?: (plan: JsonObject) => JsonObject;
  onStage?: (mode: BlueprintPlanningMode) => void;
}) {
  const key = JSON.stringify([input.modelIdentity, input.foundationInput, input.planInput]);
  const cache = input.checkpoint;
  if (cache.key !== key) {
    delete cache.foundation;
    delete cache.capabilities;
    delete cache.workflow;
    delete cache.workflowOwnerKey;
    cache.key = key;
  }
  if (!cache.foundation) {
    input.onStage?.("blueprint-foundation");
    const result = normalizeBlueprintStage("blueprint-foundation", await input.call("blueprint-foundation", input.foundationInput));
    assertBlueprintStage("blueprint-foundation", result);
    cache.foundation = structuredClone(result) as BlueprintFoundation;
  }
  const context = { ...input.planInput, blueprintFoundation: cache.foundation };
  if (!cache.capabilities) {
    input.onStage?.("blueprint-capabilities");
    const result = normalizeBlueprintStage("blueprint-capabilities", await input.call("blueprint-capabilities", context));
    assertBlueprintStage("blueprint-capabilities", result);
    cache.capabilities = structuredClone(result.capabilityPlan as JsonObject);
  }
  const capabilityPlan = input.prepareCapabilities
    ? input.prepareCapabilities(structuredClone(cache.capabilities))
    : structuredClone(cache.capabilities);
  const workflowOwnerKey = JSON.stringify(capabilityPlan);
  if (cache.workflowOwnerKey !== workflowOwnerKey) delete cache.workflow;
  if (!cache.workflow) {
    input.onStage?.("blueprint-workflow");
    const result = normalizeBlueprintStage("blueprint-workflow", await input.call("blueprint-workflow", { ...context, capabilityPlan }));
    assertBlueprintStage("blueprint-workflow", result);
    cache.workflow = structuredClone(result);
    cache.workflowOwnerKey = workflowOwnerKey;
  }
  return {
    foundation: structuredClone(cache.foundation),
    capabilityPlan: { ...capabilityPlan, workflowSteps: structuredClone(cache.workflow.workflowSteps) },
    loopPlan: structuredClone(cache.workflow.loopPlan),
  };
}
