import type { SkillEvalCase } from "./optimizer-core";
import type { HarnessExecution } from "./real-eval-harness";

export type LocalSandboxVerification = {
  error?: string;
  runtime?: string;
  network?: string;
  toolAdapter?: string;
  artifactChecks?: Array<{ caseId: string; written: Array<{ path: string }>; missing: string[] }>;
  scriptTests?: { status?: string; passed?: boolean; detail?: string };
};

function scriptCapabilityIds(skillFiles: Record<string, string> | undefined) {
  try {
    const manifest = JSON.parse(skillFiles?.["evals/capability-manifest.json"] || "{}") as {
      capabilities?: Array<{ id?: string; kind?: string }>;
    };
    return new Set((manifest.capabilities || [])
      .filter((item) => item.kind === "script" && typeof item.id === "string")
      .map((item) => item.id as string));
  } catch {
    return new Set<string>();
  }
}

async function callLocalSandbox(input: {
  cases: SkillEvalCase[];
  skillFiles?: Record<string, string>;
  executions: HarnessExecution[];
  endpoint?: string;
  fetcher?: typeof fetch;
}) {
  const fetcher = input.fetcher || fetch;
  const response = await fetcher(input.endpoint || "http://127.0.0.1:4318/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skillFiles: input.skillFiles || {}, executions: input.executions, cases: input.cases }),
  });
  const result = await response.json() as LocalSandboxVerification;
  if (!response.ok) throw new Error(result.error || "本地文件系统沙箱没有完成验证");
  return result;
}

/** Run generated script tests before freezing the Build Loop. This is kept
 * separate from model-based held-out tasks: deterministic code should be
 * accepted or rejected by a real process result, not by an LLM simulation. */
export async function verifyBundleScriptTests(input: {
  skillFiles: Record<string, string>;
  endpoint?: string;
  fetcher?: typeof fetch;
}) {
  const hasTests = Object.keys(input.skillFiles).some((path) => path.startsWith("evals/script-tests/") && path.endsWith(".py"));
  if (!hasTests) return { status: "not_required", passed: true, detail: "No generated script test suite" };
  const result = await callLocalSandbox({
    cases: [],
    executions: [],
    skillFiles: input.skillFiles,
    endpoint: input.endpoint,
    fetcher: input.fetcher,
  });
  return result.scriptTests || { status: "error", passed: false, detail: "Sandbox returned no script-test result" };
}

/**
 * Materialize represented artifacts and run deterministic script tests in the
 * local process sandbox. This deliberately does not claim MCP or host-tool
 * execution: the returned trace records those adapters as unavailable until a
 * real adapter is configured.
 */
export async function verifyExecutionsInLocalSandbox(input: {
  cases: SkillEvalCase[];
  skillFiles?: Record<string, string>;
  executions: HarnessExecution[];
  endpoint?: string;
  fetcher?: typeof fetch;
}) {
  const requiresFilesystem = input.cases.some((item) => item.expected.artifacts.length > 0)
    || Object.keys(input.skillFiles || {}).some((path) => path.startsWith("evals/script-tests/") && path.endsWith(".py"));
  if (!requiresFilesystem) return input.executions;
  const result = await callLocalSandbox(input);
  const checks = new Map((result.artifactChecks || []).map((item) => [item.caseId, item]));
  const scriptIds = scriptCapabilityIds(input.skillFiles);
  const caseById = new Map(input.cases.map((item) => [item.id, item]));
  return input.executions.map((execution) => {
    const check = checks.get(execution.caseId);
    const written = new Set(check?.written.map((item) => item.path) || []);
    const testsScriptCapability = (caseById.get(execution.caseId)?.capabilityIds || []).some((id) => scriptIds.has(id));
    const scriptTrace = testsScriptCapability && result.scriptTests?.status === "executed"
      ? result.scriptTests.passed ? "本地受限进程已运行本用例所覆盖的脚本测试：通过" : `本地受限进程已运行本用例所覆盖的脚本测试：失败（${(result.scriptTests.detail || "").slice(-180)}）`
      : "本用例不验证确定性脚本";
    return {
      ...execution,
      artifacts: execution.artifacts.map((artifact) => ({ ...artifact, verified: written.has(artifact.path) && artifact.content.length > 0 })),
      trace: [
        ...execution.trace,
        `文件系统验证：${result.runtime || "unknown"}`,
        `网络：${result.network || "未声明"}`,
        `外部 Tool/MCP：${result.toolAdapter === "configured" ? "已通过真实适配器执行" : "本地沙箱未配置，不计为已执行"}`,
        scriptTrace,
      ].slice(0, 12),
    };
  });
}
