import assert from "node:assert/strict";
import test from "node:test";

import { createMediaOperations, MediaManagementError } from "./media.operations.ts";

const uploadInput = {
  file: { name: "news.jpg", type: "image/jpeg", size: 5, bytes: new Uint8Array([1, 2, 3, 4, 5]) },
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
    deleted: [],
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
    countStoryReferences: async () => 0,
    delete: async (id) => {
      state.deleted.push(id);
    },
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
        bytes: 5,
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

test("delete refuses media that is referenced by a story", async () => {
  const { operations, state } = fixture({
    repository: { countStoryReferences: async () => 2 },
  });

  await assert.rejects(
    operations.remove("media-1"),
    (error) => error instanceof MediaManagementError && error.code === "IN_USE",
  );
  assert.deepEqual(state.deleted, []);
  assert.deepEqual(state.destroyed, []);
});

test("delete removes database metadata before the unreferenced Cloudinary resource", async () => {
  const { operations, state } = fixture();

  await operations.remove("media-1");

  assert.deepEqual(state.deleted, ["media-1"]);
  assert.deepEqual(state.destroyed, ["inbcn/media/old"]);
});
