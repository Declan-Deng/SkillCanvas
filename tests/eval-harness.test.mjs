import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function extractTemplate(source, functionName) {
  const match = source.match(new RegExp("function " + functionName + "\\(\\) \\{\\n  return `([\\s\\S]*?)`;\\n\\}"));
  assert.ok(match, `could not extract ${functionName}`);
  return match[1];
}

function python() {
  return process.env.PYTHON || "python3";
}

test("generated Eval Harness compiles, scores a passing run, and rejects a trigger regression", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const checker = extractTemplate(page, "createArtifactChecker");
  const runner = extractTemplate(page, "createEvalRunner");
  assert.match(checker, /runtime_text = "\\\\n"\.join/, "template source must escape the newline so the emitted Python contains a string literal");
  assert.match(checker, /manifest projection drifted from canonical SkillIR/);
  const syntax = [checker, runner].map((source, index) => spawnSync(python(), ["-c", `compile(${JSON.stringify(source)}, ${JSON.stringify(`generated-${index}.py`)}, "exec")`], { encoding: "utf8" }));
  syntax.forEach((result) => assert.equal(result.status, 0, result.stderr));

  const root = await mkdtemp(join(tmpdir(), "skillcanvas-eval-"));
  try {
    await mkdir(join(root, "evals"), { recursive: true });
    await writeFile(join(root, "SKILL.md"), "# Test Skill\n\n## Workflow\n\nWhen a representative request arrives, perform the core task and return the observable result.\n");
    await writeFile(join(root, "evals", "artifact_checker.py"), checker);
    await writeFile(join(root, "evals", "run_evals.py"), runner);
    await writeFile(join(root, "evals", "skill-ir.json"), JSON.stringify({ schemaVersion: "1.0", compiler: "skillcanvas" }));
    const emptyArtifactGrade = spawnSync(python(), ["-c", "import sys; sys.path.insert(0, 'evals'); from artifact_checker import check_case_artifacts; print(check_case_artifacts({'expected': {'artifacts': []}}, {'artifacts': []})[0])"], { cwd: root, encoding: "utf8" });
    assert.equal(emptyArtifactGrade.status, 0, emptyArtifactGrade.stderr);
    assert.equal(emptyArtifactGrade.stdout.trim(), "0.0");
    await writeFile(join(root, "evals", "capability-manifest.json"), JSON.stringify({
      capabilities: [
        { id: "core", kind: "llm", status: "generate", path: "SKILL.md", necessity: { decision: "include" } },
        { id: "eval", kind: "eval", status: "generate", path: "evals/", necessity: { decision: "include" } },
      ],
      coverage: [
        { requirement_id: "core", implementation: { kind: "llm", path: "SKILL.md" }, evaluation: { case_ids: ["case-1"], criteria: ["observable behavior"] } },
        { requirement_id: "eval", implementation: { kind: "eval", path: "evals/" }, evaluation: { case_ids: [], criteria: ["regression coverage"] } },
      ],
      state_model: { needed: false, scope: "none" },
      requirement_provenance: [{ id: "goal", requirement: "complete representative task", provenance: "user_explicit", modality: "MUST", hard: true, source: "test fixture" }],
      information_dependencies: [{ field: "result", source_required: "test input", source_available: true, inventable: false, missing_behavior: "preserve unknowns" }],
      control_model: { scopes: [{ scope: "task-retry", trigger: "observable check fails", action: "repair failed part", maxCycles: 2, stateDependency: "current output", stop: "passes or reaches limit" }] },
    }));

    const categories = ["trigger_explicit", "trigger_implicit", "trigger_context", "trigger_negative", "core_capability", "failure_mode"];
    const cases = Array.from({ length: 12 }, (_, index) => ({
      id: `case-${index + 1}`,
      category: categories[index % categories.length],
      should_trigger: categories[index % categories.length] !== "trigger_negative",
      prompt: `A complete representative test prompt number ${index + 1}`,
      capability_ids: categories[index % categories.length] === "trigger_negative" ? [] : ["core"],
      expected: { behaviors: ["observable behavior"], must_not: [], artifacts: [] },
      graders: ["trigger"],
    }));
    await writeFile(join(root, "evals", "evals.json"), JSON.stringify({ skill_name: "test-skill", evals: cases }));
    await writeFile(join(root, "evals", "graders.json"), JSON.stringify({ graders: [{ id: "trigger", type: "deterministic", weight: 1 }] }));
    await writeFile(join(root, "evals", "result.schema.json"), JSON.stringify({
      required: ["run_id", "skill_name", "created_at", "summary", "cases", "bundle_check"],
      properties: { cases: { items: { required: ["id", "passed", "score", "grader_scores", "evidence"] } } },
    }));

    const passingResponses = cases.map((item) => JSON.stringify({ id: item.id, triggered: item.should_trigger, output_text: "done", artifacts: [] })).join("\n");
    const passingPath = join(root, "responses-pass.jsonl");
    const passingReport = join(root, "evals", "passing-report.json");
    await writeFile(passingPath, passingResponses);
    const passing = spawnSync(python(), [join(root, "evals", "run_evals.py"), "--responses", passingPath, "--out", passingReport], { cwd: root, encoding: "utf8" });
    assert.equal(passing.status, 0, passing.stderr || passing.stdout);
    const report = JSON.parse(await readFile(passingReport, "utf8"));
    assert.equal(report.summary.passed, 12);
    assert.equal(report.summary.score, 1);
    assert.equal(report.bundle_check.passed, true);

    const failingResponses = cases.map((item, index) => JSON.stringify({ id: item.id, triggered: index === 0 ? !item.should_trigger : item.should_trigger, output_text: "done", artifacts: [] })).join("\n");
    const failingPath = join(root, "responses-fail.jsonl");
    await writeFile(failingPath, failingResponses);
    const failing = spawnSync(python(), [join(root, "evals", "run_evals.py"), "--responses", failingPath, "--out", join(root, "evals", "failing-report.json")], { cwd: root, encoding: "utf8" });
    assert.equal(failing.status, 1, failing.stderr || failing.stdout);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
