import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/client-log/route.ts", import.meta.url), "utf8");

test("Demo launch cannot become a silently disabled terminal button", () => {
  assert.doesNotMatch(page, /setEvalDetailsOpen/);
  const buttonLabelIndex = page.indexOf('busyTask === "evaluate" ? "正在生成 Demo…" : "生成第一版 Demo"');
  const firstDemoButton = buttonLabelIndex >= 0 ? page.slice(Math.max(0, buttonLabelIndex - 260), buttonLabelIndex + 120) : "";
  assert.match(firstDemoButton, /type="button"/);
  assert.match(firstDemoButton, /onClick=\{\(\) => void runEvaluation\(\)\}/);
  assert.doesNotMatch(firstDemoButton, /disabled=/);
  assert.match(page, /evaluationRunInFlight\.current \|\| busyTaskRef\.current === "evaluate"/);
  assert.match(page, /上一阶段仍在收尾；完成后即可生成 Demo/);
});

test("a production build type-checks before bundling so undeclared handlers cannot ship", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(pkg.scripts.build, /^pnpm run typecheck &&/);
});

test("evaluation success unlocks the final step and every launch outcome is observable", () => {
  assert.match(page, /markComplete\("evaluate"\);\s*reportClientEvaluationEvent\("evaluation_finished"/);
  for (const event of ["evaluation_started", "evaluation_blocked", "evaluation_finished", "evaluation_failed"]) {
    assert.match(page, new RegExp(`reportClientEvaluationEvent\\(\\"${event}\\"`));
    assert.match(route, new RegExp(`\\"${event}\\"`));
  }
});

test("the public progress panel does not expose raw model JSON", () => {
  assert.doesNotMatch(page, /aria-label=\{busyOutputText \? "模型本轮输出"/);
  assert.doesNotMatch(page, /<pre>\{busyOutputText\}<\/pre>/);
  assert.match(page, /className="ai-output-summary"/);
});
