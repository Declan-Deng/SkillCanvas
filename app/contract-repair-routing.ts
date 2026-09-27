import { isCompilerOwnedEvalCoverageIssue } from "./eval-repair-routing.ts";
import { isCapabilityDeltaContractIssue, isSkillIRProjectionIssue } from "./skill-projection-repair.ts";

export type ContractRepairIssue = { type?: string; evidence?: string };
export type ContractRepairOwner =
  | "compiler-projection"
  | "compiler-knowledge"
  | "compiler-eval"
  | "model-semantic";

/** Route by the component that owns the invalid state. Compiler-owned defects
 * must never consume a model repair round: a model cannot change the compiler,
 * validator, or deterministic projection that produced them.
 */
export function contractRepairOwner(issue: ContractRepairIssue): ContractRepairOwner {
  const normalized = { type: issue.type || "", evidence: issue.evidence || "" };
  if (isSkillIRProjectionIssue(normalized)) return "compiler-projection";
  if (isCapabilityDeltaContractIssue(normalized)) return "compiler-knowledge";
  if (isCompilerOwnedEvalCoverageIssue(normalized)) return "compiler-eval";
  return "model-semantic";
}

export function compilerOwnedContractIssues(issues: ContractRepairIssue[]) {
  return issues.filter((issue) => contractRepairOwner(issue) !== "model-semantic");
}
