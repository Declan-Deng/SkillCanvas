import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { validateBundleStructure } from "../app/bundle-validator.ts";

const source = ts.createSourceFile("page.tsx", await readFile(new URL("../app/page.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function productionFunctions(names, deps = {}) {
  const functions = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) functions.push(node.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(functions.length, names.length);
  const code = ts.transpileModule(functions.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(deps), `${code}\nreturn {${names.join(",")}};`)(...Object.values(deps));
}
const privacy = productionFunctions(["sensitiveMatchCount", "redactSensitiveText", "sanitizeSkillFiles"]);

test("safe export does not mistake a public document ID or digest for personal identity", () => {
  const publicSource = "https://pdf.dfcfw.com/pdf/H3_AP202011191430880072_1.pdf";
  const identifiers = `${publicSource}\nsource_AP202011191430880072\nhash_13812345678_v1`;
  assert.equal(privacy.sensitiveMatchCount(identifiers), 0);
  assert.equal(privacy.redactSensitiveText(identifiers), identifiers);
});

test("safe export still hides standalone contact information, identity numbers and credentials", () => {
  const sensitive = "邮箱 test.person@example.com；手机号13812345678；证件号110101199001011234；key sk-this-is-a-synthetic-test-key";
  assert.equal(privacy.sensitiveMatchCount(sensitive), 4);
  const redacted = privacy.redactSensitiveText(sensitive);
  assert.ok(!redacted.includes("test.person@example.com") && !redacted.includes("13812345678") && !redacted.includes("110101199001011234") && !redacted.includes("sk-this-is-a-synthetic-test-key"));
  assert.ok(redacted.includes("[已隐藏：邮箱]") && redacted.includes("[已隐藏：手机号]") && redacted.includes("[已隐藏：证件号]") && redacted.includes("[已隐藏：密钥]"));
});

test("privacy transformation leaves numeric public citation IDs byte-for-byte stable in every projection", () => {
  const files = { "evals/skill-ir.json": '{"url":"https://pdf.dfcfw.com/pdf/H3_AP202011191430880072_1.pdf"}', "references/domain-playbook.md": "Source: https://pdf.dfcfw.com/pdf/H3_AP202011191430880072_1.pdf" };
  assert.deepEqual(privacy.sanitizeSkillFiles(files), files);
});

test("download checks the post-privacy bundle, not only the earlier UI audit", () => {
  let submitted = false;
  const messages = [];
  const files = { "SKILL.md": "incomplete bundle", "references/rules.md": "test.person@example.com" };
  const deps = {
    files, platforms: ["codex"], bundleAudit: { blockers: [] }, allowSensitiveExport: false, ...privacy,
    validateBundleStructure, friendlyReleaseBlocker: (value) => value,
    activeSkillName: "export-test", markComplete: () => {}, setToast: (value) => messages.push(value),
    document: { querySelector: () => ({}), body: { appendChild() {} }, createElement: () => ({ appendChild() {}, submit() { submitted = true; }, remove() {} }) },
  };
  productionFunctions(["downloadBundle"], deps).downloadBundle();
  assert.equal(submitted, false);
  assert.ok(messages.some((message) => message.includes("导出") && message.includes("检查")));
});

test("built download API refuses an inconsistent compiler bundle while preserving legacy standalone exports", async () => {
  const { default: worker } = await import("../dist/server/index.js");
  const call = (files) => {
    const form = new FormData();
    form.set("payload", JSON.stringify({ rootName: "export-test", files }));
    return worker.fetch(new Request("http://localhost/api/download", { method: "POST", body: form }), {}, { waitUntil() {}, passThroughOnException() {} });
  };
  const refused = await call({ "SKILL.md": "incomplete", "evals/skill-ir.json": "{" });
  assert.equal(refused.status, 422);
  assert.match(refused.headers.get("content-type"), /json/);
  const standalone = await call({ "SKILL.md": "# Legacy standalone skill" });
  assert.equal(standalone.status, 200);
  assert.equal(standalone.headers.get("content-type"), "application/zip");
});
