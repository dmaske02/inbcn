import assert from "node:assert/strict";
import test from "node:test";

import {
  liveStreamPersistenceSchema,
  mapLiveStreamRow,
  mapLiveStreamWrite,
} from "./live-tv.model.ts";

const base = {
  languageId: "11111111-1111-4111-8111-111111111111",
  internalName: "English main channel",
  title: "INBCN Live",
  description: "Live coverage from the INBCN newsroom.",
  provider: "youtube",
  providerStreamId: "dQw4w9WgXcQ",
  streamUrl: null,
  externalWatchUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  posterUrl: "https://res.cloudinary.com/inbcn/image/upload/live.jpg",
  posterAltText: "INBCN Live newsroom",
  status: "draft",
  autoplay: false,
  muted: true,
  startsAt: null,
  endsAt: null,
  offlineMessage: "The broadcast is currently offline.",
  relatedCategoryId: null,
  relatedStoryId: null,
  seoTitle: null,
  seoDescription: null,
  socialImageUrl: null,
};

test("validation normalizes a complete YouTube persistence configuration", () => {
  const parsed = liveStreamPersistenceSchema.parse({
    ...base,
    internalName: "  English main channel  ",
    title: "  INBCN Live  ",
  });
  assert.equal(parsed.internalName, "English main channel");
  assert.equal(parsed.title, "INBCN Live");
  assert.equal(parsed.providerStreamId, "dQw4w9WgXcQ");
});

test("validation enforces provider-specific source fields", () => {
  assert.equal(
    liveStreamPersistenceSchema.safeParse({
      ...base,
      provider: "youtube",
      providerStreamId: null,
    }).success,
    false,
  );
  assert.equal(
    liveStreamPersistenceSchema.safeParse({
      ...base,
      provider: "hls",
      providerStreamId: null,
      streamUrl: "https://live.inbcn.example/main/master.m3u8",
      externalWatchUrl: "https://live.inbcn.example/watch",
    }).success,
    true,
  );
  assert.equal(
    liveStreamPersistenceSchema.safeParse({
      ...base,
      provider: "hls",
      providerStreamId: null,
      streamUrl: "https://live.inbcn.example/main/video.mp4",
    }).success,
    false,
  );
});

test("validation enforces muted autoplay, poster alt text, HTTPS, and schedule order", () => {
  for (const candidate of [
    { ...base, autoplay: true, muted: false },
    { ...base, posterAltText: null },
    { ...base, externalWatchUrl: "http://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    {
      ...base,
      startsAt: "2026-08-06T14:00:00.000Z",
      endsAt: "2026-08-06T13:00:00.000Z",
    },
  ]) {
    assert.equal(liveStreamPersistenceSchema.safeParse(candidate).success, false);
  }
});

test("scheduled persistence requires a start timestamp", () => {
  assert.equal(
    liveStreamPersistenceSchema.safeParse({ ...base, status: "scheduled" })
      .success,
    false,
  );
  assert.equal(
    liveStreamPersistenceSchema.safeParse({
      ...base,
      status: "scheduled",
      startsAt: "2026-08-07T10:00:00.000Z",
    }).success,
    true,
  );
});

test("row mapper creates a stable DTO and safe view model", () => {
  const row = {
    id: "stream-1",
    language_id: base.languageId,
    internal_name: base.internalName,
    title: base.title,
    description: base.description,
    provider: base.provider,
    provider_stream_id: base.providerStreamId,
    stream_url: null,
    external_watch_url: base.externalWatchUrl,
    poster_url: base.posterUrl,
    poster_alt_text: base.posterAltText,
    status: base.status,
    autoplay: false,
    muted: true,
    starts_at: null,
    ends_at: null,
    offline_message: base.offlineMessage,
    related_category_id: null,
    related_story_id: null,
    seo_title: null,
    seo_description: null,
    social_image_url: null,
    created_by: "editor-1",
    updated_by: "editor-2",
    created_at: "2026-08-06T10:00:00.000Z",
    updated_at: "2026-08-06T11:00:00.000Z",
  };
  const result = mapLiveStreamRow(row);
  assert.equal(result.dto.languageId, base.languageId);
  assert.equal(result.dto.providerStreamId, "dQw4w9WgXcQ");
  assert.equal(result.view.id, "stream-1");
  assert.equal("createdBy" in result.view, false);
  assert.equal("updatedBy" in result.view, false);
});

test("write mapper converts validated camelCase input to database columns", () => {
  const parsed = liveStreamPersistenceSchema.parse(base);
  assert.deepEqual(mapLiveStreamWrite(parsed), {
    language_id: base.languageId,
    internal_name: base.internalName,
    title: base.title,
    description: base.description,
    provider: "youtube",
    provider_stream_id: "dQw4w9WgXcQ",
    stream_url: null,
    external_watch_url: base.externalWatchUrl,
    poster_url: base.posterUrl,
    poster_alt_text: base.posterAltText,
    status: "draft",
    autoplay: false,
    muted: true,
    starts_at: null,
    ends_at: null,
    offline_message: base.offlineMessage,
    related_category_id: null,
    related_story_id: null,
    seo_title: null,
    seo_description: null,
    social_image_url: null,
  });
});
