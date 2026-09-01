// Presentation-only mapping; icon metadata never enters the generated capability contract.
export const CAPABILITY_ICONS: Record<string, string> = {
  "host-file-workspace": "file-pencil",
  "host-document-reading": "file-type-pdf",
  "host-image-understanding": "photo",
  "host-spreadsheet-analysis": "table",
  "host-shell-code": "terminal-2",
  "host-git-workflow": "git-branch",
  "host-parallel-agents": "hierarchy-2",
  "host-web-search": "world-search",
  "host-browser-computer": "browser",
  "host-image-generation": "photo-plus",
  "mcp-github": "brand-github",
  "mcp-knowledge-workspace": "cloud",
  "mcp-communication": "messages",
};

export const CAPABILITY_CATEGORY_ICONS: Record<string, string> = {
  "文件与内容": "file-pencil",
  "代码与自动化": "terminal-2",
  "联网与界面": "browser",
  "外部服务 MCP": "plug",
};

export function capabilityIconPath(id: string, kind: string) {
  const fallback = kind === "mcp" ? "plug" : kind === "script" || kind === "eval" ? "terminal-2" : "file-pencil";
  return `/icons/tabler/${CAPABILITY_ICONS[id] || fallback}.svg`;
}
