import assert from "node:assert/strict";
import test from "node:test";

import { mapPublicReplay } from "./replay.model.ts";

const replayId = "11111111-1111-4111-8111-111111111111";

const row = {
  id: replayId,
  status: "published",
  title: "Monsoon field report",
  description: "A verified report from the affected district.",
  duration_seconds: 72.5,
  recording_started_at: "2026-08-22T07:00:00.000Z",
  recording_ended_at: "2026-08-22T07:01:12.500Z",
  published_at: "2026-08-22T09:00:00.000Z",
  language_code: "en",
  category_slug: "mumbai",
  category_name: "Mumbai",
  thumbnail_url: "https://res.cloudinary.com/inbcn/image/upload/replay.jpg",
  thumbnail_alt_text: "Flooded street in Mumbai",
  thumbnail_width: 1280,
  thumbnail_height: 720,
  reporter_public_slug: "natalia_reporter",
  reporter_legal_display_name: "Natalia Reporter",
  reporter_avatar_url: "https://res.cloudinary.com/inbcn/image/upload/reporter.jpg",
  reporter_public_status: "active",
  reporter_home_district: "Mumbai City",
  reporter_bio: "Reports verified civic updates.",
  reporter_beats: ["civic", "environment"],
};

test("maps only the anonymous replay projection and a same-origin playback path", () => {
  const replay = mapPublicReplay(row);

  assert.ok(replay);
  assert.equal(replay.status, "published");
  assert.equal(replay.playbackUrl, `/api/replays/${replayId}`);
  assert.equal(replay.reporter.slug, "natalia_reporter");
  assert.equal(replay.category.slug, "mumbai");
  assert.equal(replay.thumbnail.alt, "Flooded street in Mumbai");
  for (const privateName of [
    "storageKey",
    "signedUrl",
    "egressId",
    "liveRequestId",
    "profileId",
    "accountId",
    "exactLocation",
    "privateNotes",
  ]) assert.equal(privateName in replay, false);
});

test("rejects extra private/provider fields instead of silently dropping them", () => {
  for (const extra of [
    { storage_key: "reporter-live/private.mp4" },
    { egress_id: "EG_secret" },
    { live_request_id: replayId },
    { profile_id: replayId },
    { signed_url: "https://private.example.test" },
    { rejection_reason: "private" },
  ]) assert.equal(mapPublicReplay({ ...row, ...extra }), null);
});

test("rejects malformed public rows at the trust boundary", () => {
  assert.equal(mapPublicReplay({ ...row, status: "private" }), null);
  assert.equal(mapPublicReplay({ ...row, id: "not-a-uuid" }), null);
  assert.equal(mapPublicReplay({ ...row, duration_seconds: 0 }), null);
  assert.equal(mapPublicReplay({ ...row, thumbnail_url: "http://private.test/image.jpg" }), null);
  assert.equal(mapPublicReplay({ ...row, reporter_home_district: "" }), null);
});
