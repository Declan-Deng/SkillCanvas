import assert from "node:assert/strict";
import test from "node:test";

import { generationTemperature } from "../app/generation-temperature.ts";

test("compiler and evaluator stages use deterministic sampling", () => {
  for (const mode of ["blueprint-foundation", "blueprint-capabilities", "blueprint-workflow", "workflow-repair", "eval-grade", "eval-compare", "evaluate"]) {
    assert.equal(generationTemperature(mode, 1), 0, mode);
    assert.equal(generationTemperature(mode, 2), 0, `${mode} retry`);
  }
});

test("content generation stays low-temperature and retries more deterministically", () => {
  for (const mode of ["knowledge-compile", "build", "eval-execute", "personalize", "optimize"]) {
    assert.equal(generationTemperature(mode, 1), 0.15, mode);
    assert.equal(generationTemperature(mode, 2), 0.05, `${mode} retry`);
  }
});

test("user-facing conversation keeps restrained variation and cools on retry", () => {
  for (const mode of ["preview", "interview", "demo", "demo-chat", "demo-inspiration"]) {
    assert.equal(generationTemperature(mode, 1), 0.35, mode);
    assert.equal(generationTemperature(mode, 2), 0.15, `${mode} retry`);
  }
});
