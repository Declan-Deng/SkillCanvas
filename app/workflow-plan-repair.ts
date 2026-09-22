import { bindWorkflowCapabilities, closeWorkflowDagTerminals, compileWorkflowDag, isReadOnlyHostEvidence, isUserReplyToken, normalizeWorkflowDagSteps, workflowCapabilityRouteIssues, WORKFLOW_TERMINALS, type WorkflowDagStep } from "./workflow-dag.ts";

export type WorkflowPlanCapability = {
  id: string; kind: string; input: string; output: string; requirement?: string;
  purpose?: string; activationCondition?: string; routingCondition?: string;
  fallback: string; affects?: string[]; optional?: boolean; scope?: string;
};
export type WorkflowPlanContext = {
  workflowSteps: WorkflowDagStep[];
  capabilities: WorkflowPlanCapability[];
  inputs: Array<{ id: string; name: string; required: boolean; concept?: string; representations?: string[] }>;
};

const normalizedLabel = (value: string) => value.replace(/^(?:\$|input:|input-|custom-)+/g, "").replace(/[\s_.:\-/]+/g, "").toLowerCase();
const fileAlias = /[_-](pdf|docx?|txt|csv|xlsx?|json|png|jpe?g|md|text)$/i;
const canonicalReplyToken = (token: string) => {
  const label = normalizedLabel(token);
  if (/^(?:user|human)?feedback$/.test(label)) return "$feedback";
  if (/^(?:user|human)?confirm(?:ed|ation)?$/.test(label)) return "$confirmed";
  if (/^(?:user|human)?approv(?:al|ed)$/.test(label)) return "$approved";
  if (/^(?:user|human)?authoriz(?:ation|ed)$/.test(label)) return "$authorization";
  return token;
};

/** Distinct terminal branches can deliver distinct versions with the same
 * human label. Give their private output variables unique names, but only
 * when there are no external consumers whose version we would have to guess. */
function scopeDeliveredVersions(steps: WorkflowDagStep[]) {
  const owners = new Map<string, WorkflowDagStep[]>();
  for (const step of steps) for (const token of step.produces) owners.set(token, [...(owners.get(token) || []), step]);
  const occupied = new Set(steps.flatMap((step) => [...step.requires, ...step.produces, ...(step.resumeProduces || [])]));
  const renamed = new Map<string, Map<string, string>>();
  for (const [token, producers] of owners) {
    if (producers.length < 2 || Object.values(WORKFLOW_TERMINALS).some((terminal) => terminal === token)) continue;
    if (producers.some((step) => !["persist", "deliver"].includes(step.role || "") || !step.delivers?.includes(token))) continue;
    if (steps.some((step) => [...step.requires, ...step.mutates, ...(step.resumeProduces || [])].includes(token)
      || (step.delivers?.includes(token) && !producers.includes(step)))) continue;
    for (const step of producers.slice(1)) {
      const name = `${token}:${step.id}`;
      if (occupied.has(name)) continue;
      const names = renamed.get(step.id) || new Map();
      names.set(token, name); renamed.set(step.id, names); occupied.add(name);
    }
  }
  return steps.map((step) => {
    const names = renamed.get(step.id);
    if (!names) return step;
    const rewrite = (value: string) => value.replace(/\$?[a-zA-Z_][a-zA-Z0-9_.:-]*/g, (token) => names.get(token) || token);
    return { ...step, produces: step.produces.map((token) => names.get(token) || token),
      delivers: step.delivers?.map((token) => names.get(token) || token), output: rewrite(step.output), action: rewrite(step.action) };
  });
}

/** Alpha-rename colliding reply variables only when the reviewed product makes
 * every consumer's checkpoint unambiguous. Two approvals are two real events,
 * not a shared always-confirmed flag. Ambiguous branches still need repair. */
function scopeCheckpointReplies(steps: WorkflowDagStep[]) {
  const replies = new Map<string, WorkflowDagStep[]>();
  for (const step of steps.filter((entry) => ["await-input", "await-approval"].includes(entry.role || ""))) {
    for (const token of step.resumeProduces || []) replies.set(token, [...(replies.get(token) || []), step]);
  }
  const businessProducts = new Set(steps.flatMap((step) => step.produces).filter((token) => !Object.values(WORKFLOW_TERMINALS).some((value) => value === token)));
  const occupied = new Set(steps.flatMap((step) => [...step.requires, ...step.produces, ...(step.resumeProduces || [])]));
  const businessProducer = new Map<string, WorkflowDagStep | null>();
  for (const step of steps) for (const token of step.produces.filter((value) => businessProducts.has(value))) {
    businessProducer.set(token, businessProducer.has(token) ? null : step);
  }
  const ancestorsOf = (token: string, seen = new Set<string>()): Set<string> => {
    if (seen.has(token)) return seen;
    seen.add(token);
    const producer = businessProducer.get(token);
    if (producer) for (const dependency of producer.requires.filter((value) => businessProducts.has(value))) ancestorsOf(dependency, seen);
    return seen;
  };
  const distanceToAncestor = (token: string, target: string, seen = new Set<string>()): number => {
    if (token === target) return 0;
    if (seen.has(token)) return Number.POSITIVE_INFINITY;
    seen.add(token);
    const producer = businessProducer.get(token);
    if (!producer) return Number.POSITIVE_INFINITY;
    const distances = producer.requires.filter((value) => businessProducts.has(value))
      .map((value) => distanceToAncestor(value, target, new Set(seen)));
    const nearest = distances.length ? Math.min(...distances) : Number.POSITIVE_INFINITY;
    return Number.isFinite(nearest) ? nearest + 1 : nearest;
  };
  const producedNames = new Map<string, Map<string, string>>();
  const consumedNames = new Map<string, Map<string, string>>();
  for (const [token, owners] of replies) {
    if (owners.length < 2 || token.startsWith("input:") || businessProducts.has(token)) continue;
    const consumers = steps.filter((step) => step.requires.includes(token));
    const bindings = consumers.map((consumer) => {
      const dependencies = consumer.requires.filter((value) => value !== token && businessProducts.has(value));
      const consumerContext = new Set(dependencies.flatMap((value) => [...ancestorsOf(value)]));
      const ranked = owners.filter((owner) => owner.id !== consumer.id).map((owner) => ({ owner, distance: Math.min(...owner.requires
        .filter((artifact) => businessProducts.has(artifact) && consumerContext.has(artifact))
        .flatMap((artifact) => dependencies.map((dependency) => distanceToAncestor(dependency, artifact)))) }))
        .filter((entry) => Number.isFinite(entry.distance));
      const nearest = ranked.length ? Math.min(...ranked.map((entry) => entry.distance)) : Number.POSITIVE_INFINITY;
      return { consumer, candidates: ranked.filter((entry) => entry.distance === nearest).map((entry) => entry.owner) };
    });
    if (!consumers.length || bindings.some(({ candidates }) => candidates.length !== 1)) continue;
    const names = new Map(owners.map((owner) => [owner.id, `${token}:${owner.id}`]));
    if ([...names.values()].some((name) => occupied.has(name))) continue;
    const rename = (map: Map<string, Map<string, string>>, id: string, value: string) => { const local = map.get(id) || new Map(); local.set(token, value); map.set(id, local); occupied.add(value); };
    for (const owner of owners) rename(producedNames, owner.id, names.get(owner.id)!);
    for (const { consumer, candidates } of bindings) rename(consumedNames, consumer.id, names.get(candidates[0].id)!);
  }
  return steps.map((step) => {
    const incoming = consumedNames.get(step.id), outgoing = producedNames.get(step.id);
    if (!incoming && !outgoing) return step;
    return { ...step, requires: step.requires.map((token) => incoming?.get(token) || token),
      resumeProduces: step.resumeProduces?.map((token) => outgoing?.get(token) || token),
      input: step.input.replace(/\$?[a-zA-Z_][a-zA-Z0-9_.:-]*/g, (token) => incoming?.get(token) || token),
      when: step.when.replace(/\$?[a-zA-Z_][a-zA-Z0-9_.:-]*/g, (token) => incoming?.get(token) || token) };
  });
}

