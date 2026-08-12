import assert from "node:assert/strict";
import test from "node:test";

import {
  canManageLiveTv,
  canRemoveLiveTv,
  liveTvFormSchema,
  parseLiveTvProviderConfiguration,
} from "./live-tv.model.ts";

const valid = {
  languageId: "11111111-1111-4111-8111-111111111111",
  streamTitle: "INBCN English Live",
  shortDescription: "Live news from the INBCN newsroom.",
  provider: "youtube",
  providerUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  status: "offline",
  posterUrl: "https://res.cloudinary.com/demo/image/upload/poster.jpg",
  posterAltText: "INBCN Live newsroom",
  autoplay: false,
  muted: true,
  currentProgramme: "INBCN Live",
  programmeDescription: "Continuous coverage of today's top stories.",
  scheduleStart: "",
  scheduleEnd: "",
  relatedStoryId: "",
  relatedCategoryId: "",
  seoTitle: "Watch INBCN Live",
  seoDescription: "Watch INBCN live news coverage.",
  openGraphImageUrl: "https://res.cloudinary.com/demo/image/upload/live-og.jpg",
  canonicalUrl: "",
};

test("editors and administrators can manage Live TV while writers cannot", () => {
  assert.equal(canManageLiveTv("writer"), false);
  assert.equal(canManageLiveTv("editor"), true);
  assert.equal(canManageLiveTv("admin"), true);
});

test("only administrators can remove Live TV configurations", () => {
  assert.equal(canRemoveLiveTv("editor"), false);
  assert.equal(canRemoveLiveTv("admin"), true);
});

test("CMS validation normalizes localized Live TV values", () => {
  const result = liveTvFormSchema.parse(valid);
  assert.equal(result.shortDescription, valid.shortDescription);
  assert.equal(result.posterUrl, valid.posterUrl);
  assert.equal(result.relatedStoryId, null);
  assert.equal(result.canonicalUrl, null);
});

test("CMS validation rejects invalid schedules", () => {
  const result = liveTvFormSchema.safeParse({
    ...valid,
    status: "scheduled",
    scheduleStart: "2026-08-07T12:00:00.000Z",
    scheduleEnd: "2026-08-07T11:00:00.000Z",
  });
  assert.equal(result.success, false);
  assert.equal(result.error?.issues.some((issue) => issue.path[0] === "scheduleEnd"), true);
});

test("CMS treats datetime-local schedule values as the UTC time shown to editors", () => {
  const result = liveTvFormSchema.parse({
    ...valid,
    status: "scheduled",
    scheduleStart: "2030-08-07T08:00",
    scheduleEnd: "2030-08-07T09:00",
  });
  assert.equal(result.scheduleStart, "2030-08-07T08:00:00.000Z");
  assert.equal(result.scheduleEnd, "2030-08-07T09:00:00.000Z");
});

test("provider validation accepts approved YouTube hosts and extracts the stream id", () => {
  const result = parseLiveTvProviderConfiguration(valid, []);
  assert.deepEqual(result, {
    provider: "youtube",
    providerStreamId: "dQw4w9WgXcQ",
    streamUrl: null,
    externalWatchUrl: null,
    autoplay: false,
    muted: true,
  });
});

test("provider validation rejects non-HTTPS and unsupported hosts", () => {
  assert.throws(
    () => parseLiveTvProviderConfiguration({ ...valid, providerUrl: "http://youtube.com/watch?v=dQw4w9WgXcQ" }, []),
    /HTTPS/u,
  );
  assert.throws(
    () => parseLiveTvProviderConfiguration({ ...valid, providerUrl: "https://example.com/watch?v=dQw4w9WgXcQ" }, []),
    /approved/u,
  );
});

test("HLS manifests are limited to configured HTTPS hosts", () => {
  const result = parseLiveTvProviderConfiguration(
    { ...valid, provider: "hls", providerUrl: "https://stream.inbcn.example/live/news.m3u8" },
    ["stream.inbcn.example"],
  );
  assert.equal(result.streamUrl, "https://stream.inbcn.example/live/news.m3u8");
  assert.throws(
    () => parseLiveTvProviderConfiguration(
      { ...valid, provider: "hls", providerUrl: "https://unapproved.example/live/news.m3u8" },
      ["stream.inbcn.example"],
    ),
    /approved/u,
  );
});

test("autoplay remains invalid unless muted", () => {
  assert.throws(
    () => parseLiveTvProviderConfiguration({ ...valid, autoplay: true, muted: false }, []),
    /muted/u,
  );
});
