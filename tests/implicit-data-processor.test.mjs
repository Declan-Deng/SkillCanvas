import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { needsImplicitCsvProcessor } from "../app/implicit-data-processor.ts";

for (const task of [
  ["我要做一个代码审查助手", "粘贴 diff", "输出表格，按严重程度排序，检查安全与边界"],
  ["我要做一个会议纪要助手", "粘贴聊天记录", "输出待办表格，自查负责人和时间"],
  ["每周汇报助手", "零散工作记录", "归类汇总，输出表格，验证完整性"],
  ["整理表格", "Excel 文件", "计算销售额"],
  ["CSV 内容审查", "CSV 文本", "按风险严重程度排序"],
  ["整理记录，不需要 CSV", "粘贴文字", "计算金额"],
  ["把统计结果导出 CSV", "粘贴文字记录", "计算金额并输出 CSV"],
]) test(`does not invent a CSV processor from presentation or semantic work: ${task[0]}`, () => {
  assert.equal(needsImplicitCsvProcessor(task[1], task[2]), false);
});

for (const operation of ["计算每列金额并求和", "按日期列排序", "对重复行去重", "求平均值和百分比"]) {
  test(`actual CSV inputs with explicit deterministic work remain supported: ${operation}`, () => {
    assert.equal(needsImplicitCsvProcessor("上传 CSV 文件", operation), true);
  });
}

test("implicit inference does not remove or demote already selected scripts", () => {
  const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /needsImplicitCsvProcessor\(answers\.inputs \|\| "", taskEvidence\)/);
  assert.match(source, /implicitCsvProcessor && !items\.some\(\(item\) => item\.kind === "script" && capabilityIsActive\(item\)\)/);
  assert.doesNotMatch(source, /const structuredInput = .*表格/);
});
