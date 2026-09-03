export type PlannedDemoUserTurn = {
  message: string;
  purpose: string;
};

export function normalizePlannedDemoTurns(value: unknown, limit = 2): PlannedDemoUserTurn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    const message = typeof candidate.message === "string" ? candidate.message.trim().slice(0, 3_000) : "";
    if (!message) return [];
    const purpose = typeof candidate.purpose === "string" ? candidate.purpose.trim().slice(0, 240) : "";
    return [{ message, purpose }];
  }).slice(0, Math.max(0, limit));
}

/** Detect a blocking or workflow-relevant request for user input. Generic
 * closing courtesies must not manufacture extra turns after a complete result. */
export function demoReplyNeedsUserTurn(reply: string) {
  const text = reply.replace(/\s+/g, " ").trim();
  if (!text) return false;
  const blockingRequest = /无法(?:开始|继续|完成)|不能(?:开始|继续|完成)|还(?:需要|缺少)|缺少.{0,40}(?:信息|材料|输入|选择|确认)|需要(?:您|你)?(?:补充|提供|确认|选择|回答|上传)|请(?:补充|提供|确认|选择|回答|上传|告知)|在.{0,24}之前.{0,24}(?:无法|不能|需要)|(?:need|require|missing).{0,48}(?:input|information|material|confirmation)|please (?:provide|confirm|choose|upload|answer)/i;
  if (blockingRequest.test(text)) return true;
  const numberedQuestions = (reply.match(/(?:^|\n)\s*(?:\d+[.、)]|[-*])[^\n]{0,180}[?？]/g) || []).length;
  if (numberedQuestions > 0) return true;
  const courtesyOnly = /(?:如需|如果(?:你|您)希望|若需|需要我).{0,48}(?:可以|告诉|告知|继续|调整|修改)/i.test(text.slice(-180));
  return !courtesyOnly && /(?:是否|哪一|哪些|什么|如何|能否).{0,48}[?？]/.test(text.slice(-500));
}
