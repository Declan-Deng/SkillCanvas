import assert from "node:assert/strict";
import test from "node:test";
import { goalNeedsTaskDiscovery } from "../app/interview-discovery.ts";

test("generic assistant goals stay unconfirmed until a concrete task is chosen", () => {
  for (const goal of ["帮我做一个更好的工作助手", "想提高工作效率", "Build me a better assistant"]) {
    assert.equal(goalNeedsTaskDiscovery(goal), true, goal);
  }
});

test("concrete domains, inputs, actions, and deliverables can receive a recommendation", () => {
  for (const goal of ["把零散记录整理成周报", "审查 SaaS 合同", "排下周计划", "Analyze invoices", "翻译英文文章"]) {
    assert.equal(goalNeedsTaskDiscovery(goal), false, goal);
  }
});
