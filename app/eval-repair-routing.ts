export type EvalCoverageIssue = { type?: string; evidence?: string };

const COMPILER_OWNED_EVAL_COVERAGE = /CAPABILITY_WITHOUT_EVAL|没有绑定可执行\s*Eval|没有映射到任何\s*Eval|没有可执行评测|没有聚焦评测|without.*eval|评测未同时覆盖触发边界、领域核心能力和真实失败模式|评测没有把触发、能力、事实依据和工具集成拆成四类独立回归/i;

/** These failures describe compiler-owned Eval structure only. They can be
 * repaired from the frozen SkillIR without asking a model to rewrite task
 * semantics, user evidence, capabilities, or authored files. */
export function isCompilerOwnedEvalCoverageIssue(issue: EvalCoverageIssue) {
  return COMPILER_OWNED_EVAL_COVERAGE.test(`${issue.type || ""} ${issue.evidence || ""}`);
}

export function issuesAreCompilerOwnedEvalCoverage(issues: EvalCoverageIssue[]) {
  return issues.length > 0 && issues.every(isCompilerOwnedEvalCoverageIssue);
}
