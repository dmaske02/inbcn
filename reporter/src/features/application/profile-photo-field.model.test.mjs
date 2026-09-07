import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PROFILE_PHOTO_SIZE,
  formatProfilePhotoSize,
  validateProfilePhotoSelection,
} from "./profile-photo-field.model.ts";

test("accepts supported portrait image selections up to ten MiB", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
    assert.equal(validateProfilePhotoSelection({ type, size: MAX_PROFILE_PHOTO_SIZE }), null);
  }
});

test("rejects unsupported portrait formats before form submission", () => {
  assert.equal(
    validateProfilePhotoSelection({ type: "image/gif", size: 1024 }),
    "Choose a JPG, PNG, or WebP image.",
  );
});

test("rejects portrait selections larger than ten MiB", () => {
  assert.equal(
    validateProfilePhotoSelection({ type: "image/jpeg", size: MAX_PROFILE_PHOTO_SIZE + 1 }),
    "Portraits must be 10 MiB or smaller.",
  );
});

test("formats selected portrait size as compact metadata", () => {
  assert.equal(formatProfilePhotoSize(2.4 * 1024 * 1024), "2.4 MB");
  assert.equal(formatProfilePhotoSize(512 * 1024), "512 KB");
});
