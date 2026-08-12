import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCloudinaryDeliveryUrl,
  buildCloudinaryThumbnailUrl,
  canManageMedia,
  createMediaMetadata,
  mapMediaRecord,
  normalizeMediaMetadataUpdate,
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

test("upload envelope validation does not trust declared MIME as format proof", () => {
  assert.deepEqual(
    validateImageUpload({ name: "news.gif", type: "image/gif", size: 2_000_000 }),
    { ok: true },
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

test("Cloudinary grid thumbnails are bounded and cropped without changing preview URLs", () => {
  assert.equal(
    buildCloudinaryThumbnailUrl("demo-cloud", "inbcn/media/front page"),
    "https://res.cloudinary.com/demo-cloud/image/upload/f_auto,q_auto,c_fill,g_auto,w_720,h_405/inbcn/media/front%20page",
  );
});

test("repository rows map to stable media DTO fields", () => {
  assert.deepEqual(
    mapMediaRecord({
      id: "media-1",
      story_id: null,
      created_by: "user-1",
      title: "Canonical newsroom image",
      original_filename: "canonical-news.jpg",
      credit: "INBCN Photo Desk",
      updated_by: "user-2",
      deleted_at: "2026-08-03T10:00:00.000Z",
      deleted_by: "user-3",
      media_type: "image",
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
      title: "Canonical newsroom image",
      originalFilename: "canonical-news.jpg",
      credit: "INBCN Photo Desk",
      updatedBy: "user-2",
      deletedAt: "2026-08-03T10:00:00.000Z",
      deletedBy: "user-3",
      mediaType: "image",
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

test("normalized metadata takes priority over legacy JSON values", () => {
  const mapped = mapMediaRecord({
    id: "media-2", story_id: null, created_by: null,
    title: "Normalized title", original_filename: "normalized.jpg",
    credit: "Normalized credit", updated_by: null, deleted_at: null, deleted_by: null,
    cloudinary_public_id: "inbcn/media/normalized", secure_url: "https://example.com/normalized.jpg",
    resource_format: "jpg", mime_type: "image/jpeg", alt_text: "Normalized alt", caption: null,
    width: 1200, height: 800, bytes: 100,
    metadata: { title: "Legacy title", originalFilename: "legacy.jpg", credit: "Legacy credit" },
    created_at: "2026-08-02T10:00:00.000Z", updated_at: "2026-08-02T10:00:00.000Z",
  });

  assert.equal(mapped.title, "Normalized title");
  assert.equal(mapped.originalFilename, "normalized.jpg");
  assert.equal(mapped.credit, "Normalized credit");
  assert.equal(mapped.metadata.title, "Legacy title");
});

test("legacy and malformed metadata map safely when normalized values are absent", () => {
  const base = {
    id: "media-3", story_id: "story-1", created_by: null,
    title: null, original_filename: null, credit: null,
    updated_by: null, deleted_at: null, deleted_by: null,
    cloudinary_public_id: "inbcn/media/legacy", secure_url: "https://example.com/legacy.jpg",
    resource_format: null, mime_type: null, alt_text: "Legacy alt", caption: null,
    width: null, height: null, bytes: null,
    created_at: "2026-08-02T10:00:00.000Z", updated_at: "2026-08-02T10:00:00.000Z",
  };

  const legacy = mapMediaRecord({
    ...base,
    metadata: { title: "Legacy title", originalFilename: "legacy.jpg", credit: "Legacy credit" },
  });
  assert.equal(legacy.title, "Legacy title");
  assert.equal(legacy.originalFilename, "legacy.jpg");
  assert.equal(legacy.credit, "Legacy credit");
  assert.equal(legacy.storyId, "story-1");

  const malformed = mapMediaRecord({ ...base, metadata: "not-an-object" });
  assert.equal(malformed.title, "Legacy alt");
  assert.equal(malformed.originalFilename, "");
  assert.equal(malformed.credit, null);
  assert.deepEqual(malformed.metadata.tags, []);
});

test("metadata updates normalize allowed fields while preserving intentional empty alt text", () => {
  assert.deepEqual(normalizeMediaMetadataUpdate({
    title: "  Parliament opens  ",
    originalFilename: "  parliament.jpg  ",
    altText: "",
    caption: "  Opening session  ",
    credit: "  INBCN Desk  ",
  }), {
    ok: true,
    value: {
      title: "Parliament opens",
      originalFilename: "parliament.jpg",
      altText: "",
      caption: "Opening session",
      credit: "INBCN Desk",
    },
  });
});

test("metadata updates return typed field errors without truncating invalid content", () => {
  const result = normalizeMediaMetadataUpdate({
    title: " ", originalFilename: "a".repeat(256), altText: "a".repeat(501),
    caption: "a".repeat(1001), credit: "a".repeat(201),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(Object.keys(result.fieldErrors).sort(), ["altText", "caption", "credit", "originalFilename", "title"]);
});

test("metadata updates reject control characters in single-line fields", () => {
  const result = normalizeMediaMetadataUpdate({
    title: "Unsafe\u0000 title", originalFilename: "image.jpg", altText: "", caption: "", credit: "",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.fieldErrors.title, "Title contains unsupported characters.");
});
