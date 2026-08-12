import assert from "node:assert/strict";
import test from "node:test";

import { createViewerSessionService } from "./viewer.service-core.ts";

const activeParticipant = {
  identity: "reporter-en",
  state: 2,
  attributes: { role: "broadcaster" },
  tracks: [{ type: 1 }],
};

function dependencies(overrides = {}) {
  const calls = { tokens: [], participants: [] };
  return {
    calls,
    values: {
      listActiveRooms: async () => [
        { sid: "RM_1", name: "broadcast-en", language: "en", participantCount: 1 },
      ],
      listParticipants: async (roomName) => {
        calls.participants.push(roomName);
        return [activeParticipant];
      },
      generateViewerToken: async (input) => {
        calls.tokens.push(input);
        return "viewer-token";
      },
      getServerUrl: () => "wss://livekit.example.com",
      createViewerIdentity: () => "viewer-unique-123",
      ...overrides,
    },
  };
}

test("active room inspection creates a viewer session with the Phase 1 token service", async () => {
  const setup = dependencies();
  const service = createViewerSessionService(setup.values);
  const result = await service.getViewerSession("en");

  assert.deepEqual(result, {
    active: true,
    session: {
      serverUrl: "wss://livekit.example.com",
      token: "viewer-token",
      roomName: "broadcast-en",
      broadcasterIdentity: "reporter-en",
    },
  });
  assert.deepEqual(setup.calls.participants, ["broadcast-en"]);
  assert.deepEqual(setup.calls.tokens, [{
    identity: "viewer-unique-123",
    language: "en",
    role: "viewer",
  }]);
});

test("room creation, viewer-only rooms, and broadcasters without media stay offline", async () => {
  for (const participants of [
    [],
    [{ ...activeParticipant, attributes: { role: "viewer" } }],
    [{ ...activeParticipant, tracks: [] }],
  ]) {
    const setup = dependencies({ listParticipants: async () => participants });
    const result = await createViewerSessionService(setup.values).getViewerSession("en");
    assert.deepEqual(result, { active: false });
    assert.equal(setup.calls.tokens.length, 0);
  }
});

test("a missing language room stays offline without participant inspection", async () => {
  let inspected = false;
  const setup = dependencies({
    listActiveRooms: async () => [],
    listParticipants: async () => { inspected = true; return []; },
  });
  assert.deepEqual(
    await createViewerSessionService(setup.values).getViewerSession("hi"),
    { active: false },
  );
  assert.equal(inspected, false);
});

test("room, participant, configuration, and token failures fail closed", async () => {
  const failures = [
    { listActiveRooms: async () => { throw new Error("rooms"); } },
    { listParticipants: async () => { throw new Error("participants"); } },
    { getServerUrl: () => { throw new Error("config"); } },
    { generateViewerToken: async () => { throw new Error("token"); } },
  ];
  for (const failure of failures) {
    const setup = dependencies(failure);
    assert.deepEqual(
      await createViewerSessionService(setup.values).getViewerSession("en"),
      { active: false },
    );
  }
});
