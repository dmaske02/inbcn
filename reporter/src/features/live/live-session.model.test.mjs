import assert from "node:assert/strict";
import test from "node:test";

import { sessionPolicy } from "./live-session.model.ts";

const startsAt = "2026-08-22T10:00:00.000Z";
const endsAt = "2026-08-22T10:30:00.000Z";

test("approved active membership is allowed at the window boundary", () => {
  assert.deepEqual(sessionPolicy({
    status: "approved",
    now: startsAt,
    startsAt,
    endsAt,
    activeMember: true,
  }), { ok: true });
});

test("the exclusive end boundary, post-window, and non-active memberships are denied", () => {
  assert.deepEqual(sessionPolicy({
    status: "approved",
    now: endsAt,
    startsAt,
    endsAt,
    activeMember: true,
  }), { ok: false, reason: "outside-window" });
  assert.deepEqual(sessionPolicy({
    status: "approved",
    now: "2026-08-22T10:30:00.001Z",
    startsAt,
    endsAt,
    activeMember: true,
  }), { ok: false, reason: "outside-window" });
  assert.deepEqual(sessionPolicy({
    status: "approved",
    now: startsAt,
    startsAt,
    endsAt,
    activeMember: false,
  }), { ok: false, reason: "inactive-member" });
});

test("pre-window and terminated requests are denied", () => {
  assert.deepEqual(sessionPolicy({
    status: "approved",
    now: "2026-08-22T09:59:59.999Z",
    startsAt,
    endsAt,
    activeMember: true,
  }), { ok: false, reason: "outside-window" });
  assert.deepEqual(sessionPolicy({
    status: "terminated",
    now: startsAt,
    startsAt,
    endsAt,
    activeMember: true,
  }), { ok: false, reason: "not-approved" });
});
