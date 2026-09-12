import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStoryVideoPlaybackHref,
  isStoryVideoAutoplayRequested,
  resolveStoryPreviewSource,
  startMutedStoryVideoPlayback,
  withVideoPreviewTime,
} from "./story-preview-media.model.ts";

const image = {
  src: "https://images.example/story.jpg",
  alt: "Story image",
  unoptimized: true,
};

test("chooses an explicit video preview before a card image", () => {
  assert.deepEqual(
    resolveStoryPreviewSource(image, {
      src: "https://video.example/story.mp4",
      mimeType: "video/mp4",
      poster: "https://images.example/story-poster.jpg",
    }),
    {
      kind: "video",
      src: "https://video.example/story.mp4",
      mimeType: "video/mp4",
      poster: "https://images.example/story-poster.jpg",
    },
  );
});

test("recognizes direct video URLs supplied through the media field", () => {
  assert.deepEqual(
    resolveStoryPreviewSource({
      src: "https://media.example/REPORT.MOV?version=4",
      alt: "Reporter clip",
    }, null),
    {
      kind: "video",
      src: "https://media.example/REPORT.MOV?version=4",
      mimeType: "video/quicktime",
      poster: null,
    },
  );
});

test("keeps ordinary images and supplies the INBCN fallback when media is absent", () => {
  assert.deepEqual(resolveStoryPreviewSource(image, null), {
    kind: "image",
    image,
  });
  assert.deepEqual(resolveStoryPreviewSource(null, null), {
    kind: "image",
    image: {
      src: "/images/news/story-fallback.svg",
      alt: "",
      unoptimized: false,
    },
  });
});

test("adds a first-frame fragment without dropping an existing query string", () => {
  assert.equal(
    withVideoPreviewTime("https://video.example/story.webm?token=abc"),
    "https://video.example/story.webm?token=abc#t=0.001",
  );
});

test("builds a full-story video destination without dropping existing query parameters", () => {
  assert.equal(
    buildStoryVideoPlaybackHref("/en/story/example"),
    "/en/story/example?autoplay=video#story-video",
  );
  assert.equal(
    buildStoryVideoPlaybackHref("/en/story/example?edition=morning#comments"),
    "/en/story/example?edition=morning&autoplay=video#story-video",
  );
});

test("recognizes only the article video autoplay request", () => {
  assert.equal(isStoryVideoAutoplayRequested("video"), true);
  assert.equal(isStoryVideoAutoplayRequested(["other", "video"]), true);
  assert.equal(isStoryVideoAutoplayRequested("other"), false);
  assert.equal(isStoryVideoAutoplayRequested(undefined), false);
});

test("mutes the article player before requesting playback after hydration", async () => {
  const calls = [];
  const player = {
    muted: false,
    play: async () => {
      calls.push(player.muted ? "play-muted" : "play-audible");
    },
  };

  assert.equal(await startMutedStoryVideoPlayback(player), true);
  assert.equal(player.muted, true);
  assert.deepEqual(calls, ["play-muted"]);
});

test("keeps browser autoplay rejection non-fatal", async () => {
  const player = {
    muted: false,
    play: async () => {
      throw new Error("Autoplay was blocked");
    },
  };

  assert.equal(await startMutedStoryVideoPlayback(player), false);
  assert.equal(player.muted, true);
});
