import assert from "node:assert/strict";
import test from "node:test";

import { createMediaOperations, MediaManagementError } from "./media.operations.ts";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xd9]);

const uploadInput = {
  file: { name: "news.jpg", type: "image/jpeg", size: jpeg.length, bytes: jpeg },
  title: "News image",
  altText: "A news event",
  caption: "Caption",
  credit: "INBCN",
  tags: "news",
  uploadedBy: "Editor One",
  createdBy: "user-1",
  checksum: "checksum-1",
};

function fixture(overrides = {}) {
  const state = {
    inserted: [],
    updated: [],
    uploaded: [],
    destroyed: [],
  };
  const existing = {
    id: "media-1",
    publicId: "inbcn/media/old",
    secureUrl: "https://res.cloudinary.com/demo/image/upload/old.jpg",
  };
  const repository = {
    findByChecksum: async () => null,
    insert: async (value) => {
      state.inserted.push(value);
      return { id: "media-2", ...value };
    },
    update: async (id, value) => {
      state.updated.push({ id, value });
      return { ...existing, ...value, id };
    },
    getById: async () => existing,
    ...overrides.repository,
  };
  const cloudinary = {
    upload: async () => {
      const result = {
        publicId: "inbcn/media/new",
        secureUrl: "https://res.cloudinary.com/demo/image/upload/new.jpg",
        assetId: "asset-2",
        format: "jpg",
        mimeType: "image/jpeg",
        width: 1600,
        height: 900,
        bytes: jpeg.length,
      };
      state.uploaded.push(result.publicId);
      return result;
    },
    destroy: async (publicId) => {
      state.destroyed.push(publicId);
    },
    ...overrides.cloudinary,
  };

  return { state, operations: createMediaOperations({ repository, cloudinary }) };
}

test("upload rejects a duplicate before contacting Cloudinary", async () => {
  const { operations, state } = fixture({
    repository: { findByChecksum: async () => ({ id: "duplicate" }) },
  });

  await assert.rejects(
    operations.upload(uploadInput),
    (error) => error instanceof MediaManagementError && error.code === "DUPLICATE",
  );
  assert.deepEqual(state.uploaded, []);
});

test("upload rejects spoofed MIME before contacting Cloudinary", async () => {
  const { operations, state } = fixture();

  await assert.rejects(
    operations.upload({ ...uploadInput, file: { ...uploadInput.file, type: "image/png" } }),
    (error) => error instanceof MediaManagementError && error.code === "VALIDATION",
  );
  assert.deepEqual(state.uploaded, []);
  assert.deepEqual(state.inserted, []);
});

test("Cloudinary failures return a typed sanitized error without persistence", async () => {
  const { operations, state } = fixture({
    cloudinary: { upload: async () => { throw new Error("api_secret=do-not-leak"); } },
  });

  await assert.rejects(
    operations.upload(uploadInput),
    (error) => error instanceof MediaManagementError
      && error.code === "UPLOAD_FAILED"
      && error.message === "The image could not be uploaded. Please try again."
      && !error.message.includes("api_secret"),
  );
  assert.deepEqual(state.inserted, []);
});

test("upload removes the new Cloudinary resource when database persistence fails", async () => {
  const { operations, state } = fixture({
    repository: { insert: async () => { throw new Error("database unavailable"); } },
  });

  await assert.rejects(operations.upload(uploadInput), /could not be saved/i);
  assert.deepEqual(state.destroyed, ["inbcn/media/new"]);
});

test("replace keeps the media id and removes the previous Cloudinary resource", async () => {
  const { operations, state } = fixture();

  const result = await operations.replace("media-1", { ...uploadInput, checksum: "checksum-2" });

  assert.equal(result.id, "media-1");
  assert.equal(state.updated[0].id, "media-1");
  assert.deepEqual(state.destroyed, ["inbcn/media/old"]);
});

test("operations expose no user-requested hard deletion", async () => {
  const { operations, state } = fixture();
  assert.equal("remove" in operations, false);
  assert.deepEqual(state.destroyed, []);
});
