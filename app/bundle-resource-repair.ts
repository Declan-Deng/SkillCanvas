import type { SkillIR } from "./skill-ir.ts";
import type { PipelineIssue } from "./skill-pipeline-core.ts";

const BINARY_REFERENCE = /^references\/[A-Za-z0-9._/-]+\.(?:pdf|docx?|xlsx?|pptx?|png|jpe?g|webp|mp3|mp4|zip)$/i;
export const hasRuntimeInputBinding = (value: string, id: string) =>
  (value.match(/input:[\p{L}\p{N}_.-]+/gu) || []).includes(`input:${id}`);
const normalizeName = (value: string) => value.toLowerCase()
  .replace(/\b(?:pdf|docx?|xlsx?|pptx?|file|document)\b/g, "")
  .replace(/用户提供的?|用户上传的?|用户的?|原始的?|现有的?|当前的?|本次的?|完整的?|上传的?|待处理的?/g, "")
  .replace(/(?:文本|内容|文件|文档)$/g, "")
  .replace(/[^a-z0-9\u4e00-\u9fff]/g, "");

/** Repair a packaging mistake only when an existing task input establishes
 * ownership. A missing handbook/template is NOT evidence of a runtime input.
 * Keep the owner and all dataflow outputs; change how it obtains its material. */
export function reconcileRuntimeInputResources(ir: SkillIR, files: Record<string, string>, bindings?: Record<string, string>): SkillIR {
  let next = ir;
  for (const capability of ir.capabilities) {
    const path = capability.implementation.path;
    if (bindings && !bindings[capability.id]) continue;
    if (capability.kind !== "reference" || capability.implementation.layer !== "runtime"
      || capability.necessity.decision === "exclude" || files[path]?.trim()
      || !BINARY_REFERENCE.test(path) || path.split("/").includes("..")) continue;
    const candidates = ir.inputs.filter((input) => {
      if (input.availableAtBuild || !["user", "runtime"].includes(input.source)) return false;
      if (bindings) return bindings[capability.id] === input.id;
      if (["reference-example", "current-request", "source-material"].includes(input.concept)) return false;
      if (hasRuntimeInputBinding(capability.input, input.id)) return true;
      const name = normalizeName(input.name);
      // Compare the material contract, not incidental mentions in requirements
      // or fallback prose, and never infer ownership from a filename alone.
      return name.length >= 2 && name === normalizeName(capability.input);
    });
    if (candidates.length !== 1) continue;
    const input = candidates[0];
    const token = `input:${input.id}`;
    const resolvedMaterial = `本次任务中已解析的 ${token}（${input.name}）`;
    const replacePath = (text: string) => text.split(path).join(resolvedMaterial);
    const fallback = `${input.missingBehavior}；宿主无法读取文件时，请用户提供可读取的版本或粘贴必要内容。不能假装已经读取。`;
    if (next === ir) next = structuredClone(ir);
    next.capabilities = next.capabilities.map((item) => item.id !== capability.id ? item : {
      ...item,
      kind: "builtin-tool",
      input: resolvedMaterial,
      requirement: replacePath(item.requirement),
      purpose: replacePath(item.purpose),
      output: replacePath(item.output),
      activationCondition: replacePath(item.activationCondition),
      routingCondition: replacePath(item.routingCondition),
      fallback,
      implementation: { path: "integrations/tool-contracts.json", layer: "runtime", status: "requires-setup" },
      connection: undefined,
      necessity: { ...item.necessity, externalDependency: true, realResourceAvailable: false,
        reason: "该资源由当前任务的输入契约提供，不是 Skill 内置文件；使用前必须验证宿主读取能力和真实输入。" },
    });
    next.runtimeContract.workflow = next.runtimeContract.workflow.map((step) => {
      if (!step.capabilityIds.includes(capability.id)) return step;
      return {
        ...step,
        input: replacePath(step.input), action: replacePath(step.action), output: replacePath(step.output),
        fallback,
        requires: step.role === "await-input" || step.role === "await-approval"
          ? step.requires : [...new Set([...step.requires, token])],
      };
    });
    next.tasks = next.tasks.map((task) => !task.capabilityIds.includes(capability.id) ? task : {
      ...task,
      requiredInputIds: input.required ? [...new Set([...task.requiredInputIds, input.id])] : task.requiredInputIds,
      optionalInputIds: !input.required ? [...new Set([...task.optionalInputIds, input.id])] : task.optionalInputIds,
    });
    next.dependencies = [...next.dependencies.filter((item) => item.capabilityId !== capability.id), {
      id: `dependency-${capability.id}`, capabilityId: capability.id, type: "host", availability: "requires-setup", fallback,
    }];
    next.resourcePlan.resources = next.resourcePlan.resources.map((item) => item.capabilityId !== capability.id ? item : {
      ...item, kind: "builtin-tool", path: "integrations/tool-contracts.json", reason: "读取本次任务输入，而非随包携带私人材料",
    });
    next.knowledgeRequirements = next.knowledgeRequirements.filter((item) => item.capabilityId !== capability.id);
    next.traceability = next.traceability.map((item) => item.capabilityId !== capability.id ? item : {
      ...item, implementationPath: "integrations/tool-contracts.json",
    });
  }
  return next;
}

