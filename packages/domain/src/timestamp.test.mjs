import assert from "node:assert/strict";
import test from "node:test";

import { strictTimestampMilliseconds } from "./index.ts";

test("strict timestamps reject impossible calendar dates and invalid offsets", () => {
  assert.equal(strictTimestampMilliseconds("2026-08-22T10:00:00Z"), Date.parse("2026-08-22T10:00:00Z"));
  assert.equal(Number.isNaN(strictTimestampMilliseconds("2026-02-30T10:00:00Z")), true);
  assert.equal(Number.isNaN(strictTimestampMilliseconds("2026-08-22T10:00:00+14:01")), true);
});
