import { projectSkillIRFiles, type SkillIR } from "./skill-ir.ts";
import type { PipelineIssue } from "./skill-pipeline-core.ts";

type ContractIssue = Pick<PipelineIssue, "type" | "evidence">;

export function isSkillIRProjectionIssue(issue: ContractIssue) {
  return /\[(?:SKILL|MANIFEST|EVAL|TOOL_CONTRACT|STATE|LOOP|OUTPUT|AGENT_METADATA|DOMAIN_PLAYBOOK)_PROJECTION_DRIFT\]/.test(issue.evidence)
    || issue.evidence.includes("Capability Manifest 与 Canonical SkillIR 已漂移，需要重新编译");
}

/** Repair stale projections, NOT the architecture. Do not restore via the
 * semantic migration parser or regenerate eval cases here: even with mixed
 * blockers the exact persisted contract, sources and task fixtures must stay.
 * The caller must run the full gates again before accepting this candidate. */
export function rebuildSkillIRProjections(files: Record<string, string>) {
  const serialized = files["evals/skill-ir.json"];
  const ir = JSON.parse(serialized || "") as SkillIR;
  if (ir?.schemaVersion !== "1.0" || ir.compiler !== "skillcanvas") {
    throw new Error("无法重建派生文件：缺少受支持的 Canonical SkillIR，不能猜测或重写任务契约");
  }
  const candidate = projectSkillIRFiles(ir, files);
  candidate["evals/skill-ir.json"] = serialized;
  const changedPaths = [...new Set([...Object.keys(files), ...Object.keys(candidate)])]
    .filter((path) => files[path] !== candidate[path]);
  return { files: changedPaths.length ? candidate : files, changedPaths };
}

export function contractRepairFailureReason(issues: ContractIssue[], rounds: number, rejectedAttempts: string[] = []) {
  const unresolved = issues[0]?.evidence || "文件契约检查未通过";
  const failure = rejectedAttempts.at(-1);
  const stage = issues.some(isSkillIRProjectionIssue)
    ? "生成文件与已确认蓝图不一致，程序重建未通过"
    : `文件契约修复 ${rounds} 轮后仍有阻塞`;
  return `${stage}：${unresolved.slice(0, 240)}${failure ? `；最近修复未通过：${failure.slice(0, 240)}` : ""}。已保留当前文件，评测尚未启动。`;
}
