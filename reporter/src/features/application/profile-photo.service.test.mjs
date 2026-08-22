import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PROFILE_PHOTO_SIZE,
  createProfilePhotoUploader,
  inspectProfilePhoto,
} from "./profile-photo.service.ts";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 12, 0, 0, 0,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
  0, 0, 0, 0,
]);

test("accepts only JPEG, PNG, and WebP from actual portrait bytes", () => {
  assert.equal(inspectProfilePhoto({ type: "image/jpeg", size: jpeg.length, bytes: jpeg }).format, "jpeg");
  assert.equal(inspectProfilePhoto({ type: "image/png", size: png.length, bytes: png }).format, "png");
  assert.equal(inspectProfilePhoto({ type: "image/webp", size: webp.length, bytes: webp }).format, "webp");
  assert.deepEqual(
    inspectProfilePhoto({ type: "image/jpeg", size: 6, bytes: new Uint8Array([1, 2, 3, 4, 5, 6]) }),
    { ok: false, code: "invalid-format" },
  );
  assert.deepEqual(
    inspectProfilePhoto({ type: "image/png", size: jpeg.length, bytes: jpeg }),
    { ok: false, code: "type-mismatch" },
  );
});

test("enforces the ten MiB portrait boundary before upload", () => {
  const tooLarge = new Uint8Array(MAX_PROFILE_PHOTO_SIZE + 1);
  tooLarge.set(jpeg);
  assert.deepEqual(
    inspectProfilePhoto({ type: "image/jpeg", size: tooLarge.length, bytes: tooLarge }),
    { ok: false, code: "file-too-large" },
  );
});

test("uses the preallocated server-owned application ID for Cloudinary identity", async () => {
  let received;
  const uploader = createProfilePhotoUploader({
    upload: async (input) => {
      received = input;
      return { secureUrl: "https://res.cloudinary.com/demo/image/upload/portrait.jpg" };
    },
  });

  const result = await uploader(
    { type: "image/jpeg", size: jpeg.length, bytes: jpeg },
    "123e4567-e89b-42d3-a456-426614174000",
  );

  assert.equal(received.publicId, "inbcn/reporter/portrait/123e4567-e89b-42d3-a456-426614174000");
  assert.equal(received.format, "jpeg");
  assert.deepEqual(result, {
    publicId: received.publicId,
    secureUrl: "https://res.cloudinary.com/demo/image/upload/portrait.jpg",
  });
  assert.doesNotMatch(received.publicId, /aadhaar|kyc|\.jpg/iu);
});
