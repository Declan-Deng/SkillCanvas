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