/** A delivery contract names the artifact being handed over. When exactly one
 * real producer exists, bind that artifact as a dependency instead of asking
 * a model to rediscover an already explicit edge. Ambiguous or missing
 * products remain compiler errors and go through targeted repair. */
function bindUnambiguousDeliveries(steps: WorkflowDagStep[]) {
  const producers = new Map<string, WorkflowDagStep[]>();
  for (const step of steps) for (const token of step.produces) producers.set(token, [...(producers.get(token) || []), step]);
  return steps.map((step) => {
    if (!["deliver", "persist"].includes(step.role || "") || !step.delivers?.length) return step;
    const requires = [...step.requires];
    for (const token of step.delivers) {
      if (step.produces.includes(token) || requires.includes(token) || Object.values(WORKFLOW_TERMINALS).some((terminal) => terminal === token)) continue;
      const owners = (producers.get(token) || []).filter((owner) => owner.id !== step.id);
      if (owners.length === 1) requires.push(token);
    }
    return requires.length === step.requires.length ? step : { ...step, requires };
  });
}

/** `$output` is a control terminal, never the content being handed over. If a
 * delivery has exactly one validated (or otherwise sole) business dependency,
 * bind that real artifact. Multiple candidates stay invalid for model repair. */
function bindTerminalOnlyDeliveries(steps: WorkflowDagStep[]) {
  const producers = new Map<string, WorkflowDagStep | null>();
  for (const step of steps) for (const token of step.produces) producers.set(token, producers.has(token) ? null : step);
  const consumed = new Set(steps.flatMap((step) => [...step.requires, ...step.mutates, ...(step.delivers || [])]));
  return steps.map((step) => {
    if (step.role !== "deliver" || !step.delivers?.length || step.delivers.some((token) => !Object.values(WORKFLOW_TERMINALS).some((terminal) => terminal === token))) return step;
    const candidates = step.requires.filter((token) => !Object.values(WORKFLOW_TERMINALS).some((terminal) => terminal === token)
      && !isUserReplyToken(token) && !["$request", "$source"].includes(token) && !token.startsWith("input:") && !token.startsWith("state:"));
    const validated = candidates.filter((token) => producers.get(token)?.role === "validate");
    let selected = validated.length === 1 ? validated : candidates.length === 1 ? candidates : [];
    if (!selected.length) {
      const leaves = steps.filter((entry) => entry.id !== step.id && !["await-input", "await-approval", "deliver", "persist"].includes(entry.role || ""))
        .flatMap((entry) => entry.produces)
        .filter((token) => !Object.values(WORKFLOW_TERMINALS).some((terminal) => terminal === token) && !isUserReplyToken(token) && !token.startsWith("state:")
          && !token.startsWith("capability:") && !consumed.has(token));
      if (leaves.length === 1) selected = leaves;
    }
    if (selected.length !== 1) return step;
    return { ...step, requires: step.requires.includes(selected[0]) ? step.requires : [...step.requires, selected[0]], delivers: selected };
  });
}

const isWorkflowTerminal = (token: string) => Object.values(WORKFLOW_TERMINALS).some((terminal) => terminal === token);
const isControlToken = (token: string) => isWorkflowTerminal(token) || isUserReplyToken(token) || token.startsWith("state:");
const isRawInputToken = (token: string) => ["$request", "$source"].includes(token) || token.startsWith("input:");

function capabilityLooksLikeGate(capability: WorkflowPlanCapability | undefined) {
  return Boolean(capability && (capability.kind === "eval"
    || /(?:test|check|validate|verify|lint|quality|format|schema|测试|检查|校验|验证|质检|格式)/i
      .test(`${capability.id} ${capability.requirement || ""} ${capability.purpose || ""} ${capability.output}`)));
}

function stepLooksLikeGate(step: WorkflowDagStep, capabilities: Map<string, WorkflowPlanCapability>) {
  return step.role === "validate" || step.capabilityIds.some((id) => capabilityLooksLikeGate(capabilities.get(id)))
    || /(?:test|check|validate|verify|lint|quality|format|schema|测试|检查|校验|验证|质检|格式)/i
      .test(`${step.id} ${step.action} ${step.output}`);
}

function stepUsesDeterministicGate(step: WorkflowDagStep, capabilities: Map<string, WorkflowPlanCapability>) {
  return step.capabilityIds.some((id) => {
      const capability = capabilities.get(id);
      return capability?.kind === "script" || capability?.kind === "eval"
        || (step.id.startsWith("step-capability-") && capabilityLooksLikeGate(capability));
    });
}

/**
 * Close deterministic wiring omissions after capability binding. Model plans
 * commonly describe validators in prose but omit their exact edges, or use a
 * pause branch as the only apparent ending. This pass never invents a task
 * operation: it only connects declared checks to an existing business
 * artifact and creates the missing hand-off for an already produced result.
 */
