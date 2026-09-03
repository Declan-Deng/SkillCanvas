import type { WorkflowDagStep } from "./workflow-dag.ts";

// The UI and routing regression use the same catalog entry, so wording
// changes cannot silently disconnect the actual selectable capability.
export const HOST_WEB_SEARCH_CAPABILITY = {
  id: "host-web-search", kind: "builtin-tool" as const, name: "联网搜索与来源核验", path: "integrations/tool-contracts.json", layer: "runtime" as const,
  requirement: "查询可能变化的最新信息并核对来源", purpose: "让依赖时效性的结果使用真实网页证据",
  reason: "适合新闻、价格、产品、政策、竞品和最新资料", status: "use-provided" as const, input: "明确搜索问题、时间范围和优先来源",
  output: "带链接、日期和关键证据的结论", fallback: "说明知识时点并请用户提供链接，不把旧知识写成最新事实",
  routingCondition: "答案可能随时间变化，或用户明确要求搜索、核实和引用时", deterministicAdvantage: "真实检索结果可以核对日期和出处",
  evaluationCriteria: ["关键时效事实有来源", "区分来源事实与模型推断"], optional: true, enabled: false, recommended: false,
  category: "联网与界面" as const, hosts: ["Codex", "Claude（需 Web Search 或 MCP）", "通用 Agent"],
};

type HostCapability = { id: string; kind: string; name?: string; path?: string };

/** Infer host adapters from observable task I/O, never from a domain-specific
 * Skill name. The result is a recommendation: the target Agent still checks
 * availability at runtime and follows the declared fallback when absent. */
export function recommendedHostCapabilityIds(taskEvidence: string) {
  const text = taskEvidence.normalize("NFKC");
  const ids = new Set<string>();
  const documentInput = /(?:根据|读取|解析|检查|分析|修改|编辑|定制|上传|提供).{0,32}(?:PDF|DOCX?|Word|Markdown|MD\b|简历|履历|CV\b|JD\b|职位描述|岗位描述|文档|合同|报告|研究资料|附件)|(?:PDF|DOCX?|Word|Markdown|简历|履历|CV\b|JD\b|职位描述|岗位描述|文档|合同|报告|研究资料|附件).{0,32}(?:输入|上传|提供|读取|解析|检查|分析|修改|编辑|定制)/i.test(text);
  const structuredInput = /CSV|Excel|XLSX?|电子表格|数据表|数据集|多行数据|批量记录/i.test(text);
  const visualInput = /(?:读取|理解|检查|分析|参考|提供|上传).{0,24}(?:图片|截图|图表|照片|视觉稿|界面图)|(?:图片|截图|图表|照片|视觉稿).{0,24}(?:输入|上传|理解|分析)/i.test(text);
  const codeExecution = /(?:运行|执行|测试|调试|构建|编译|批处理).{0,24}(?:代码|脚本|命令|程序|测试)|(?:代码|脚本|命令|程序).{0,24}(?:运行|执行|测试|调试|构建|编译)/i.test(text);
  const repositoryWork = /GitHub|GitLab|代码库|仓库|分支|commit|pull request|\bPR\b|diff|提交历史/i.test(text);
  const liveWebEvidence = /(?:联网|搜索|检索|查找|核验|引用).{0,24}(?:网页|来源|最新|价格|政策|竞品)|(?:最新|实时|当前|今日|竞品|市场价格).{0,24}(?:信息|数据|资料|分析|变化)/i.test(text);
  const browserInteraction = /(?:打开|登录|点击|填写|提交|操作|验证).{0,24}(?:网页|网站|浏览器|页面|表单|界面)|(?:网页|网站|浏览器|页面|表单|界面).{0,24}(?:操作|交互|测试|验证)/i.test(text);
  const visualOutput = /(?:生成|制作|编辑|修改|输出|交付).{0,24}(?:图片|海报|插图|配图|视觉素材|概念图)/i.test(text);

  if (documentInput) ids.add("host-document-reading");
  if (structuredInput) ids.add("host-spreadsheet-analysis");
  if (visualInput) ids.add("host-image-understanding");
  if (codeExecution) ids.add("host-shell-code");
  if (repositoryWork) ids.add("host-git-workflow");
  if (liveWebEvidence) ids.add("host-web-search");
  if (browserInteraction) ids.add("host-browser-computer");
  if (visualOutput) ids.add("host-image-generation");
  return [...ids];
}

/** Catalog identity, not domain heuristics. A planner's builtin-X spelling
 * and the catalog's host-X describe the same host adapter. MCP connections
 * are never interchangeable with a host adapter or with another server. */
export function reconcileHostCapabilityAliases<T extends HostCapability>(
  items: T[], workflowSteps: WorkflowDagStep[], catalog: HostCapability[],
) {
  const aliases = new Map<string, string>();
  for (const item of items) {
    if (item.kind !== "builtin-tool") continue;
    const match = catalog.find((entry) => entry.kind === "builtin-tool"
      && entry.id.startsWith("host-") && item.id === entry.id.replace(/^host-/, "builtin-")
      && (!item.path || !entry.path || item.path === entry.path));
    if (match) aliases.set(item.id, match.id);
  }
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const id = aliases.get(item.id) || item.id;
    groups.set(id, [...(groups.get(id) || []), item]);
  }
  return {
    // Exact catalog entry wins, including an explicit disabled selection.
    // Keep distinct task actions on their original workflow nodes.
    items: [...groups].map(([id, entries]) => ({ ...(entries.find((item) => item.id === id) || entries[0]), id })),
    workflowSteps: workflowSteps.map((step) => ({ ...step,
      capabilityIds: [...new Set(step.capabilityIds.map((id) => aliases.get(id) || id))],
      ...(step.availableCapabilityIds ? { availableCapabilityIds: [...new Set(step.availableCapabilityIds.map((id) => aliases.get(id) || id))] } : {}),
    })),
  };
}
