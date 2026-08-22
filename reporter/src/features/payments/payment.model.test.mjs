import assert from "node:assert/strict";
import test from "node:test";

import { creditRenewal } from "./payment.model.ts";

test("credits one calendar year from the later of current expiry and capture", () => {
  assert.equal(
    creditRenewal("2027-08-22T00:00:00.000Z", "2027-08-20T00:00:00.000Z"),
    "2028-08-22T00:00:00.000Z",
  );
  assert.equal(
    creditRenewal("2027-08-22T00:00:00.000Z", "2027-09-01T00:00:00.000Z"),
    "2028-09-01T00:00:00.000Z",
  );
});

test("clamps leap-day renewal to the last day of February", () => {
  assert.equal(
    creditRenewal("2028-02-29T12:30:00.000Z", "2028-02-20T00:00:00.000Z"),
    "2029-02-28T12:30:00.000Z",
  );
});
