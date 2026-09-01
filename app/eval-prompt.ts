// Bump when compiler-owned fixtures change, so retrying an old session
// rebuilds them from the task/material instead of repairing stale projections.
export const EVAL_COMPILER_VERSION = "2.9";

/** Typography in a JSON string is not JSON syntax. Quotes may be literal
 * data, mixed-width punctuation, or part of a supplied counterexample.
 * Only a dangling opening delimiter at the end is actionable here. Actual
 * token truncation is detected from the provider's finish_reason upstream. */
export function danglingPromptDelimiter(value: string) {
  const text = value.trimEnd();
  // A task may intentionally ask for the literal opening character.
  if (/(?:字符|符号|引号|character|symbol)\s*[:：=]?\s*[“「『（【]$/i.test(text)) return null;
  return text.match(/[“「『（【]$/)?.[0] || null;
}

export function providerAccountFailure(status: number, message: string) {
  if (status === 402 || /Insufficient[ _-]*(?:Balance|Quota)|insufficient_quota|余额不足|额度不足|欠费/i.test(message)) {
    return { code: "AI_ACCOUNT_LIMIT", error: "模型账户余额或额度不足，请充值后重试当前步骤，或切换可用模型。", retryable: false };
  }
  if ([401, 403].includes(status)) {
    return { code: "AI_PROVIDER_AUTH", error: "模型 API Key 无效、已过期或没有访问权限，请检查模型配置后重试。", retryable: false };
  }
  return null;
}

/** These failures need account/configuration changes, not a second repair.
 * Keep this narrow: network errors and rate limits may still be retried. */
export function providerRepairNeedsUserAction(error: unknown) {
  if (error && typeof error === "object" && "code" in error
    && ["AI_ACCOUNT_LIMIT", "AI_PROVIDER_AUTH"].includes(String(error.code))) return true;
  const value = error instanceof Error ? error.message : String(error || "");
  return /Insufficient[ _-]*(?:Balance|Quota)|insufficient_quota|余额(?:或额度)?不足|额度不足|欠费|(?:invalid|incorrect)[ _-]*api[ _-]*key|API[ _-]*key.{0,16}(?:invalid|expired|无效|过期)|模型服务返回\s*(?:401|402|403)\b/i.test(value);
}
