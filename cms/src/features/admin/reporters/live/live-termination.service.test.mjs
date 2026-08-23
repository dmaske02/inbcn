import assert from "node:assert/strict";
import test from "node:test";

import {
  LiveTerminationError,
  createLiveTerminationService,
} from "./live-termination.service.ts";

const requestId = "22222222-2222-4222-8222-222222222222";
const request = {
  id: requestId,
  status: "approved",
  profileId: "11111111-1111-4111-8111-111111111111",
  roomName: "reporter-live-22222222222242228222222222222222",
};

test("termination commits the database decision before using DB-owned identity and room cleanup", async () => {
  const calls = [];
  let current = request;
  const service = createLiveTerminationService({
    get: async () => { calls.push(["get"]); return current; },
    terminate: async (id, reason) => { calls.push(["terminate", id, reason]); current = { ...current, status: "terminated" }; },
    cleanup: async (input) => { calls.push(["cleanup", input]); },
  });
  await service.terminate({ role: "admin" }, requestId, "Immediate safety concern");
  assert.deepEqual(calls, [
    ["get"],
    ["terminate", requestId, "Immediate safety concern"],
    ["get"],
    ["cleanup", { profileId: request.profileId, roomName: request.roomName }],
  ]);
});

test("a repeated request retries provider cleanup after the row is already terminal", async () => {
  const calls = [];
  const service = createLiveTerminationService({
    get: async () => ({ ...request, status: "terminated" }),
    terminate: async () => { throw new Error("must not change the terminal decision"); },
    cleanup: async (input) => { calls.push(input); },
  });
  await service.terminate({ role: "admin" }, requestId, "Different client text is ignored after termination");
  assert.deepEqual(calls, [{ profileId: request.profileId, roomName: request.roomName }]);
});

test("provider failure stays retryable without exposing its detail", async () => {
  const service = createLiveTerminationService({
    get: async () => ({ ...request, status: "terminated" }),
    terminate: async () => {},
    cleanup: async () => { throw new Error("provider credential leaked"); },
  });
  await assert.rejects(
    () => service.terminate({ role: "admin" }, requestId, "Immediate safety concern"),
    (error) => error instanceof LiveTerminationError
      && error.code === "UNAVAILABLE"
      && error.message === "The live broadcast was ended, but provider cleanup will be retried.",
  );
});
