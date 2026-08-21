import { parser as pythonParser } from "@lezer/python";
import { validateBundleStructure, type BundleStaticIssue } from "../../bundle-validator";

type ValidationPayload = { files?: Record<string, unknown> };

function pythonSyntaxIssue(path: string, content: string): BundleStaticIssue | null {
  const tree = pythonParser.parse(content);
  const cursor = tree.cursor();
  do {
    if (cursor.type.isError) {
      const line = content.slice(0, cursor.from).split("\n").length;
      const excerpt = content.slice(cursor.from, Math.min(content.length, Math.max(cursor.to, cursor.from + 40))).replace(/[\r\n]+/g, " ");
      return { priority: "P0", code: "PYTHON_COMPILE_ERROR", path, message: `${path} 无法通过 Python 语法树解析：第 ${line} 行 ${excerpt || "附近存在语法错误"}` };
    }
  } while (cursor.next());
  return null;
}

function shellSyntaxIssue(path: string, content: string): BundleStaticIssue | null {
  let quote = "";
  let escaped = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (escaped) { escaped = false; continue; }
    if (char === "\\" && quote !== "'") { escaped = true; continue; }
    if (quote) { if (char === quote) quote = ""; continue; }
    if (char === "'" || char === '"') quote = char;
  }
  return quote ? { priority: "P0", code: "SHELL_SYNTAX_ERROR", path, message: `${path} 存在未闭合的 ${quote === "'" ? "单引号" : "双引号"}` } : null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as ValidationPayload;
    const entries = Object.entries(body.files || {});
    if (!entries.length || entries.length > 80) return Response.json({ error: "Invalid bundle" }, { status: 400 });
    const files = Object.fromEntries(entries.filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length <= 500_000));
    if (Object.keys(files).length !== entries.length || JSON.stringify(files).length > 1_500_000) return Response.json({ error: "Invalid bundle" }, { status: 400 });

    const structural = validateBundleStructure(files);
    const issues = [...structural.issues];
    Object.entries(files).filter(([path]) => path.endsWith(".py")).forEach(([path, content]) => {
      const issue = pythonSyntaxIssue(path, content);
      if (issue) issues.push(issue);
    });
    Object.entries(files).filter(([path]) => path.endsWith(".sh")).forEach(([path, content]) => {
      const issue = shellSyntaxIssue(path, content);
      if (issue) issues.push(issue);
    });
    const uniqueIssues = [...new Map(issues.map((issue) => [`${issue.code}:${issue.path}:${issue.message}`, issue])).values()];
    const syntaxPassed = !uniqueIssues.some((issue) => issue.code === "PYTHON_COMPILE_ERROR" || issue.code === "SHELL_SYNTAX_ERROR");
    return Response.json({
      valid: uniqueIssues.length === 0,
      issues: uniqueIssues,
      checks: [...structural.checks, { id: "syntax", label: "Python 与 shell 语法", passed: syntaxPassed }],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown validator error";
    console.error("bundle validation failed", error);
    return Response.json({ error: "Bundle validation failed", detail: detail.slice(0, 300) }, { status: 400 });
  }
}
