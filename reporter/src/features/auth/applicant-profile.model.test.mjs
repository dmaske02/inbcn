import assert from "node:assert/strict";
import test from "node:test";

import { applicantProfileInsert } from "./applicant-profile.model.ts";

test("new applicant profiles are restricted to the reader role", () => {
  assert.deepEqual(applicantProfileInsert("f707b003-3ddc-4556-bc46-e4996958d4f4"), {
    id: "f707b003-3ddc-4556-bc46-e4996958d4f4",
    username: "reporter_f707b0033ddc4556",
    display_name: "Reporter applicant",
    role: "reader",
  });
});

test("invalid or client-shaped identifiers are rejected", () => {
  assert.throws(() => applicantProfileInsert("/application"), /invalid-user-id/u);
});
