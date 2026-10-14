type Finding = { coverage?: string; issue?: string; evidence?: string };

const noDefect = /^(?:无实质缺陷|没有(?:明显|实质)?问题|未发现(?:明显|实质)?问题|完全符合|不构成缺陷|本轮未覆盖|本轮未测试|文件检查暂未发现)/;

export function hasObservedDemoMismatch(finding: Finding) {
  return finding.coverage !== "not-covered" && Boolean(finding.issue?.trim())
    && !noDefect.test(finding.issue!.trim());
}

function cleanOptions(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string")
    .map((item) => item.replace(/^[+✓\-•]\s*/, "").trim().slice(0, 32))
    .filter((item) => item.length >= 3 && !noDefect.test(item)
      && !/SKILL\.md|metadata|schema|harness|grader|MCP|元数据|数据最小化/i.test(item)
      && !/(?:没有|未)(?:看到|展示|覆盖|验证|测试).{0,12}(?:异常|缺失|确认|模板|分支|场景)|没有使用模板/i.test(item)))]
    .slice(0, 6) : [];
}

/** Missing review copy may fall back to observed issues, never to static file
 * reviews, untested branches, general preferences or the Demo's unknown facts. */
export function observedDemoFeedback(results: Finding[]) {
  return cleanOptions(results.filter(hasObservedDemoMismatch).map((item) => item.issue));
}

export function normalizeDemoFeedbackOptions(value: unknown, fallback: string[]) {
  // [] and one/two options are legitimate evidence, not a reason to pad a UI.
  return cleanOptions(Array.isArray(value) ? value : fallback);
}
