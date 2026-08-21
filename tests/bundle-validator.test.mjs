import assert from "node:assert/strict";
import test from "node:test";

import { validateBundleContentCoherence, validateBundleStructure } from "../app/bundle-validator.ts";

function baseBundle() {
  return {
    "SKILL.md": `---\nname: example-skill\ndescription: "Use when the user needs an example task completed with a concrete workflow."\n---\n\n# Example\n`,
    "agents/openai.yaml": `interface:\n  display_name: "Example"\n  short_description: "Example Skill"\n  default_prompt: "Use $example-skill."`,
    "evals/capability-manifest.json": JSON.stringify({ capabilities: [{ id: "core" }], coverage: [{ requirement_id: "core" }] }),
    "evals/evals.json": JSON.stringify({ evals: [{ id: "case-1" }] }),
    "evals/graders.json": JSON.stringify({ graders: [] }),
    "evals/result.schema.json": JSON.stringify({ type: "object" }),
    "evals/run_evals.py": `# skillcanvas-owned-eval-runner:v1\nimport argparse\ndef main():\n    argparse.ArgumentParser().parse_args()\nif __name__ == "__main__":\n    main()\n`,
    "evals/artifact_checker.py": "# skillcanvas-owned-artifact-checker:v1\ndef inspect_bundle(root):\n    return {}\n",
  };
}

test("P0 bundle validator checks frontmatter, JSON, references, duplicates, and runner contract", () => {
  const files = baseBundle();
  files["SKILL.md"] += "Read references/missing.md when needed.\n";
  files["evals/capability-manifest.json"] = JSON.stringify({ capabilities: [{ id: "core" }, { id: "core" }] });
  files["evals/evals.json"] = "{broken";
  files["evals/run_evals.py"] = "print('no entrypoint')";
  const result = validateBundleStructure(files);
  assert.equal(result.valid, false);
  assert.ok(result.issues.every((issue) => issue.priority === "P0"));
  assert.ok(result.issues.some((issue) => issue.code === "INVALID_JSON"));
  assert.ok(result.issues.some((issue) => issue.code === "DUPLICATE_MANIFEST_ENTRY"));
  assert.ok(result.issues.some((issue) => issue.code === "MISSING_REFERENCED_FILE"));
  assert.ok(result.issues.some((issue) => issue.code === "EVAL_RUNNER_START_CONTRACT"));
});

test("structurally valid bundle clears the deterministic P0 gate", () => {
  const result = validateBundleStructure(baseBundle());
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
});

test("P0 gate rejects an empty required Skill section", () => {
  const files = baseBundle();
  files["SKILL.md"] += "\n## Goal\n\n## Workflow\n\n1. Complete the task.\n";
  const result = validateBundleStructure(files);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "EMPTY_REQUIRED_SECTION"));
});

test("P0 content gate catches deterministic semantic defects without a model", () => {
  const files = baseBundle();
  files["SKILL.md"] += `
## Workflow

- 信息不足时必须先询问用户确认，同时无需确认直接自主补全并继续。
- 输出结论并说明依据。
- 输出结论并说明依据。
`;
  files["agents/openai.yaml"] = `interface:\n  display_name: "Example"\n  short_description: "Example Skill"\n  default_prompt: "Use $example-skill；"`;
  files["evals/evals.json"] = JSON.stringify({ evals: [{ id: "case-1", prompt: "请完成一个相邻任务" }] });
  files["evals/skill-ir.json"] = JSON.stringify({ inputs: [
    { id: "resume-a", concept: "简历", name: "现有简历完整文本" },
    { id: "resume-b", concept: "简历文件", name: "简历文件" },
    { id: "generic", concept: "相关资料", name: "相关资料" },
  ] });

  const codes = new Set(validateBundleContentCoherence(files).map((issue) => issue.code));
  assert.equal(codes.has("CONTRADICTORY_ACTION_PERMISSION"), true);
  assert.equal(codes.has("ADJACENT_DUPLICATE_SENTENCE"), true);
  assert.equal(codes.has("INCOMPLETE_PROMPT"), true);
  assert.equal(codes.has("TEMPLATE_PROMPT_TEXT"), true);
  assert.equal(codes.has("BOILERPLATE_INPUT_OVERLAP"), true);
});

test("P0 content gate allows explicitly scoped autonomy", () => {
  const files = baseBundle();
  files["SKILL.md"] += "\n## Workflow\n\n低风险、可逆步骤可以自主推进；关键决策必须先询问用户确认。\n";
  const issues = validateBundleContentCoherence(files);
  assert.equal(issues.some((issue) => issue.code === "CONTRADICTORY_ACTION_PERMISSION"), false);
});
