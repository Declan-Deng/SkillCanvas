import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CAPABILITY_ICONS, CAPABILITY_CATEGORY_ICONS, capabilityIconPath } from "../app/capability-icons.ts";

test("every selectable catalog capability has a distinct bundled Tabler icon", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const catalog = page.slice(page.indexOf("const CAPABILITY_LIBRARY:"), page.indexOf("const DEMO_SKILL"));
  const ids = [...catalog.matchAll(/id: "((?:host|mcp)-[^"]+)"/g)].map((match) => match[1]);
  ids.push("host-file-workspace", "host-web-search");
  assert.equal(ids.length, 13);
  assert.equal(new Set(ids.map((id) => CAPABILITY_ICONS[id])).size, 13);
  for (const id of ids) {
    assert.ok(CAPABILITY_ICONS[id], `missing icon: ${id}`);
    const svg = await readFile(new URL(`../public${capabilityIconPath(id, "builtin-tool")}`, import.meta.url), "utf8");
    assert.match(svg, /<svg[\s\S]*viewBox="0 0 24 24"/);
    assert.doesNotMatch(svg, /<script|<image|https?:\/\/(?!www.w3.org)/);
  }
  assert.match(capabilityIconPath("custom-mcp", "mcp"), /plug.svg$/);
  assert.equal(Object.keys(CAPABILITY_CATEGORY_ICONS).length, 4);
});

test("capability choices and section headings render icons, and blueprint controls use explicit labels", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<strong className="capability-library-title"><img src="\/icons\/tabler\/plug.svg"[^>]*\/>添加能力<\/strong>/);
  assert.doesNotMatch(page, /宿主 Tools 与外部 MCP 分开选择/);
  assert.match(page, /blueprintExpanded \? "收起蓝图" : "展开蓝图"/);
  assert.equal((page.match(/<img src=\{capabilityIconPath\(item.id, item.kind\)\}/g) || []).length, 2);
  assert.doesNotMatch(page, /<span className="capability-icon">\{CAPABILITY_KIND_META\[item.kind\].icon\}/);
  assert.match(page, /CAPABILITY_CATEGORY_ICONS\[category\]/);
});
