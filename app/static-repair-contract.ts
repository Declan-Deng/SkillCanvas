import { isAuthoredReferencePath, validateImplementationFiles } from "./canonical-mutations.ts";
import type { SkillIR } from "./skill-ir.ts";
import type { BundleStaticIssue } from "./bundle-validator.ts";

export type StaticRepairPayload = {
  updatedFiles?: Record<string, unknown>;
  implementationFiles?: Record<string, unknown>;
  canonicalMutations?: unknown;
};

const safePath = (path: string) => path === "SKILL.md"
  || /^(?:agents|references|evals|scripts|assets|integrations)\/[A-Za-z0-9._/-]+$/.test(path)
    && !path.includes("..") && !path.includes("//");

function fileMap(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("STATIC_REPAIR_INVALID: 文件内容必须是路径到完整文本的映射");
  return value as Record<string, unknown>;
}

/** Both repair routes use implementationFiles for authored bytes. Static repair
 * may also fix existing loader/schema artifacts, but must not change semantics
 * or create unowned references as a way to bypass a missing-file check. */
export function staticRepairReplacements(payload: StaticRepairPayload, currentFiles: Record<string, string>, ir: SkillIR | null, issues: BundleStaticIssue[]): Record<string, string> {
  if (Array.isArray(payload.canonicalMutations) && payload.canonicalMutations.length) {
    throw new Error("STATIC_REPAIR_INVALID: P0 修复不能修改业务契约；语义变更须走 P1 修复");
  }
  const authored = fileMap(payload.implementationFiles);
  const replacements = validateImplementationFiles(ir, authored);
  const legacy = fileMap(payload.updatedFiles);
  for (const [path, content] of Object.entries(legacy)) {
    if (!safePath(path) || typeof content !== "string" || !content.trim()) throw new Error(`STATIC_REPAIR_INVALID: 无效的文件路径或内容 ${path}`);
    if (path.startsWith("references/") && !isAuthoredReferencePath(path) && !Object.hasOwn(currentFiles, path)) {
      throw new Error(`STATIC_REPAIR_INVALID: ${path} 不能被伪造为缺失文档`);
    }
    if (isAuthoredReferencePath(path)) {
      if (!ir) throw new Error(`REFERENCE_OWNER_MISSING: ${path} 无法核对参考能力归属`);
      validateImplementationFiles(ir, { [path]: content });
    } else if (!Object.hasOwn(currentFiles, path) && !issues.some((issue) => issue.path === path)
      && !/^(?:scripts|assets)\//.test(path)) {
      throw new Error(`STATIC_REPAIR_INVALID: ${path} 不是当前文件或已报告的缺失文件`);
    }
    if (Object.hasOwn(replacements, path) && replacements[path] !== content) throw new Error(`STATIC_REPAIR_CONFLICT: ${path} 在两个文件字段中内容不同`);
    replacements[path] = content;
  }
  for (const path of Object.keys(replacements)) {
    if (!safePath(path)) throw new Error(`STATIC_REPAIR_INVALID: ${path}`);
    if (isAuthoredReferencePath(path) && !ir?.capabilities.some((item) => item.kind === "reference"
      && item.necessity.decision !== "exclude" && item.implementation.status !== "not-needed" && item.implementation.path === path)) {
      throw new Error(`REFERENCE_OWNER_MISSING: ${path} 没有已启用的参考能力`);
    }
  }
  return replacements;
}

export function staticBlockerSignature(issues: Pick<BundleStaticIssue, "priority" | "code" | "path" | "message">[]) {
  return JSON.stringify(issues.filter((issue) => issue.priority === "P0")
    .map((issue) => [issue.code, issue.path || "bundle", issue.message]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}

export function changedBundlePaths(before: Record<string, string>, after: Record<string, string>) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((path) => before[path] !== after[path]);
}