export function stabilizeBoundWorkflowPlan(steps: WorkflowDagStep[], capabilities: WorkflowPlanCapability[]) {
  const next = steps.map((step) => ({ ...step, requires: [...step.requires], produces: [...step.produces], mutates: [...step.mutates],
    delivers: [...(step.delivers || [])], resumeProduces: [...(step.resumeProduces || [])] }));
  const capabilityById = new Map(capabilities.map((item) => [item.id, item]));
  const occupied = new Set(next.flatMap((step) => [...step.requires, ...step.produces, ...(step.resumeProduces || [])]));

  // Independent checks may use the same generic result name. They are
  // separate gate receipts, so give only otherwise-unconsumed collisions a
  // stable private name instead of pretending that two nodes own one value.
  const owners = new Map<string, WorkflowDagStep[]>();
  for (const step of next) for (const token of step.produces) owners.set(token, [...(owners.get(token) || []), step]);
  for (const [token, producers] of owners) {
    if (producers.length < 2 || isWorkflowTerminal(token) || !producers.every((step) => stepUsesDeterministicGate(step, capabilityById))) continue;
    const externalConsumers = next.filter((step) => !producers.includes(step) && step.requires.includes(token));
    if (externalConsumers.length) continue;
    for (const producer of producers) {
      const scoped = `${token}:${producer.id}`;
      if (occupied.has(scoped)) continue;
      producer.produces = producer.produces.map((value) => value === token ? scoped : value);
      producer.delivers = producer.delivers?.map((value) => value === token ? scoped : value);
      occupied.add(scoped);
    }
  }

  const rebuild = () => {
    const producerByToken = new Map<string, WorkflowDagStep | null>();
    const consumed = new Set(next.flatMap((step) => [...step.requires, ...step.mutates, ...(step.delivers || [])]));
    for (const step of next) for (const token of [...step.produces, ...(step.resumeProduces || [])]) {
      producerByToken.set(token, producerByToken.has(token) ? null : step);
    }
    return { producerByToken, consumed };
  };

  let graph = rebuild();
  const businessTokens = () => next.flatMap((step) => step.produces.map((token) => ({ step, token })))
    .filter(({ token }) => !isControlToken(token) && !token.startsWith("capability:") && !isRawInputToken(token));
  const deliveryArtifacts = () => new Set(next.flatMap((step) => ["deliver", "persist"].includes(step.role || "")
    ? [...(step.delivers || []), ...step.requires.filter((token) => graph.producerByToken.has(token) && !stepLooksLikeGate(graph.producerByToken.get(token)!, capabilityById))]
    : []).filter((token) => !isControlToken(token) && !isRawInputToken(token)));

  // Bind validator/test inputs to the unique artifact already headed for
  // delivery (or, failing that, the unique business leaf). Never promote an
  // unbound placeholder to a user input.
  for (const gate of next.filter((step) => stepUsesDeterministicGate(step, capabilityById))) {
    const unbound = gate.requires.filter((token) => token.startsWith("unbound:"));
    if (!unbound.length) continue;
    const exact = businessTokens().filter(({ token, step }) => step.id !== gate.id
      && new RegExp(`(?:^|[^a-zA-Z0-9_.:-])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-zA-Z0-9_.:-])`).test(`${gate.input} ${gate.action}`));
    const delivered = businessTokens().filter(({ step, token }) => step.id !== gate.id && deliveryArtifacts().has(token));
    const leaves = businessTokens().filter(({ step, token }) => step.id !== gate.id && !graph.consumed.has(token) && !stepLooksLikeGate(step, capabilityById));
    const candidates = exact.length === 1 ? exact : delivered.length === 1 ? delivered : leaves.length === 1 ? leaves : [];
    if (candidates.length !== 1) continue;
    gate.requires = [...gate.requires.filter((token) => !token.startsWith("unbound:")), candidates[0].token];
    graph = rebuild();
  }

  // A check receipt is control evidence for hand-off, not another user
  // deliverable. Feed every otherwise-orphaned receipt into the compatible
  // final delivery so the check is ordered and cannot silently disappear.
  graph = rebuild();
  const terminalDeliveries = next.filter((step) => ["deliver", "persist"].includes(step.role || "")
    && (step.produces.includes(WORKFLOW_TERMINALS.completed) || (step.delivers || []).length > 0));
  for (const gate of next.filter((step) => stepUsesDeterministicGate(step, capabilityById))) {
    const receipts = gate.produces.filter((token) => !isControlToken(token) && !graph.consumed.has(token));
    if (!receipts.length || !terminalDeliveries.length) continue;
    const gatesArtifact = gate.requires.filter((token) => graph.producerByToken.has(token));
    const compatible = terminalDeliveries.filter((delivery) => gatesArtifact.some((token) => delivery.requires.includes(token) || delivery.delivers?.includes(token)));
    const targets = compatible.length ? compatible : terminalDeliveries.length === 1 ? terminalDeliveries : [];
    for (const delivery of targets) for (const receipt of receipts) if (!delivery.requires.includes(receipt)) delivery.requires.push(receipt);
    graph = rebuild();
  }

  // Resolve a terminal-only hand-off from an existing business result. The
  // local binding runs again here because capability helpers may have changed
  // which leaf is unique.
  const rebound = bindTerminalOnlyDeliveries(next);
  next.splice(0, next.length, ...rebound);
  graph = rebuild();

  // A pause is a valid branch ending, but it cannot replace normal task
  // delivery. If no completion path exists, hand off the unique/latest real
  // artifact that the declared workflow already produced.
  if (!next.some((step) => step.produces.includes(WORKFLOW_TERMINALS.completed))) {
    const gateTokens = new Set(next.filter((step) => stepLooksLikeGate(step, capabilityById)).flatMap((step) => step.produces));
    const preferred = businessTokens().filter(({ token }) => !gateTokens.has(token) && !graph.consumed.has(token));
    const checkpointArtifacts = next.filter((step) => ["await-input", "await-approval"].includes(step.role || ""))
      .flatMap((step) => [...(step.delivers || []), ...step.requires]).filter((token) => graph.producerByToken.has(token) && !isControlToken(token));
    const uniqueCheckpoint = [...new Set(checkpointArtifacts)];
    const candidates = preferred.length === 1 ? preferred
      : uniqueCheckpoint.length === 1 ? businessTokens().filter(({ token }) => token === uniqueCheckpoint[0])
        : businessTokens().filter(({ step, token }) => !gateTokens.has(token) && !stepLooksLikeGate(step, capabilityById));
    const selected = candidates.at(-1);
    if (selected) {
      const baseId = "step-final-delivery";
      let id = baseId, suffix = 2;
      while (next.some((step) => step.id === id)) id = `${baseId}-${suffix++}`;
      const semanticOwners = selected.step.capabilityIds.filter((owner) => capabilityById.get(owner)?.kind === "llm");
      const fallbackOwners = capabilities.filter((item) => item.kind === "llm").map((item) => item.id);
      const receipts = next.filter((step) => stepUsesDeterministicGate(step, capabilityById))
        .flatMap((step) => step.produces).filter((token) => !isControlToken(token) && !graph.consumed.has(token));
      next.push({ id, capabilityIds: semanticOwners.length ? semanticOwners : fallbackOwners.slice(0, 1), role: "deliver",
        when: "已完成声明的处理与检查时", input: selected.token, action: "交付已经生成并通过检查的结果",
        output: "向用户交付现有结果，不重新生成内容", fallback: "如果结果尚未生成或检查未通过，停止交付并说明缺口",
        requires: [...new Set([selected.token, ...receipts])], produces: [WORKFLOW_TERMINALS.completed], mutates: [], delivers: [selected.token], resumeProduces: [] });
    }
  }
  return next;
}

