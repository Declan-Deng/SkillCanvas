const RETRYABLE_NETWORK_PATTERN = /network connection lost|failed to fetch|fetch failed|networkerror|load failed|socket(?: hang up| closed)?|connection (?:reset|closed|terminated)|other side closed|econnreset|etimedout|und_err_socket/i;

export function isRetryableNetworkFailure(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return false;
  const cause = error.cause instanceof Error ? `${error.cause.name}: ${error.cause.message}` : String(error.cause || "");
  return RETRYABLE_NETWORK_PATTERN.test(`${error.name}: ${error.message} ${cause}`);
}

export function safeNetworkFailureReason(error: unknown) {
  if (!(error instanceof Error)) return "upstream-network-interrupted";
  const signature = `${error.name}: ${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`.toLowerCase();
  if (/network connection lost/.test(signature)) return "upstream-network-connection-lost";
  if (/econnreset|connection reset/.test(signature)) return "upstream-network-reset";
  if (/socket|other side closed|connection (?:closed|terminated)/.test(signature)) return "upstream-network-socket-closed";
  if (/etimedout/.test(signature)) return "upstream-network-connect-timeout";
  if (/fetch|networkerror|load failed/.test(signature)) return "upstream-network-fetch-failed";
  return "upstream-network-interrupted";
}
