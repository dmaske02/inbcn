import assert from "node:assert/strict";
import test from "node:test";

import {
  activateStoryVideoPreview,
  resolveStoryPreviewSource,
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

test("play activation cancels card navigation and changes playback state", () => {
  const calls = [];
  activateStoryVideoPreview({
    preventDefault: () => calls.push("preventDefault"),
    stopPropagation: () => calls.push("stopPropagation"),
  }, () => calls.push("activate"));

  assert.deepEqual(calls, ["preventDefault", "stopPropagation", "activate"]);
});