/** A single read operation followed by a single root semantic transform has
 * one lossless wiring: the transform consumes every otherwise-orphaned read
 * product. This covers planners that describe those inputs in prose but omit
 * the exact token names. Ambiguous multi-consumer workflows remain invalid. */
function bindUniqueReadProducts(steps: WorkflowDagStep[]) {
  const next = steps.map((step) => ({ ...step, requires: [...step.requires] }));
  const consumed = new Set(next.flatMap((step) => [...step.requires, ...step.mutates, ...(step.delivers || [])]));
  for (const reader of next.filter((step) => step.role === "read")) {
    const products = reader.produces.filter((token) => !consumed.has(token) && !Object.values(WORKFLOW_TERMINALS).some((terminal) => terminal === token));
    if (!products.length) continue;
    const candidates = next.filter((step) => step.id !== reader.id && step.role === "transform"
      && step.capabilityIds.some((id) => reader.capabilityIds.includes(id))
      && step.requires.every((token) => ["$request", "$source"].includes(token) || token.startsWith("input:") || isUserReplyToken(token)));
    if (candidates.length !== 1) continue;
    candidates[0].requires.push(...products);
    products.forEach((token) => consumed.add(token));
  }
  return next;
}

/** A mutable field cannot be updated before it exists. Models occasionally
 * mark the first assignment as mutates[], then keep using mutates[] for later
 * revisions. Turn only the uniquely earliest writer into the initializer and
 * wire every later writer to that state. Ambiguous parallel writers remain a
 * compiler error instead of being ordered by array position. */
function initializeFirstStateWrites(steps: WorkflowDagStep[]) {
  const next = steps.map((step) => ({ ...step, requires: [...step.requires], produces: [...step.produces], mutates: [...step.mutates] }));
  const producers = new Map<string, string | null>();
  for (const step of next) for (const token of [...step.produces, ...(step.resumeProduces || [])]) {
    producers.set(token, producers.has(token) ? null : step.id);
  }
  const outgoing = new Map(next.map((step) => [step.id, new Set<string>()]));
  for (const step of next) for (const dependency of step.requires) {
    const producer = producers.get(dependency);
    if (producer && producer !== step.id) outgoing.get(producer)?.add(step.id);
  }
  const precedes = (from: string, to: string, seen = new Set<string>()): boolean => {
    if (seen.has(from)) return false;
    seen.add(from);
    return [...(outgoing.get(from) || [])].some((nextId) => nextId === to || precedes(nextId, to, seen));
  };
  const tokens = new Set(next.flatMap((step) => step.mutates));
  for (const token of tokens) {
    if (producers.has(token) || isUserReplyToken(token) || Object.values(WORKFLOW_TERMINALS).some((terminal) => terminal === token)) continue;
    const writers = next.filter((step) => step.mutates.includes(token));
    const roots = writers.filter((candidate) => !writers.some((other) => other.id !== candidate.id && precedes(other.id, candidate.id)));
    if (roots.length !== 1 || !["transform", "read", "validate"].includes(roots[0].role || "transform")) continue;
    const initializer = roots[0];
    initializer.mutates = initializer.mutates.filter((value) => value !== token);
    initializer.requires = initializer.requires.filter((value) => value !== token);
    if (!initializer.produces.includes(token)) initializer.produces.push(token);
    producers.set(token, initializer.id);
    for (const writer of writers.filter((step) => step.id !== initializer.id)) {
      if (!writer.requires.includes(token)) writer.requires.push(token);
    }
  }
  return next;
}

/** If exactly one step updates a state field and exactly one terminal step
 * reads it, an otherwise disconnected handoff has only one safe direction:
 * update, then validate/deliver. Add an explicit completion edge so runtime
 * ordering matches that contract. Multiple writers/readers remain untouched
 * because joining conditional branches would be unsafe. */
function orderUniqueStateHandoffs(steps: WorkflowDagStep[]) {
  const next = steps.map((step) => ({ ...step, requires: [...step.requires], produces: [...step.produces] }));
  const producers = new Map<string, string | null>();
  for (const step of next) for (const token of [...step.produces, ...(step.resumeProduces || [])]) {
    producers.set(token, producers.has(token) ? null : step.id);
  }
  const outgoing = new Map(next.map((step) => [step.id, new Set<string>()]));
  for (const step of next) for (const dependency of step.requires) {
    const producer = producers.get(dependency);
    if (producer && producer !== step.id) outgoing.get(producer)?.add(step.id);
  }
  const precedes = (from: string, to: string, seen = new Set<string>()): boolean => {
    if (seen.has(from)) return false;
    seen.add(from);
    return [...(outgoing.get(from) || [])].some((nextId) => nextId === to || precedes(nextId, to, seen));
  };
  for (const token of new Set(next.flatMap((step) => step.mutates))) {
    const writers = next.filter((step) => step.mutates.includes(token));
    const terminalReaders = next.filter((step) => step.requires.includes(token) && !step.mutates.includes(token)
      && ["validate", "deliver", "persist"].includes(step.role || ""));
    if (writers.length !== 1 || terminalReaders.length !== 1) continue;
    const [writer] = writers, [reader] = terminalReaders;
    if (precedes(writer.id, reader.id) || precedes(reader.id, writer.id)) continue;
    const completion = `state:${token}:updated-by:${writer.id}`;
    if (!writer.produces.includes(completion)) writer.produces.push(completion);
    if (!reader.requires.includes(completion)) reader.requires.push(completion);
    outgoing.get(writer.id)?.add(reader.id);
  }
  return next;
}

