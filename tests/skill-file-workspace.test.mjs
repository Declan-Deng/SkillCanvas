import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const source = await readFile(new URL("../app/skill-file-workspace.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const { SkillFileWorkspace } = new Function("exports", "React", `${compiled}\nreturn exports;`)({}, React);
const files = { "SKILL.md": "# User workflow", "evals/skill-ir.json": '{"schemaVersion":"1.0"}' };
const explanation = { kind: "Canonical SkillIR", summary: "任务模型", contents: ["需求与能力"], usedWhen: "编译时", affects: "运行契约", validation: "核对投影", related: ["SKILL.md"] };
const defaults = { files, skillName: "plan-study", selectedFile: "evals/skill-ir.json", explanation, sourceCount: 0, dimensionCount: 16, blockerCount: 0, onSelectFile: () => {} };

function find(tree, type) {
  if (!tree || typeof tree !== "object") return null;
  if (tree.type === type) return tree;
  for (const child of React.Children.toArray(tree.props?.children)) {
    const found = find(child, type);
    if (found) return found;
  }
  return null;
}

test("build and release use one workspace with the same three columns and file explanations", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.equal((page.match(/<SkillFileWorkspace\b/g) || []).length, 2);
  assert.doesNotMatch(page, /className="release-(?:preview-body|file-list|file-content)"/);
  for (const props of [{ ...defaults, onContentChange: () => {} }, { ...defaults, readOnly: true }]) {
    const html = renderToStaticMarkup(React.createElement(SkillFileWorkspace, props));
    assert.match(html, /class="file-tree"/);
    assert.match(html, /class="code-pane"/);
    assert.match(html, /class="inspector-pane"/);
    assert.match(html, /文件解释/);
    assert.match(html, /Canonical SkillIR/);
    assert.match(html, /任务模型/);
    assert.match(html, /2 个文件/);
  }
});

test("release is read-only and never installs the content-editing callback", () => {
  const tree = SkillFileWorkspace({ ...defaults, readOnly: true });
  const editor = find(tree, "textarea");
  assert.equal(editor.props.readOnly, true);
  assert.equal(editor.props.onChange, undefined);
  assert.equal(editor.props["aria-label"], "查看 evals/skill-ir.json");
  assert.equal(editor.props.value, files[defaults.selectedFile]);
});

test("generation editing still forwards the exact content to the existing parent handler", () => {
  let edited;
  const tree = SkillFileWorkspace({ ...defaults, onContentChange: (value) => { edited = value; } });
  const editor = find(tree, "textarea");
  assert.equal(editor.props.readOnly, false);
  editor.props.onChange({ target: { value: "changed" } });
  assert.equal(edited, "changed");
  assert.equal(files["evals/skill-ir.json"], '{"schemaVersion":"1.0"}');
});

test("file selection remains available in release without modifying the bundle", () => {
  let selected;
  const tree = SkillFileWorkspace({ ...defaults, readOnly: true, onSelectFile: (value) => { selected = value; } });
  const button = find(tree, "button");
  assert.equal(button.props.title, "SKILL.md");
  button.props.onClick();
  assert.equal(selected, "SKILL.md");
  assert.equal(files["SKILL.md"], "# User workflow");
});
