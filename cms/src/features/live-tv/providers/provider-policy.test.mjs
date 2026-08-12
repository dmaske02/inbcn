import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PROVIDER_POLICY,
  LIVE_STREAM_OPERATIONAL_STATES,
  applyPlaybackPolicy,
  validateOperationalState,
  validateSchedule,
} from "./provider-policy.ts";

test("provider policy defaults to explicit, muted playback and fails closed for HLS hosts", () => {
  assert.equal(DEFAULT_PROVIDER_POLICY.autoplay.defaultEnabled, false);
  assert.equal(DEFAULT_PROVIDER_POLICY.autoplay.requiresMuted, true);
  assert.equal(DEFAULT_PROVIDER_POLICY.muted.defaultEnabled, true);
  assert.deepEqual(DEFAULT_PROVIDER_POLICY.allowedHosts.youtube, [
    "youtube.com",
    "www.youtube.com",
    "youtu.be",
    "www.youtube-nocookie.com",
  ]);
  assert.deepEqual(DEFAULT_PROVIDER_POLICY.allowedHosts.hls, []);
});

test("playback policy rejects autoplay with sound and applies safe defaults", () => {
  assert.deepEqual(applyPlaybackPolicy({}), { autoplay: false, muted: true });
  assert.deepEqual(applyPlaybackPolicy({ autoplay: true }), {
    autoplay: true,
    muted: true,
  });
  assert.throws(
    () => applyPlaybackPolicy({ autoplay: true, muted: false }),
    (error) => error.code === "AUTOPLAY_REQUIRES_MUTED",
  );
});

test("operational state validation accepts only the approved lifecycle", () => {
  assert.deepEqual(LIVE_STREAM_OPERATIONAL_STATES, [
    "draft",
    "scheduled",
    "live",
    "offline",
    "archived",
  ]);
  assert.equal(validateOperationalState("live"), "live");
  assert.throws(
    () => validateOperationalState("deleted"),
    (error) => error.code === "INVALID_OPERATIONAL_STATE",
  );
});

test("scheduled streams require a future start and ordered optional end", () => {
  const now = new Date("2026-08-06T12:00:00.000Z");
  assert.deepEqual(
    validateSchedule(
      {
        state: "scheduled",
        startsAt: "2026-08-06T13:00:00.000Z",
        endsAt: "2026-08-06T14:00:00.000Z",
      },
      now,
    ),
    {
      state: "scheduled",
      startsAt: "2026-08-06T13:00:00.000Z",
      endsAt: "2026-08-06T14:00:00.000Z",
    },
  );
  assert.throws(
    () =>
      validateSchedule(
        { state: "scheduled", startsAt: null, endsAt: null },
        now,
      ),
    (error) => error.code === "SCHEDULE_START_REQUIRED",
  );
  assert.throws(
    () =>
      validateSchedule(
        {
          state: "scheduled",
          startsAt: "2026-08-06T11:00:00.000Z",
          endsAt: null,
        },
        now,
      ),
    (error) => error.code === "SCHEDULE_START_NOT_FUTURE",
  );
  assert.throws(
    () =>
      validateSchedule(
        {
          state: "scheduled",
          startsAt: "2026-08-06T14:00:00.000Z",
          endsAt: "2026-08-06T13:00:00.000Z",
        },
        now,
      ),
    (error) => error.code === "SCHEDULE_END_NOT_AFTER_START",
  );
});

test("live streams cannot start in the future or remain live after their end", () => {
  const now = new Date("2026-08-06T12:00:00.000Z");
  assert.doesNotThrow(() =>
    validateSchedule(
      {
        state: "live",
        startsAt: "2026-08-06T11:00:00.000Z",
        endsAt: "2026-08-06T13:00:00.000Z",
      },
      now,
    ),
  );
  assert.throws(
    () =>
      validateSchedule(
        {
          state: "live",
          startsAt: "2026-08-06T13:00:00.000Z",
          endsAt: null,
        },
        now,
      ),
    (error) => error.code === "LIVE_START_IN_FUTURE",
  );
  assert.throws(
    () =>
      validateSchedule(
        {
          state: "live",
          startsAt: "2026-08-06T10:00:00.000Z",
          endsAt: "2026-08-06T11:00:00.000Z",
        },
        now,
      ),
    (error) => error.code === "LIVE_WINDOW_ENDED",
  );
});

test("all states reject invalid timestamps and reversed time windows", () => {
  const now = new Date("2026-08-06T12:00:00.000Z");
  assert.throws(
    () =>
      validateSchedule(
        { state: "draft", startsAt: "not-a-date", endsAt: null },
        now,
      ),
    (error) => error.code === "INVALID_SCHEDULE_TIMESTAMP",
  );
  assert.throws(
    () =>
      validateSchedule(
        {
          state: "offline",
          startsAt: "2026-08-06T14:00:00.000Z",
          endsAt: "2026-08-06T13:00:00.000Z",
        },
        now,
      ),
    (error) => error.code === "SCHEDULE_END_NOT_AFTER_START",
  );
});