/** Lossless boundary metadata, not task invention. Bind only a unique declared
 * input or an actual parent capability. Derived data still needs a producer. */
export function normalizeWorkflowPlanBindings(context: WorkflowPlanContext, previous: WorkflowDagStep[] = []) {
  const rawSteps = normalizeWorkflowDagSteps(context.workflowSteps);
  let steps: WorkflowDagStep[] = rawSteps.map((original) => {
    const step = { ...original, produces: [...original.produces] };
    // Some models omit "$" on a pause marker. It is wire spelling, not a
    // business artifact, ONLY when declared by the matching checkpoint and
    // not consumed as data anywhere. Never manufacture an approval reply.
    const pause = step.role === "await-input" ? WORKFLOW_TERMINALS.inputRequired : step.role === "await-approval" ? WORKFLOW_TERMINALS.approvalRequired : undefined;
    if (pause) {
      const alias = pause.slice(1);
      const usedAsData = rawSteps.some((entry) => [...entry.requires, ...entry.mutates, ...(entry.delivers || []), ...(entry.resumeProduces || [])].includes(alias));
      if (!usedAsData) step.produces = step.produces.map((token) => token === alias ? pause : token);
    }
    if (["deliver", "persist"].includes(step.role || "")) {
      const usedAsData = rawSteps.some((entry) => [...entry.requires, ...entry.mutates, ...(entry.delivers || []), ...(entry.resumeProduces || [])].includes("output"));
      if (!usedAsData) step.produces = step.produces.map((token) => token === "output" ? WORKFLOW_TERMINALS.completed : token);
    }
    const before = previous.find((item) => item.id === step.id);
    const closed = closeWorkflowDagTerminals([step])[0];
    const owners = context.capabilities.filter((item) => step.capabilityIds.includes(item.id));
    const capabilityRole = owners.some((item) => /artifact-output|file-output/.test((item.affects || []).join(" ")))
      ? "persist" : owners.length && owners.every((item) => item.kind === "reference" || item.kind === "asset") ? "read" : "transform";
    return { ...step, role: step.role || before?.role || closed.role || capabilityRole as WorkflowDagStep["role"] };
  });
  steps = initializeFirstStateWrites(steps);
  steps = bindUniqueReadProducts(steps);
  steps = bindTerminalOnlyDeliveries(steps);
  steps = bindUnambiguousDeliveries(steps);
  steps = orderUniqueStateHandoffs(steps);
  steps = scopeCheckpointReplies(steps);
  steps = scopeDeliveredVersions(steps);
  // Reply values written by models without "$" are still runtime events when
  // (and only when) declared by a real checkpoint. Canonicalize producer and
  // consumer together; never promote them to initial inputs.
  const replyAliases = new Map<string, string>();
  steps = steps.map((step) => {
    if (!["await-input", "await-approval"].includes(step.role || "")) return step;
    const resumeProduces = (step.resumeProduces || []).map((token) => {
      const canonical = canonicalReplyToken(token);
      const ambiguous = steps.some((other) => other.id !== step.id && [...other.produces, ...(other.resumeProduces || [])].some((otherToken) => otherToken === token || otherToken === canonical));
      if (canonical !== token && !ambiguous) { replyAliases.set(token, canonical); return canonical; }
      return token;
    });
    return { ...step, resumeProduces };
  }).map((step) => ({ ...step, requires: step.requires.map((token) => replyAliases.get(token) || token) }));
  const produced = new Set(steps.flatMap((step) => [...step.produces, ...(step.resumeProduces || [])]));
  // Restored plans may already have canonical edges but old variable names
  // in their conditions. Resolve those only against a real checkpoint reply.
  const checkpointReplies = new Set(steps.flatMap((step) => step.resumeProduces || []));
  const resolveReply = (token: string) => {
    const canonical = canonicalReplyToken(token);
    return replyAliases.get(token) || (!produced.has(token) && checkpointReplies.has(canonical) ? canonical : token);
  };
  const aliases = new Map<string, string>();
  for (const step of steps) for (const token of step.requires) {
    if (produced.has(token) || isUserReplyToken(token) || ["$request", "$source"].includes(token) || !token.startsWith("$")) continue;
    const representation = token.match(fileAlias)?.[1]?.toLowerCase();
    const base = normalizedLabel(token.replace(fileAlias, ""));
    const candidates = context.inputs.filter((input) => {
      if ([input.id, input.concept || "", input.name].some((name) => name && normalizedLabel(name) === base)) return true;
      // Cross-language aliases are accepted only with an explicit filename
      // representation AND the declared input name in this step's input text.
      return Boolean(representation && (input.representations?.includes(representation)
        || (normalizedLabel(input.name).length >= 2 && normalizedLabel(step.input).includes(normalizedLabel(input.name))
          && !input.representations?.length)));
    });
    if (candidates.length === 1) {
      const binding = `input:${candidates[0].id}`;
      if (!aliases.has(token) || aliases.get(token) === binding) aliases.set(token, binding);
      else aliases.set(token, ""); // Conflicting contexts stay unresolved.
    }
  }
  steps = steps.map((step) => ({ ...step,
    requires: step.requires.map((token) => aliases.get(token) || resolveReply(token)),
    input: step.input.replace(/\$?[a-zA-Z_][a-zA-Z0-9_.:-]*/g, (token) => aliases.get(token) || resolveReply(token)),
    when: step.when.replace(/\$?[a-zA-Z_][a-zA-Z0-9_.:-]*/g, (token) => aliases.get(token) || resolveReply(token)),
  }));
  const capabilities = new Map(context.capabilities.map((item) => [item.id, item]));
  for (const step of steps) {
    if (step.capabilityIds.some((id) => capabilities.has(id))) continue;
    // Checkpoints and handoff are control operations on a parent's product.
    // They inherit its unique semantic owner, never an arbitrary new tool.
    if (!["await-input", "await-approval", "deliver"].includes(step.role || "")) continue;
    const owners = new Set(steps.filter((parent) => parent.id !== step.id && parent.produces.some((token) => step.requires.includes(token)))
      .flatMap((parent) => parent.capabilityIds).filter((id) => capabilities.get(id)?.kind === "llm"));
    if (owners.size === 1) step.capabilityIds = [...owners];
  }
  return steps;
}

