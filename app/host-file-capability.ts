// Shared by the page's capability catalog and full-chain regression harness.
// This describes a target Agent host ability, not a verified MCP connection.
export const HOST_FILE_WORKSPACE_CAPABILITY = {
  id: "host-file-workspace", kind: "builtin-tool" as const, name: "读取与编辑工作区文件", path: "integrations/tool-contracts.json", layer: "runtime" as const,
  requirement: "按任务读取、创建、修改和检查本地文件", purpose: "让 Skill 能处理真实项目、文档和目录，而不只在对话里给建议",
  reason: "适合需要基于现有文件继续工作或交付文件的任务", status: "use-provided" as const, input: "用户授权范围内的文件路径和任务要求",
  output: "可验证的文件内容或明确的文件变更", fallback: "请用户粘贴必要内容，或只给出不会冒充已写入文件的操作说明",
  routingCondition: "任务明确涉及已有文件、项目目录或文件交付时", deterministicAdvantage: "宿主直接读写文件比让模型猜测内容可靠",
  evaluationCriteria: ["只访问任务范围内文件", "修改结果可定位并可复核"], optional: true, enabled: false, recommended: false,
  category: "文件与内容", hosts: ["Codex", "Claude Code", "Cursor", "Gemini CLI"],
};
