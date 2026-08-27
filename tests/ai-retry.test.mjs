import assert from "node:assert/strict";
import test from "node:test";

import { isRetryableNetworkFailure, safeNetworkFailureReason } from "../app/ai-retry.ts";

test("known upstream transport failures are retryable", () => {
  for (const message of [
    "Network connection lost.",
    "fetch failed",
    "socket hang up",
    "read ECONNRESET",
    "other side closed",
  ]) {
    assert.equal(isRetryableNetworkFailure(new TypeError(message)), true, message);
  }
});

test("abort and application failures are not mistaken for network loss", () => {
  const aborted = new Error("This operation was aborted");
  aborted.name = "AbortError";
  assert.equal(isRetryableNetworkFailure(aborted), false);
  assert.equal(isRetryableNetworkFailure(new Error("invalid JSON schema")), false);
});

test("diagnostic reason is bounded and excludes unsafe punctuation", () => {
  const reason = safeNetworkFailureReason(new TypeError("Network connection lost: https://secret.example/path?q=1"));
  assert.equal(reason, "upstream-network-connection-lost");
  assert.doesNotMatch(reason, /[:/?=]/);
  assert.doesNotMatch(reason, /secret|example|path/);
});