export function inspectWorkflowPlan(context: WorkflowPlanContext) {
  const initialInputs = ["$request", "$source", ...context.inputs.map((input) => `input:${input.id}`)];
  const normalized = normalizeWorkflowPlanBindings(context);
  const bound = bindWorkflowCapabilities(normalized, context.capabilities);
  const baseline = closeWorkflowDagTerminals(bound, initialInputs);
  const baselineCompile = compileWorkflowDag(baseline, initialInputs, { terminalOutputs: Object.values(WORKFLOW_TERMINALS), requiredTerminalOutputs: [WORKFLOW_TERMINALS.completed] });
  const capabilityById = new Map(context.capabilities.map((item) => [item.id, item]));
  const byId = new Map(baseline.map((step) => [step.id, step]));
  const deterministicOnly = baselineCompile.issues.every((issue) => {
    if (["missing-terminal", "invalid-terminal"].includes(issue.type)) return true;
    const step = byId.get(issue.stepId);
    if (!step || !stepUsesDeterministicGate(step, capabilityById)) return false;
    return ["duplicate-producer", "unmet-dependency", "unconsumed-production", "disconnected-step"].includes(issue.type)
      && (issue.type !== "unmet-dependency" || Boolean(issue.dependency?.startsWith("unbound:")));
  });
  const stabilized = baselineCompile.issues.length && deterministicOnly
    ? stabilizeBoundWorkflowPlan(bound, context.capabilities)
    : bound;
  const steps = closeWorkflowDagTerminals(stabilized, initialInputs);
  const result = compileWorkflowDag(steps, initialInputs, { terminalOutputs: Object.values(WORKFLOW_TERMINALS), requiredTerminalOutputs: [WORKFLOW_TERMINALS.completed] });
  const ids = new Set(context.capabilities.map((item) => item.id));
  const ownershipIssues = steps.flatMap((step) => !step.capabilityIds.length || step.capabilityIds.some((id) => !ids.has(id))
    ? [`Workflow step ${step.id} 缺少有效的 capability owner；必须使用当前已启用能力的 id`] : []);
  const issues = [...result.issues.map((item) => item.message), ...ownershipIssues, ...workflowCapabilityRouteIssues(steps, context.capabilities)];
  if (!steps.length) issues.push("Workflow 没有可执行步骤");
  return { valid: !issues.length, steps, ordered: result.ordered, initialInputs, issues };
}

export type WorkflowRepairRequest = {
  workflowSteps: WorkflowDagStep[];
  capabilities: WorkflowPlanCapability[];
  inputs: Array<{ token: string; name: string; required: boolean; availability: string }>;
  initialInputs: string[];
  issues: string[];
  attempt: number;
};

/** Apply a small graph patch without making the model reproduce (and sometimes
 * lose) unrelated operations. Identity is immutable; additions are explicit.
 * The strict compiler and semantic preservation checks still run afterwards. */
export function applyWorkflowStepPatch(steps: WorkflowDagStep[], payload: Record<string, unknown>, capabilities: WorkflowPlanCapability[] = []) {
  if (!Array.isArray(payload.stepUpdates)) return payload.workflowSteps;
  const next = structuredClone(steps);
  const seen = new Set<string>();
  for (const value of payload.stepUpdates) {
    if (!value || typeof value !== "object") throw new Error("stepUpdates 必须包含 id 和 changes");
    const update = value as Record<string, unknown>;
    const index = next.findIndex((step) => step.id === update.id);
    if (index < 0 || seen.has(String(update.id))) throw new Error(`修复节点不存在或重复：${String(update.id)}`);
    if (!update.changes || typeof update.changes !== "object" || Array.isArray(update.changes)) throw new Error("节点 changes 必须是对象");
    const changes = update.changes as Record<string, unknown>;
    const fields = new Set(["capabilityIds", "availableCapabilityIds", "role", "when", "input", "action", "output", "fallback", "requires", "produces", "mutates", "delivers", "resumeProduces"]);
    if (Object.keys(changes).some((key) => !fields.has(key))) throw new Error("节点补丁不能改 id 或包含未知字段");
    seen.add(String(update.id));
    next[index] = { ...next[index], ...changes };
  }
  if (payload.addedSteps !== undefined && !Array.isArray(payload.addedSteps)) throw new Error("addedSteps 必须是数组");
  for (const value of (payload.addedSteps || []) as WorkflowDagStep[]) {
    if (!value?.id || next.some((step) => step.id === value.id)) throw new Error("新增节点必须具有唯一 id");
    next.push(value);
  }
  if (payload.foldedSteps !== undefined && !Array.isArray(payload.foldedSteps)) throw new Error("foldedSteps 必须是数组");
  const folded = new Set<string>();
  const foldTargets = new Set(((payload.foldedSteps || []) as Array<{ intoStepId: string }>).map((item) => item?.intoStepId));
  for (const fold of (payload.foldedSteps || []) as Array<{ id: string; intoStepId: string }>) {
    const original = steps.find((step) => step.id === fold?.id);
    const helper = next.find((step) => step.id === fold?.id);
    const target = next.find((step) => step.id === fold?.intoStepId);
    const owner = capabilities.find((item) => original?.capabilityIds.length === 1 && item.id === original.capabilityIds[0]);
    // Only compiler-created, read-only host helpers may be absorbed. Keep
    // writes, external-service actions, checkpoints and real task nodes intact.
    const readOnly = owner && isReadOnlyHostEvidence(owner);
    if (!original || !helper || !target || helper.id === target.id || folded.has(helper.id) || foldTargets.has(helper.id)
      || !helper.id.startsWith("step-capability-") || !readOnly
      || [original, helper].some((step) => step.mutates.length || step.delivers?.length || step.resumeProduces?.length
        || !["read", "transform"].includes(step.role || "transform") || step.produces.some((token) => Object.values(WORKFLOW_TERMINALS).some((terminal) => terminal === token)))
      || !["read", "transform", "validate"].includes(target.role || "transform")) {
      throw new Error(`不能合并节点 ${fold?.id}：仅可将无副作用的自动读取节点合入具体处理步骤`);
    }
    // A result already used by another node cannot just disappear. It must
    // remain a real product of the receiving operation after the fold.
    const referenced = next.filter((step) => step.id !== helper.id).flatMap((step) => [...step.requires, ...step.mutates, ...(step.delivers || [])]);
    for (const token of new Set([...original.produces, ...helper.produces])) {
      if (referenced.includes(token) && !target.produces.includes(token)) throw new Error(`合并节点必须保留已被消费的产物 ${token}`);
    }
    if (!seen.has(target.id) || target.action === steps.find((step) => step.id === target.id)?.action) {
      throw new Error(`合并节点必须更新 ${target.id} 的 action，明确读取条件、实际输入和结果用途`);
    }
    // Preserve existing data dependencies; unbound placeholders are not data.
    for (const token of original.requires.filter((value) => !value.startsWith("unbound:"))) {
      if (!target.requires.includes(token) && !target.produces.includes(token)) throw new Error(`合并节点必须保留输入依赖 ${token}`);
    }
    target.capabilityIds = [...new Set([...target.capabilityIds, ...original.capabilityIds])];
    folded.add(helper.id);
  }
  return next.filter((step) => !folded.has(step.id));
}

