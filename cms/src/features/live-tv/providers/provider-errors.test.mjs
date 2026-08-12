import assert from "node:assert/strict";
import test from "node:test";

import {
  LiveStreamProviderError,
  toSafeProviderError,
} from "./provider-errors.ts";

test("provider errors expose stable safe fields without leaking the cause", () => {
  const cause = new Error("token=secret-provider-token");
  const error = new LiveStreamProviderError({
    code: "HOST_NOT_ALLOWED",
    safeMessage: "The stream host is not approved.",
    field: "source",
    retryable: false,
    cause,
  });

  assert.equal(error.code, "HOST_NOT_ALLOWED");
  assert.equal(error.safeMessage, "The stream host is not approved.");
  assert.equal(error.field, "source");
  assert.equal(error.retryable, false);
  assert.equal(JSON.stringify(error).includes("secret-provider-token"), false);
});

test("unknown failures map to one retryable non-sensitive error", () => {
  assert.deepEqual(toSafeProviderError(new Error("manifest token=secret")), {
    code: "PROVIDER_UNAVAILABLE",
    message: "The stream provider is temporarily unavailable.",
    field: null,
    retryable: true,
  });
});

test("known provider failures preserve their safe contract", () => {
  const error = new LiveStreamProviderError({
    code: "INVALID_PROVIDER_SOURCE",
    safeMessage: "The provider source is invalid.",
    field: "source",
    retryable: false,
  });
  assert.deepEqual(toSafeProviderError(error), {
    code: "INVALID_PROVIDER_SOURCE",
    message: "The provider source is invalid.",
    field: "source",
    retryable: false,
  });
});
