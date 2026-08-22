import assert from "node:assert/strict";
import test from "node:test";

import {
  ApplicationInputError,
  applicationInputErrorMessage,
} from "./application.error.ts";

test("only explicit application input errors expose a user-facing message", () => {
  assert.equal(
    applicationInputErrorMessage(new ApplicationInputError("Choose all six notices.")),
    "Choose all six notices.",
  );
  assert.equal(applicationInputErrorMessage(new TypeError("provider secret detail")), null);
  assert.equal(applicationInputErrorMessage(new Error("database secret detail")), null);
});