export function missingBundleResources(ir: SkillIR, files: Record<string, string>) {
  return ir.capabilities.filter((item) => item.necessity.decision !== "exclude"
    && ["reference", "script", "asset"].includes(item.kind) && !files[item.implementation.path]?.trim())
    .map((item) => ({ capabilityId: item.id, kind: item.kind, path: item.implementation.path,
      input: item.input, purpose: item.purpose, implementation: item.implementation }));
}

/** Four validators may report one absent file. Keep one actionable root while
 * retaining unrelated contract defects; do not let duplicates inflate progress. */
export function deduplicateMissingResourceIssues(issues: PipelineIssue[], ir: SkillIR | null, files: Record<string, string>) {
  if (!ir) return issues;
  const missing = missingBundleResources(ir, files);
  if (!missing.length) return issues;
  const seen = new Set<string>();
  return issues.flatMap((issue) => {
    if (!/实现文件不存在|实现文件缺失|没有真实实现文件|missing.implementation|declared.without.implementation/i.test(`${issue.type} ${issue.evidence}`)) return [issue];
    const matches = missing.filter((item) => issue.files.includes(item.path) || issue.evidence.includes(item.path)
      || issue.capabilityId === item.capabilityId);
    if (!matches.length) {
      // This aggregate has no extra diagnosis beyond the individually named
      // absent files. Remove it only when its count exactly matches our audit.
      const count = issue.evidence.match(/(\d+) 项能力声明的具体实现文件不存在/);
      return count && Number(count[1]) === missing.length ? [] : [issue];
    }
    return matches.flatMap((item) => {
      if (seen.has(item.path)) return [];
      seen.add(item.path);
      return [{ ...issue, id: `missing-resource:${item.path}`, type: "MISSING_IMPLEMENTATION",
        capabilityId: item.capabilityId, files: [item.path],
        evidence: `能力 ${item.capabilityId} 的实现文件不存在：${item.path}` }];
    });
  });
}

export function contractRepairProgress(before: PipelineIssue[], after: PipelineIssue[]) {
  const key = (issue: PipelineIssue) => `${issue.type}:${issue.capabilityId || ""}:${[...issue.files].sort().join(",")}:${issue.evidence}`;
  const previous = new Set(before.map(key));
  const current = new Set(after.map(key));
  const resolved = [...previous].filter((value) => !current.has(value)).length;
  const introduced = [...current].filter((value) => !previous.has(value)).length;
  return { improved: resolved > 0 && introduced === 0, resolved, introduced,
    reason: resolved === 0 && introduced === 0
      ? `契约问题仍有 ${current.size} 项，未解决任何阻塞；保留修复前版本`
      : introduced > 0 ? `修复引入 ${introduced} 项新阻塞；保留修复前版本`
        : `已解决 ${resolved} 项契约问题，剩余 ${current.size} 项` };
}
