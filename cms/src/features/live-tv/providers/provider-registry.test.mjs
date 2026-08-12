import assert from "node:assert/strict";
import test from "node:test";

import {
  SUPPORTED_LIVE_STREAM_PROVIDERS,
  getProviderDefinition,
  listProviderDefinitions,
  providerRegistry,
  validateProviderConfiguration,
} from "./provider-registry.ts";

const hlsPolicy = {
  allowedHosts: {
    youtube: [
      "youtube.com",
      "www.youtube.com",
      "youtu.be",
      "www.youtube-nocookie.com",
    ],
    hls: ["live.inbcn.example"],
  },
};

test("registry exposes only YouTube and HLS with stable capability mapping", () => {
  assert.deepEqual(SUPPORTED_LIVE_STREAM_PROVIDERS, ["youtube", "hls"]);
  assert.deepEqual(
    listProviderDefinitions().map(({ id }) => id),
    ["youtube", "hls"],
  );

  assert.deepEqual(getProviderDefinition("youtube").capabilities, {
    delivery: "iframe",
    nativeControls: true,
    captions: true,
    pictureInPicture: true,
    externalFallback: true,
    requiresRuntime: false,
  });
  assert.deepEqual(getProviderDefinition("hls").capabilities, {
    delivery: "media",
    nativeControls: true,
    captions: true,
    pictureInPicture: true,
    externalFallback: true,
    requiresRuntime: true,
  });
});

test("registry object exposes reusable list, lookup, and validation contracts", () => {
  assert.equal(providerRegistry.list, listProviderDefinitions);
  assert.equal(providerRegistry.get, getProviderDefinition);
  assert.equal(providerRegistry.validate, validateProviderConfiguration);
});

test("registry rejects unknown providers with a safe error", () => {
  assert.throws(
    () => getProviderDefinition("custom-iframe"),
    (error) =>
      error.code === "UNSUPPORTED_PROVIDER" &&
      error.safeMessage === "This stream provider is not supported.",
  );
});

test("YouTube validation accepts approved watch URLs and normalizes the video ID", () => {
  assert.deepEqual(
    validateProviderConfiguration({
      provider: "youtube",
      source: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      externalWatchUrl: "https://youtu.be/dQw4w9WgXcQ",
      autoplay: false,
      muted: true,
    }),
    {
      provider: "youtube",
      videoId: "dQw4w9WgXcQ",
      externalWatchUrl: "https://youtu.be/dQw4w9WgXcQ",
      autoplay: false,
      muted: true,
    },
  );
});

test("YouTube validation rejects non-HTTPS, unapproved hosts, and malformed IDs", () => {
  for (const source of [
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.example/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=bad",
  ]) {
    assert.throws(
      () => validateProviderConfiguration({ provider: "youtube", source }),
      (error) =>
        ["HTTPS_REQUIRED", "HOST_NOT_ALLOWED", "INVALID_PROVIDER_SOURCE"].includes(
          error.code,
        ),
    );
  }
});

test("HLS validation requires HTTPS, an allowed host, and an m3u8 path", () => {
  assert.deepEqual(
    validateProviderConfiguration(
      {
        provider: "hls",
        source: "https://live.inbcn.example/channel/master.m3u8?token=short-lived",
        externalWatchUrl: "https://live.inbcn.example/watch",
      },
      hlsPolicy,
    ),
    {
      provider: "hls",
      manifestUrl:
        "https://live.inbcn.example/channel/master.m3u8?token=short-lived",
      externalWatchUrl: "https://live.inbcn.example/watch",
      autoplay: false,
      muted: true,
    },
  );

  for (const source of [
    "http://live.inbcn.example/channel/master.m3u8",
    "https://untrusted.example/channel/master.m3u8",
    "https://live.inbcn.example/channel/video.mp4",
  ]) {
    assert.throws(
      () =>
        validateProviderConfiguration({ provider: "hls", source }, hlsPolicy),
      (error) =>
        ["HTTPS_REQUIRED", "HOST_NOT_ALLOWED", "INVALID_PROVIDER_SOURCE"].includes(
          error.code,
        ),
    );
  }
});

test("HLS fails closed when no deployment hostname has been approved", () => {
  assert.throws(
    () =>
      validateProviderConfiguration({
        provider: "hls",
        source: "https://live.inbcn.example/channel/master.m3u8",
      }),
    (error) => error.code === "HOST_NOT_ALLOWED",
  );
});

test("external fallback URLs receive the same HTTPS and host validation", () => {
  assert.throws(
    () =>
      validateProviderConfiguration({
        provider: "youtube",
        source: "dQw4w9WgXcQ",
        externalWatchUrl: "https://phishing.example/watch",
      }),
    (error) => error.code === "HOST_NOT_ALLOWED",
  );
});
