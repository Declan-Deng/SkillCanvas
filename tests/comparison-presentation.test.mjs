import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { comparisonBenefits, normalizeAnonymousComparisonDisplay, revealComparisonDisplay } from "../app/comparison-presentation.ts";
import { normalizeBlindComparison } from "../app/real-eval-harness.ts";

const source = readFileSync(new URL("../app/comparison-benefits.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS } }).outputText;
const { ComparisonBenefits } = new Function("exports", "React", `${compiled}\nreturn exports;`)({}, React);
const display = { title: "先确认框架，再补完整行程", A: "直接给出完整行程，没有等你确认框架。", B: "先给每日框架，等你确认后再补交通和备选。" };
const row = { caseId: "case-1", title: "帮我规划三天旅行", explanation: "这次对照满足更多已确认的要求。", baselineScore: 70, skillScore: 85, delta: 15, skillPassed: true, failureReason: "", dimensionGaps: [], verdict: "candidate", blindVerdict: "candidate", baselineOutput: "完整行程", skillOutput: "待确认框架", comparisonDisplay: revealComparisonDisplay(display, { A: "left", B: "right" }) };
const current = { current: true, pending: false };

test("highlight only current, completed, evidenced head-to-head wins", () => {
  assert.equal(comparisonBenefits([row], current).length, 1);
  for (const overrides of [{ verdict: "baseline", blindVerdict: "baseline" }, { verdict: "tie", blindVerdict: "tie" }, { blindVerdict: undefined }, { baselineOutput: "" }, { skillOutput: "" }]) {
    assert.deepEqual(comparisonBenefits([{ ...row, ...overrides }], current), []);
  }
  assert.deepEqual(comparisonBenefits([row], { ...current, pending: true }), []);
  assert.deepEqual(comparisonBenefits([row], { ...current, current: false }), []);
});

test("reveal A/B from the actual random assignment, never from a fixed label", () => {
  assert.deepEqual(revealComparisonDisplay(display, { A: "left", B: "right" }), { title: display.title, baseline: display.A, skill: display.B });
  assert.deepEqual(revealComparisonDisplay(display, { A: "right", B: "left" }), { title: display.title, baseline: display.B, skill: display.A });
  assert.equal(revealComparisonDisplay(display, { A: "left", B: "left" }), undefined);
});

test("hide unreadable old receipts rather than inventing or automatically translating advantages", () => {
  assert.deepEqual(comparisonBenefits([{ ...row, comparisonDisplay: undefined, explanation: "A provides a complete report; B is better." }], current), []);
  assert.deepEqual(comparisonBenefits([{ ...row, comparisonDisplay: undefined, explanation: "B 符合更多要求，而 A 没有做到。" }], current), []);
  assert.equal(comparisonBenefits([{ ...row, comparisonDisplay: undefined }], current)[0].detail, row.explanation);
  assert.equal(normalizeAnonymousComparisonDisplay({ ...display, title: "帮我做[天数]天行程" }), undefined);
  assert.equal(normalizeAnonymousComparisonDisplay({ ...display, B: display.A }), undefined);
});

test("deduplicate repeat receipts and display concrete Chinese behavior, not trigger text", () => {
  const benefits = comparisonBenefits([row, { ...row, caseId: "repeat-2" }], current);
  assert.equal(benefits.length, 1);
  const html = renderToStaticMarkup(React.createElement(ComparisonBenefits, { benefits }));
  assert.match(html, /先确认框架，再补完整行程/);
  assert.match(html, /普通 AI/);
  assert.match(html, /你的 Skill/);
  assert.match(html, /查看测试场景/);
  assert.match(html, /不代表所有任务都有提升/);
  assert.doesNotMatch(html, /同题匿名 A\/B|待加强|尚未证明有提升/);
  assert.equal(renderToStaticMarkup(React.createElement(ComparisonBenefits, { benefits: [] })), "");
});

test("invalid or absent display copy never changes the comparator verdict or blocks old JSON", () => {
  const ids = ["accuracy", "completeness", "evidence", "format"];
  const scores = Object.fromEntries(ids.map(id => [id, 3]));
  const evidence = Object.fromEntries(ids.map(id => [id, "case-1 有明确可观察的回答依据"]));
  const raw = { winner: "tie", confidence: 0.8, evidence: "两边表现接近。", rubric: { criteria: ids.map(id => ({ id, label: id, kind: "content" })), A: { criterionScores: scores, criterionEvidence: evidence }, B: { criterionScores: scores, criterionEvidence: evidence } }, caseResults: [{ caseId: "case-1", winner: "tie", evidence: "两边均保留事实边界。" }] };
  const original = normalizeBlindComparison(raw, ["case-1"]);
  assert.ok(original);
  for (const copy of [undefined, { title: "English only", A: "same", B: "same" }, display]) {
    const next = normalizeBlindComparison({ ...raw, caseResults: [{ ...raw.caseResults[0], display: copy }] }, ["case-1"]);
    assert.ok(next);
    assert.equal(next.winner, original.winner);
    assert.deepEqual(next.qualityScores, original.qualityScores);
    assert.equal(next.caseResults[0].winner, original.caseResults[0].winner);
  }
});

test("complete results remain accessible and collapsed, without extra model calls", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const prompt = readFileSync(new URL("../app/api/ai/route.ts", import.meta.url), "utf8");
  assert.match(page, /<ComparisonBenefits benefits=\{benefits\} \/>/);
  assert.match(page, /<details className="eval-report-panel eval-full-results" aria-label="完整测试结果">/);
  assert.doesNotMatch(page, /尚未证明有提升|const visibleComparisonRows/);
  assert.match(prompt, /Write all explanatory text in clear Chinese/);
  assert.match(prompt, /Display is for readability only and must not change scores or the winner/);
  assert.match(prompt, /Never sacrifice grading completeness for display copy/);
});
