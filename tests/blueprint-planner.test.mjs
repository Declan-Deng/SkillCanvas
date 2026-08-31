import assert from "node:assert/strict";
import test from "node:test";
import { assertBlueprintStage, blueprintStagePrompt, runBlueprintPlanning, BLUEPRINT_LEGACY_PROMPT } from "../app/blueprint-planner.ts";
import { input, stageResults, capabilities, workflow } from "./fixtures/blueprint.mjs";

test("failed workflow resumes only that stage and sees complete prepared capability owners", async () => {
  const checkpoint = {};
  const calls = [];
  let fail = true;
  const call = async (mode, payload) => {
    calls.push(mode);
    if (mode === "blueprint-workflow") {
      assert.ok(payload.capabilityPlan.items.some((item) => item.id === "host-file-workspace"));
      if (fail) throw new Error("AI_OUTPUT_TRUNCATED");
    }
    return structuredClone(stageResults[mode]);
  };
  const prepareCapabilities = (plan) => ({ ...plan, items: [...plan.items, { ...plan.items[0], id: "host-file-workspace" }] });
  await assert.rejects(runBlueprintPlanning({ ...input, checkpoint, call, prepareCapabilities }), /TRUNCATED/);
  assert.equal(checkpoint.workflow, undefined);
  assert.deepEqual(checkpoint.capabilities, capabilities.capabilityPlan);
  fail = false;
  const result = await runBlueprintPlanning({ ...input, checkpoint, call, prepareCapabilities });
  assert.deepEqual(calls, ["blueprint-foundation", "blueprint-capabilities", "blueprint-workflow", "blueprint-workflow"]);
  assert.deepEqual(result.capabilityPlan.workflowSteps, workflow.workflowSteps);
  assert.deepEqual(result.loopPlan, workflow.loopPlan);
  assert.deepEqual(result.capabilityPlan.outputContract, capabilities.capabilityPlan.outputContract);
  result.capabilityPlan.workflowSteps.pop();
  assert.equal(checkpoint.workflow.workflowSteps.length, 2, "downstream normalization cannot mutate checkpoint");
});

test("changed model, evidence, source or runtime input contract invalidates all prior stages", async () => {
  for (const change of [
    (v) => { v.modelIdentity.model = "other-model"; },
    (v) => { v.modelIdentity.baseUrl = "https://other.test/v1"; },
    (v) => { v.foundationInput.sourceText += " new source"; },
    (v) => { v.foundationInput.answers[0].answer = "different counterexample"; },
    (v) => { v.planInput.runtimeInputs[0].required = false; },
  ]) {
    const checkpoint = {};
    const calls = [];
    const call = async (mode) => { calls.push(mode); return structuredClone(stageResults[mode]); };
    await runBlueprintPlanning({ ...input, checkpoint, call });
    const changed = structuredClone(input);
    change(changed);
    await runBlueprintPlanning({ ...changed, checkpoint, call });
    assert.equal(calls.length, 6);
  }
});

test("parseable missing fields are never cached as a completed stage", async () => {
  const checkpoint = {};
  const calls = [];
  const call = async (mode) => { calls.push(mode); return mode === "blueprint-capabilities" ? { capabilityPlan: { summary: "partial" } } : stageResults[mode]; };
  await assert.rejects(runBlueprintPlanning({ ...input, checkpoint, call }), /结构不完整/);
  assert.ok(checkpoint.foundation);
  assert.equal(checkpoint.capabilities, undefined);
  assert.deepEqual(calls, ["blueprint-foundation", "blueprint-capabilities"]);
  for (const [mode, value] of Object.entries(stageResults)) assertBlueprintStage(mode, value);
  const broken = structuredClone(workflow);
  delete broken.workflowSteps[0].requires;
  assert.throws(() => assertBlueprintStage("blueprint-workflow", broken), /结构不完整/);
});

test("stage prompts keep evidence beyond former clipping limits and preserve shared DAG policy", () => {
  const blueprintFoundation = { sections: [{ content: "x".repeat(26000) + "TAIL_PERMISSION" }] };
  for (const mode of ["blueprint-capabilities", "blueprint-workflow"]) {
    const prompt = blueprintStagePrompt(mode, { ...input.planInput, blueprintFoundation, capabilityPlan: capabilities.capabilityPlan });
    assert.deepEqual(JSON.parse(prompt.user).blueprintFoundation, blueprintFoundation);
    assert.match(prompt.system, /\$confirmed is NOT initially available/);
    assert.match(prompt.system, /File saving requires the final content token/);
    assert.match(prompt.system, /Never add a stricter or more permissive rule/);
    if (mode === "blueprint-capabilities") assert.doesNotMatch(prompt.system, /workflowSteps\[\{/);
    else {
      assert.doesNotMatch(prompt.system, /Each item requires:/);
      assert.deepEqual(JSON.parse(prompt.user).capabilityPlan, { ...capabilities.capabilityPlan, items: capabilities.capabilityPlan.items.filter((item) => item.layer === "runtime" && item.kind !== "eval") });
    }
  }
  assert.match(BLUEPRINT_LEGACY_PROMPT, /capabilityPlan requires:/);
});