/** A pre-IR repair: bundle repair cannot run while compileSkillIR itself throws.
 * No missing dependency is promoted to an initial input. The model can repair
 * only graph wiring/actions, not user evidence, capability ownership or output
 * contracts. Every proposal is checked by the same strict DAG compiler. */
export async function repairWorkflowPlan(
  context: WorkflowPlanContext,
  propose: (request: WorkflowRepairRequest) => Promise<unknown>,
  onProgress?: (event: { attempt: number; status: "repairing" | "passed" | "failed"; issues: string[] }) => void,
) {
  let current = inspectWorkflowPlan(context);
  const originalSteps = current.steps;
  const originalCompile = compileWorkflowDag(originalSteps, current.initialInputs);
  const structuralProductions = new Set(originalCompile.issues.flatMap((issue) => issue.type === "duplicate-producer" && issue.dependency && current.initialInputs.includes(issue.dependency) ? [issue.dependency] : []));
  const originalArtifacts = new Set(originalSteps.flatMap((step) => [...step.produces, ...(step.resumeProduces || [])]
    .filter((token) => !isUserReplyToken(token) && !structuralProductions.has(token) && !(step.role && ["deliver", "persist"].includes(step.role) && /^\$output_(?:final|revised|draft)$/.test(token)
      && !step.delivers?.includes(token) && !originalSteps.some((consumer) => consumer.requires.includes(token))))));
  const cyclicSteps = new Set(originalCompile.issues.filter((issue) => issue.type === "cycle").map((issue) => issue.stepId));
  let rejectionIssues: string[] = [];
  let attempts = 0;
  while ((!current.valid || rejectionIssues.length) && attempts < 2) {
    attempts += 1;
    const issues = [...current.issues, ...rejectionIssues];
    onProgress?.({ attempt: attempts, status: "repairing", issues });
    const raw = await propose({
      workflowSteps: current.steps,
      capabilities: context.capabilities,
      inputs: context.inputs.map((input) => ({ token: `input:${input.id}`, name: input.name, required: input.required, availability: "Resolve from the user's runtime request/materials; if absent, ask. Not fabricated or assumed present." })),
      initialInputs: current.initialInputs, issues, attempt: attempts,
    });
    const payload = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    let patched;
    try { patched = applyWorkflowStepPatch(current.steps, payload, context.capabilities); }
    catch (error) { rejectionIssues = [error instanceof Error ? error.message : "节点补丁格式错误"]; continue; }
    const proposed = normalizeWorkflowPlanBindings({ ...context, workflowSteps: normalizeWorkflowDagSteps(patched) }, current.steps);
    const retainedIds = new Set(proposed.map((step) => step.id));
    const production = new Set(proposed.flatMap((entry) => [...entry.produces, ...(entry.resumeProduces || [])]));
    rejectionIssues = [];
    if (!proposed.length) rejectionIssues.push("修复必须返回完整 workflowSteps，不能返回说明文字或空数组");
    for (const step of proposed) {
      if (!step.role) rejectionIssues.push(`修复步骤 ${step.id} 必须声明 role，不能靠省略角色绕过交付检查`);
      const unknownIds = step.capabilityIds.filter((id) => !context.capabilities.some((capability) => capability.id === id));
      if (unknownIds.length) rejectionIssues.push(`步骤 ${step.id} 引用了未启用能力 ${unknownIds.join(", ")}；只使用请求中 capabilities 的精确 id，不得改名或创建能力`);
    }
    // Preserve actual task operations and their artifacts. Auto-inserted
    // resource helpers may be folded into an explicit consuming operation.
    for (const step of originalSteps.filter((entry) => !entry.id.startsWith("step-capability-")
      || entry.mutates.length || ["persist", "await-input", "await-approval"].includes(entry.role || "")
      || originalSteps.some((consumer) => consumer.id !== entry.id && entry.produces.some((token) => consumer.requires.includes(token))))) {
      if (!retainedIds.has(step.id)) rejectionIssues.push(`修复不能删除原任务步骤 ${step.id}；请保留该步骤并修复依赖`);
      const replacement = proposed.find((entry) => entry.id === step.id);
      for (const id of step.capabilityIds.filter((id) => context.capabilities.some((capability) => capability.id === id && ["builtin-tool", "mcp", "script"].includes(capability.kind)))) {
        if (replacement && !replacement.capabilityIds.includes(id)) rejectionIssues.push(`步骤 ${step.id} 必须保留已规划的工具 ${id}，不能降级为可用能力或仅用模型模拟`);
      }
      // Valid data edges and write effects are not expendable just because
      // another edge is broken. Missing raw-input aliases may be rebound.
      for (const token of step.requires.filter((token) => !cyclicSteps.has(step.id) && originalArtifacts.has(token) && !Object.values(WORKFLOW_TERMINALS).some((terminal) => terminal === token))) {
        if (replacement && !replacement.requires.includes(token)) rejectionIssues.push(`步骤 ${step.id} 必须保留已有业务依赖 ${token}，不能退化为只读 $request`);
      }
      for (const token of step.mutates) {
        if (replacement && !replacement.mutates.includes(token)) rejectionIssues.push(`步骤 ${step.id} 必须保留状态写入 ${token}`);
      }
      if (replacement && step.role && ["persist", "await-input", "await-approval"].includes(step.role) && replacement.role !== step.role) {
        rejectionIssues.push(`步骤 ${step.id} 必须保留 ${step.role} 语义，不能把保存或用户确认改成普通处理`);
      }
      for (const token of [...step.produces, ...(step.resumeProduces || [])].filter((token) => originalArtifacts.has(token))) {
        if (!Object.values(WORKFLOW_TERMINALS).some((terminal) => terminal === token) && !production.has(token)) {
          rejectionIssues.push(`修复不能抹掉业务产物 ${token}；请绑定消费者或真实交付步骤`);
        }
      }
    }
    if (rejectionIssues.length) continue;
    current = inspectWorkflowPlan({ ...context, workflowSteps: proposed });
  }
  const issues = [...current.issues, ...rejectionIssues];
  if (!current.valid || rejectionIssues.length) {
    onProgress?.({ attempt: attempts, status: "failed", issues });
    throw new Error(`WORKFLOW_DAG_INVALID: 工作流连线定向修复 ${attempts} 轮仍未通过：${issues.join("；")}`);
  }
  onProgress?.({ attempt: attempts, status: "passed", issues: [] });
  return { workflowSteps: current.ordered, attempts };
}

