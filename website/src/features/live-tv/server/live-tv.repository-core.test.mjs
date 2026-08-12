import assert from "node:assert/strict";
import test from "node:test";

import { createLiveTvRepositoryCore } from "./live-tv.repository-core.ts";

function store() {
  const calls = [];
  return {
    calls,
    adapter: {
      findById: async (id) => (calls.push(["findById", id]), { id }),
      findByLanguage: async (languageCode) =>
        (calls.push(["findByLanguage", languageCode]), { id: "localized" }),
      findSchedule: async (id) =>
        (calls.push(["findSchedule", id]), { id, starts_at: null, ends_at: null }),
      insert: async (value) => (calls.push(["insert", value]), { id: "created", ...value }),
      update: async (id, value) => (calls.push(["update", id, value]), { id, ...value }),
      remove: async (id) => calls.push(["remove", id]),
    },
  };
}

test("repository reads channels and schedules through focused adapter methods", async () => {
  const fake = store();
  const repository = createLiveTvRepositoryCore(fake.adapter);
  await repository.getLiveChannel("stream-1");
  await repository.getLiveChannelByLanguage("en");
  await repository.getLiveSchedule("stream-1");
  assert.deepEqual(fake.calls, [
    ["findById", "stream-1"],
    ["findByLanguage", "en"],
    ["findSchedule", "stream-1"],
  ]);
});

test("repository persists channel inserts and updates without business logic", async () => {
  const fake = store();
  const repository = createLiveTvRepositoryCore(fake.adapter);
  await repository.createLiveChannel({ title: "INBCN Live" });
  await repository.updateLiveChannel("stream-1", { title: "News Live" });
  assert.deepEqual(fake.calls, [
    ["insert", { title: "INBCN Live" }],
    ["update", "stream-1", { title: "News Live" }],
  ]);
});

test("schedule methods persist only explicit schedule patches", async () => {
  const fake = store();
  const repository = createLiveTvRepositoryCore(fake.adapter);
  const schedule = {
    status: "scheduled",
    starts_at: "2026-08-07T10:00:00.000Z",
    ends_at: null,
  };
  await repository.createSchedule("stream-1", schedule);
  await repository.updateSchedule("stream-1", {
    ends_at: "2026-08-07T12:00:00.000Z",
  });
  await repository.deleteSchedule("stream-1", { status: "draft" });
  assert.deepEqual(fake.calls, [
    ["update", "stream-1", schedule],
    ["update", "stream-1", { ends_at: "2026-08-07T12:00:00.000Z" }],
    [
      "update",
      "stream-1",
      { status: "draft", starts_at: null, ends_at: null },
    ],
  ]);
});

test("repository deletes a channel only through the explicit remove method", async () => {
  const fake = store();
  const repository = createLiveTvRepositoryCore(fake.adapter);
  await repository.deleteLiveChannel("stream-1");
  assert.deepEqual(fake.calls, [["remove", "stream-1"]]);
});
