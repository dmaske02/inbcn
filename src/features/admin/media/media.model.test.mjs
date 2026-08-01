import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCloudinaryDeliveryUrl,
  canManageMedia,
  createMediaMetadata,
  mapMediaRecord,
  parseMediaMetadata,
  resolveFeaturedMediaSelection,
  validateImageUpload,
} from "./media.model.ts";

test("upload validation accepts supported images within the size limit", () => {
  assert.deepEqual(
    validateImageUpload({ name: "news.webp", type: "image/webp", size: 2_000_000 }),
    { ok: true },
  );
});

test("upload validation rejects unsupported image formats", () => {
  assert.deepEqual(
    validateImageUpload({ name: "news.gif", type: "image/gif", size: 2_000_000 }),
    { ok: false, reason: "UNSUPPORTED_TYPE" },
  );
});

test("upload validation rejects images larger than ten megabytes", () => {
  assert.deepEqual(
    validateImageUpload({ name: "news.jpg", type: "image/jpeg", size: 10 * 1024 * 1024 + 1 }),
    { ok: false, reason: "FILE_TOO_LARGE" },
  );
});

test("media metadata normalizes optional fields and comma-separated tags", () => {
  const metadata = createMediaMetadata({
    title: "  Parliament opens  ",
    credit: "  INBCN Photo Desk ",
    tags: "national, Parliament, national",
    uploadedBy: "Editor One",
    checksum: "abc123",
    originalFilename: "photo.jpg",
    assetId: "asset-1",
  });

  assert.deepEqual(metadata, {
    title: "Parliament opens",
    credit: "INBCN Photo Desk",
    tags: ["national", "Parliament"],
    uploadedBy: "Editor One",
    checksum: "abc123",
    originalFilename: "photo.jpg",
    cloudinaryAssetId: "asset-1",
  });
  assert.deepEqual(parseMediaMetadata(metadata), metadata);
});

test("only editors and admins can manage the reusable media library", () => {
  assert.equal(canManageMedia("writer"), false);
  assert.equal(canManageMedia("editor"), true);
  assert.equal(canManageMedia("admin"), true);
});

test("featured media selection preserves a writer's existing value", () => {
  assert.equal(resolveFeaturedMediaSelection("writer", "existing-id", "requested-id"), "existing-id");
  assert.equal(resolveFeaturedMediaSelection("editor", "existing-id", "requested-id"), "requested-id");
  assert.equal(resolveFeaturedMediaSelection("admin", "existing-id", ""), null);
});

test("Cloudinary delivery URLs use the public ID with automatic format and quality", () => {
  assert.equal(
    buildCloudinaryDeliveryUrl("demo-cloud", "inbcn/media/front page"),
    "https://res.cloudinary.com/demo-cloud/image/upload/f_auto,q_auto/inbcn/media/front%20page",
  );
});

test("repository rows map to stable media DTO fields", () => {
  assert.deepEqual(
    mapMediaRecord({
      id: "media-1",
      story_id: null,
      created_by: "user-1",
      cloudinary_public_id: "inbcn/media/news",
      secure_url: "https://res.cloudinary.com/demo/image/upload/news.jpg",
      resource_format: "jpg",
      mime_type: "image/jpeg",
      alt_text: "Newsroom",
      caption: null,
      width: 1200,
      height: 800,
      bytes: 12345,
      metadata: {
        title: "Newsroom image",
        credit: null,
        tags: ["news"],
        uploadedBy: "Editor One",
        checksum: "checksum",
        originalFilename: "news.jpg",
        cloudinaryAssetId: "asset",
      },
      created_at: "2026-08-02T10:00:00.000Z",
      updated_at: "2026-08-02T10:00:00.000Z",
    }),
    {
      id: "media-1",
      storyId: null,
      createdBy: "user-1",
      publicId: "inbcn/media/news",
      secureUrl: "https://res.cloudinary.com/demo/image/upload/news.jpg",
      format: "jpg",
      mimeType: "image/jpeg",
      altText: "Newsroom",
      caption: null,
      width: 1200,
      height: 800,
      bytes: 12345,
      metadata: {
        title: "Newsroom image",
        credit: null,
        tags: ["news"],
        uploadedBy: "Editor One",
        checksum: "checksum",
        originalFilename: "news.jpg",
        cloudinaryAssetId: "asset",
      },
      createdAt: "2026-08-02T10:00:00.000Z",
      updatedAt: "2026-08-02T10:00:00.000Z",
    },
  );
});