export const WORKFLOW_REPAIR_PROMPT = `Repair only the supplied runtime Workflow DAG. Return JSON {"stepUpdates":[{"id":"exact-existing-id","changes":{"requires":["all retained and repaired input tokens"]}}],"addedSteps":[],"foldedSteps":[]}. Return ONLY changed fields for existing nodes; untouched nodes and fields are retained automatically. Arrays replace that field, so preserve valid entries. Never rename/delete a real task node. addedSteps is only for genuinely missing operations; each new step has id, capabilityIds[], role, when, input, action, output, fallback, requires[], produces[], mutates[], delivers[], resumeProduces[]. Do not re-emit the entire graph.
Return compact JSON: no indentation/newlines outside string values. Preserve complete task behavior; save whitespace, not requirements. capabilityIds must use exact enabled ids from the supplied catalog: user/human/assistant are actors, not capability ids. Checkpoint and handoff steps use the semantic capability responsible for their input product.
The declared input catalog is authoritative. Only $request, $source and the exact listed input:<id> tokens are initial roots. They describe runtime inputs, not evidence that the user already supplied them. Resolve from actual materials, or ask when absent. Never invent an input, add a derived artifact to the initial roots, or pretend an API/tool ran.
Fix missing intermediate data by adding its real extraction/analysis step with an existing appropriate capability owner. Use identical producer/consumer tokens. A file is not its parsed contents; a task specification is not extracted keywords or a completed analysis. Do not replace all requires with $request.
Feedback/approval after a draft is event-owned: add an await-input/await-approval checkpoint depending on that draft, emit $input_required/$approval_required now, and declare the feedback/approval token in resumeProduces. The revision step depends on the draft AND that actual reply. Do not make future feedback an initial root. Keep pre-draft and pre-delivery approvals separate. A pause is not completed delivery.
Give each checkpoint distinct reply variables for its specific artifact version. For optional revision, use separate normal-delivery and revised-delivery steps, each depending on its actual produced artifact and corresponding approval. Never introduce an undefined final_* artifact to join branches. If one existing delivery uses an undefined final_* alias, bind it to the real original artifact and add a distinct revised delivery for the real revised artifact. Route all companion artifacts to review/delivery too. A persist step returning a file path must declare that path in produces; do not require the not-yet-saved file as input.
For duplicate business producers, retain the first producer's token and give later versions distinct tokens, updating only the consumers/delivers of each corresponding branch. Renaming a colliding version is allowed; deleting the actual output is not. Example: two save branches cannot both produce file_path; keep file_path on the first and file_path_revised on the second. Each save branch's delivers must include its own produced file-path token so the real file is actually handed to the user. Use $output, never output, as the shared completion marker, not as a filename.
NEVER list a terminal marker in delivers. If delivers is [$output], replace it with the actual artifact: for saving, add a concrete unique file-path token to produces alongside $output and list that file token in delivers. Do not hide a missing file by listing only input text or a completion marker.
Only explicit deliver/persist steps may produce $output; also list the actual business tokens in delivers. Normal and revised outputs can each have conditional delivery steps; do not join mutually exclusive branches as AND dependencies. Read/search/extraction is not delivery. Retain all real steps with stable ids and all their business artifacts. Do not remove a validation failure by deleting work.
An orphan validation result is a missing delivery gate, NOT a new terminal: find the deliver/persist node for the EXACT artifact that the validate node checks. Add that validation-result token to the delivery's requires (retaining its artifact and real confirmation dependencies); delivery's when/action must require validation to pass and report failures without claiming completion. If validation currently follows delivery, separate generation from delivery and add a real post-validation handoff. Never relabel validate as deliver or delete a checkpoint to solve this. Different artifact versions/branches need their own validation, not an unrelated shared gate.
All active capabilities must have a real route. Optional builtin-tool/MCP providers that are available but not scheduled belong in the actual LLM read/transform consumer's availableCapabilityIds; this is not an instruction or permission to call them. Retain existing availability IDs when changing this list. Never demote a required tool, artifact producer, write, checkpoint or real task operation to availability. Selected optional host adapters may also be owned by the content operation that consumes their evidence; selection alone does not require a separate task node or global output. Document/image reading and spreadsheet analysis are conditional on real relevant material. Spreadsheet analysis is not permission to export a file; preserve explicit persistence and its content dependencies. Fix BOTH sides of every remaining orphan tool: bind its requires to real inputs AND add its produced token to the actual consuming node's requires/action. Renaming its output alone does not connect it. Do not insert an unused search task or make optional search a prerequisite for every task.
Alternatively absorb a generated read-only builtin-tool helper with foldedSteps:[{"id":"exact-step-capability-helper-id","intoStepId":"exact-existing-consumer-id"}]. In stepUpdates update the consumer's action to explain when to call that tool, which actual input/query to pass, and how its result is used. Keep the helper's valid input dependencies in the consumer's requires, and retain any helper product that another node consumes. The compiler transfers capability ownership and removes ONLY that synthetic node. This is useful for a duplicate document reader or optional source lookup inside content analysis. Never fold writes, MCP external actions, real task operations, approval/checkpoint nodes or delivery. Do not merely remove a helper's capabilityIds: that creates another missing route. Never invent builtin-* aliases for catalog host-* ids; use exact enabled ids. Never add/delete capabilities, change user requirements, weaken output contracts or reverse negative examples.
File persistence depends on generated content. mutates requires the prior state and an ordered version/completion token. $-prefixed business tokens are allowed but must have producers. Stop when an actual required tool is unavailable, never simulate it. Fix every listed compiler issue and return only the repaired graph, no files or prose.`;
