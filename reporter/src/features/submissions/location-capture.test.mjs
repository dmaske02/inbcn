import assert from "node:assert/strict";
import test from "node:test";

import {
  captureCurrentLocation,
  mapGeolocationError,
  shouldRequestAutomaticLocation,
} from "./location-capture.ts";

test("captures finite browser coordinates with fresh high-accuracy options", async () => {
  let options;
  const location = await captureCurrentLocation({
    geolocation: {
      getCurrentPosition(success, _failure, receivedOptions) {
        options = receivedOptions;
        success({ coords: { latitude: 19.076, longitude: 72.8777, accuracy: 15 } });
      },
    },
    now: () => new Date("2026-08-23T12:00:00.000Z"),
  });
  assert.deepEqual(location, {
    latitude: 19.076,
    longitude: 72.8777,
    accuracy: 15,
    capturedAt: "2026-08-23T12:00:00.000Z",
  });
  assert.deepEqual(options, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
});

test("maps browser geolocation failures to safe actionable messages", () => {
  assert.equal(mapGeolocationError({ code: 1 }), "Location permission is required. Please allow location access and try again.");
  assert.equal(mapGeolocationError({ code: 2 }), "Current location is unavailable. Move to a better signal and try again.");
  assert.equal(mapGeolocationError({ code: 3 }), "Location capture timed out. Try again while keeping this page open.");
  assert.equal(mapGeolocationError({ code: 99 }), "Current location could not be captured. Try again.");
});

test("requests automatic location once and preserves fresh existing evidence across renders", () => {
  const current = "2026-08-23T12:00:00.000Z";
  const fresh = { latitude: 19.076, longitude: 72.8777, accuracy: 15, capturedAt: current };
  const stale = { ...fresh, capturedAt: "2026-08-23T11:29:59.999Z" };

  assert.equal(shouldRequestAutomaticLocation({ canSubmit: true, attemptStarted: false, location: null, now: current }), true);
  assert.equal(shouldRequestAutomaticLocation({ canSubmit: true, attemptStarted: true, location: null, now: current }), false);
  assert.equal(shouldRequestAutomaticLocation({ canSubmit: true, attemptStarted: false, location: fresh, now: current }), false);
  assert.equal(shouldRequestAutomaticLocation({ canSubmit: true, attemptStarted: false, location: stale, now: current }), true);
  assert.equal(shouldRequestAutomaticLocation({ canSubmit: false, attemptStarted: false, location: null, now: current }), false);
});

test("rejects unavailable geolocation and invalid browser coordinates without exposing provider details", async () => {
  await assert.rejects(
    captureCurrentLocation({ geolocation: null, now: () => new Date() }),
    { message: "Location is unavailable in this browser. Use a browser that supports location capture." },
  );
  await assert.rejects(
    captureCurrentLocation({
      geolocation: { getCurrentPosition(success) { success({ coords: { latitude: 95, longitude: 72, accuracy: 0 } }); } },
      now: () => new Date(),
    }),
    { message: "Current location could not be captured. Try again." },
  );
});
