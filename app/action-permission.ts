export const ASK_FIRST_SIGNAL = /(?:先|必须|需要|应当|务必).{0,10}(?:询问|追问|确认|征求)|(?:等待|暂停|停止).{0,12}(?:用户|确认|回复|输入)|(?:ask|confirm|wait for).{0,16}(?:user|approval|input)/i;
export const AUTONOMOUS_SIGNAL = /(?:自主|自动|直接|无需确认|不必询问|不用询问|默认).{0,12}(?:推进|继续|执行|完成|处理|补全|决定)|(?:proceed|continue|execute|complete).{0,12}(?:autonomously|without confirmation|without asking)/i;
export const SCOPED_AUTONOMY_SIGNAL = /(?:低风险|非关键|可逆).{0,80}(?:关键|高风险|不可逆)|(?:关键|高风险|不可逆).{0,80}(?:低风险|非关键|可逆)|(?:除非|仅当|只有|否则|分别|根据.{0,12}(?:风险|情况|条件))|(?:询问|追问|请求|等待).{0,24}(?:确认|回复|输入|授权).{0,12}(?:后|之后|再).{0,32}(?:继续|推进|执行|完成|处理|补全)|(?:ask|confirm|wait for).{0,24}(?:user|approval|input).{0,24}(?:then|after).{0,24}(?:proceed|continue|execute|complete)|(?:需要确认|缺少|不确定).{0,40}(?:询问|确认).{0,64}(?:其余|不依赖|已确认|可逆).{0,36}(?:继续|推进|执行|处理)/i;

import { confirmationCheckpoints, confirmationConflicts } from "./user-evidence.ts";

function affirmativeSignal(value: string, signal: RegExp) {
  return [...value.matchAll(new RegExp(signal.source, "gi"))].some((match) => {
    const prefix = value.slice(0, match.index).trimEnd();
    // “不自动选择，等待用户决定” prohibits autonomy; a substring match
    // on 自动…决定 used to invert it and trigger an endless repair loop.
    return !/(?:不|不得|不能|不可|禁止|不要|并非|not|never)\s*$/i.test(prefix);
  });
}

export function hasUnscopedActionPermissionConflict(value: string) {
  const checkpoints = confirmationCheckpoints(value);
  if (confirmationConflicts(checkpoints).length) return true;
  if (new Set(checkpoints.map((item) => item.stage)).size > 1
    && value.split(/[。；;\n]/).filter((clause) => ASK_FIRST_SIGNAL.test(clause) || AUTONOMOUS_SIGNAL.test(clause))
      .every((clause) => confirmationCheckpoints(clause).length > 0)) return false;
  return affirmativeSignal(value, ASK_FIRST_SIGNAL)
    && affirmativeSignal(value, AUTONOMOUS_SIGNAL)
    && !SCOPED_AUTONOMY_SIGNAL.test(value);
}

/**
 * Canonical runtime contracts cannot leave "ask first" and "continue
 * autonomously" in the same unscoped branch. Model repair is deliberately not
 * trusted to fix this compiler-owned invariant: project one safe, productive
 * two-branch contract instead.
 */
export function reconcileActionPermissionText(value: string) {
  if (!hasUnscopedActionPermissionConflict(value)) return value;
  const english = /\b(?:ask|confirm|wait|proceed|continue|execute|autonomously)\b/i.test(value)
    && !/[\u4e00-\u9fff]/.test(value);
  return english
    ? "Branch by dependency: if a blocking input, user decision, or authorization is missing, ask the user and pause only the dependent step; resume it after the reply. Continue only reversible work that does not depend on the missing information."
    : "根据依赖条件分别处理：缺少阻断输入、用户决定或授权时，先询问用户并只暂停依赖该信息的步骤；收到回复后再继续该步骤。其余不依赖该信息的可逆工作可以自主继续。";
}

/** Final projection guard. Separate Canonical fields can become contradictory
 * only after a Markdown renderer joins them onto one executable rule line.
 * Preserve list/provenance prefixes while replacing that ambiguous rule with
 * the same deterministic two-branch contract used by the IR compiler. */
export function reconcileProjectedActionPermissionMarkdown(markdown: string) {
  let inUserEvidence = false;
  return markdown.split("\n").map((line) => {
    if (/^##\s/.test(line)) inUserEvidence = /^## (?:Confirmed requirements|Prohibited behaviors from user counterexamples|Confirmation timing)/.test(line);
    if (inUserEvidence || /^> User counterexample/.test(line)) return line;
    if (/^\s*#{1,6}\s/.test(line) || !hasUnscopedActionPermissionConflict(line)) return line;
    const prefix = line.match(/^\s*(?:(?:[-*+]\s+|\d+[.)、]\s+))?(?:\[[^\]]+\]\s*)?/)?.[0] || "";
    return `${prefix}${reconcileActionPermissionText(line.slice(prefix.length))}`;
  }).join("\n");
}
