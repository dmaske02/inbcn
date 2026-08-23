import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { WebhookReceiver } from "livekit-server-sdk";

import {
  LiveKitWebhookError,
  createLiveKitWebhookService,
  mapEgressStatus,
} from "./livekit-webhook.service.ts";
import { createLiveKitWebhookHandler } from "../../app/api/webhooks/livekit/route.ts";

const eventId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const recordingId = "33333333-3333-4333-8333-333333333333";
const egressId = "EG_7NCpLh8J2h2v";
const roomName = `reporter-live-${requestId.replaceAll("-", "")}`;
const storageKey = `reporter-live/${requestId}/${recordingId}.mp4`;
const startedAt = 1_787_382_000_000_000_000n;
const endedAt = 1_787_382_012_345_000_000n;

function webhook(overrides = {}) {
  const { egressInfo: egressOverrides, ...eventOverrides } = overrides;
  const file = {
    filename: storageKey,
    location: `s3://private-recordings/${storageKey}`,
    startedAt,
    endedAt,
    duration: 12_345_000_000n,
    size: 4_096n,
  };
  return {
    id: eventId,
    event: "egress_ended",
    createdAt: 1_787_382_013n,
    egressInfo: {
      egressId,
      roomName,
      status: 3,
      startedAt,
      endedAt,
      updatedAt: endedAt,
      fileResults: [file],
      streamResults: [],
      segmentResults: [],
      imageResults: [],
      error: "provider detail must not persist",
      details: "provider detail must not persist",
      manifestLocation: "https://private.invalid/manifest.json",
      ...egressOverrides,
    },
    ...eventOverrides,
  };
}

function setup(event = webhook(), overrides = {}) {
  const calls = [];
  const repository = {
    claimWebhook: async (input) => {
      calls.push(["claim", input]);
      return { state: "claimed", token: "44444444-4444-4444-8444-444444444444" };
    },
    getRecordingTarget: async (input) => {
      calls.push(["target", input]);
      return {
        recordingId,
        requestId,
        roomName,
        storageKey,
        recordingStatus: "recording",
      };
    },
    completeWebhook: async (input) => {
      calls.push(["complete", input]);
      return { state: "updated" };
    },
    failWebhook: async (input) => {
      calls.push(["fail", input]);
      return true;
    },
    ...overrides.repository,
  };
  const service = createLiveKitWebhookService({
    receiver: overrides.receiver ?? { receive: async () => event },
    repository,
    now: overrides.now ?? (() => "2026-08-22T07:00:20.000Z"),
  });
  return { calls, service };
}

test("maps installed LiveKit 2.17 numeric statuses without string aliases", () => {
  assert.equal(mapEgressStatus(0), "recording");
  assert.equal(mapEgressStatus(1), "recording");
  assert.equal(mapEgressStatus(2), "recording");
  assert.equal(mapEgressStatus(3), "completed");
  assert.equal(mapEgressStatus(4), "failed");
  assert.equal(mapEgressStatus(5), "failed");
  assert.equal(mapEgressStatus(6), "failed");
  assert.equal(mapEgressStatus("EGRESS_COMPLETE"), null);
});

test("the real WebhookReceiver rejects an invalid signed hash before any receipt write", async () => {
  const { service, calls } = setup(webhook(), {
    receiver: new WebhookReceiver("dev-key", "dev-secret"),
  });

  await assert.rejects(
    service.process(JSON.stringify({ id: eventId, event: "egress_ended" }), "Bearer invalid"),
    (error) => error instanceof LiveKitWebhookError
      && error.code === "invalid-webhook-signature"
      && error.httpStatus === 401,
  );
  assert.deepEqual(calls, []);
});

test("valid unrelated signed events are ignored without a receipt or provider payload write", async () => {
  const { service, calls } = setup({ id: eventId, event: "room_started", createdAt: 1_787_382_013n });

  assert.deepEqual(await service.process("opaque signed body", "Bearer valid"), {
    duplicate: false,
    status: "ignored",
  });
  assert.deepEqual(calls, []);
});

test("processed duplicates succeed and active leases stay retryable", async () => {
  for (const [state, expected] of [
    ["processed", { duplicate: true, status: "processed" }],
    ["busy", { duplicate: true, status: "processing" }],
  ]) {
    const { service, calls } = setup(webhook(), {
      repository: { claimWebhook: async (input) => {
        calls.push(["claim", input]);
        return { state };
      } },
    });
    assert.deepEqual(await service.process("signed", "Bearer valid"), expected);
    assert.equal(calls.length, 1);
  }
});

test("a successful end accepts one exact MP4 and forwards only bounded safe facts", async () => {
  const { service, calls } = setup();

  assert.deepEqual(await service.process("signed", "Bearer valid"), {
    duplicate: false,
    status: "completed",
  });
  assert.deepEqual(calls[0], ["claim", {
    eventId,
    eventType: "egress_ended",
    egressId,
  }]);
  assert.deepEqual(calls[1], ["target", { egressId }]);
  const completion = calls[2][1];
  assert.deepEqual(completion, {
    eventId,
    processingToken: "44444444-4444-4444-8444-444444444444",
    eventType: "egress_ended",
    egressId,
    recordingId,
    requestId,
    roomName,
    status: "completed",
    storageKey,
    durationSeconds: 12.345,
    bytes: 4_096,
    providerStartedAt: "2026-08-22T07:00:00.000Z",
    providerEndedAt: "2026-08-22T07:00:12.345Z",
    providerUpdatedAt: "2026-08-22T07:00:12.345Z",
    failureCode: null,
  });
  assert.doesNotMatch(JSON.stringify(completion), /provider detail|manifest|location|s3:\/\//u);
});

test("started and updated events preserve recording state without accepting output facts", async () => {
  for (const [eventType, status] of [["egress_started", 1], ["egress_updated", 2]]) {
    const { service, calls } = setup(webhook({
      event: eventType,
      egressInfo: {
        status,
        endedAt: 0n,
        updatedAt: startedAt + 1_000_000_000n,
        fileResults: [],
      },
    }));
    assert.deepEqual(await service.process("signed", "Bearer valid"), {
      duplicate: false,
      status: "recording",
    });
    assert.equal(calls.at(-1)[1].status, "recording");
    assert.equal(calls.at(-1)[1].storageKey, null);
    assert.equal(calls.at(-1)[1].durationSeconds, null);
    assert.equal(calls.at(-1)[1].bytes, null);
  }
});

test("terminal failure ends persist fixed safe codes without provider errors or partial file facts", async () => {
  for (const [status, failureCode] of [
    [4, "provider-egress-failed"],
    [5, "provider-egress-aborted"],
    [6, "provider-egress-limit-reached"],
  ]) {
    const { service, calls } = setup(webhook({ egressInfo: { status, fileResults: [] } }));
    assert.deepEqual(await service.process("signed", "Bearer valid"), {
      duplicate: false,
      status: "failed",
    });
    const completion = calls.at(-1)[1];
    assert.equal(completion.failureCode, failureCode);
    assert.equal(completion.storageKey, null);
    assert.equal(completion.durationSeconds, null);
    assert.equal(completion.bytes, null);
    assert.equal(JSON.stringify(completion).includes("provider detail"), false);
  }

  const { service, calls } = setup(webhook({ egressInfo: { status: 6 } }));
  await assert.rejects(
    service.process("signed", "Bearer valid"),
    (error) => error instanceof LiveKitWebhookError && error.code === "webhook-payload-mismatch",
  );
  assert.equal(calls.some(([name]) => name === "complete"), false);
});

test("exact egress, room, key, file count, status, size, duration, and timestamps fail closed", async () => {
  const invalidEvents = [
    webhook({ egressInfo: { egressId: "" } }),
    webhook({ egressInfo: { roomName: `${roomName}-other` } }),
    webhook({ egressInfo: { status: 1 } }),
    webhook({ egressInfo: { fileResults: [] } }),
    webhook({ egressInfo: { fileResults: [webhook().egressInfo.fileResults[0], webhook().egressInfo.fileResults[0]] } }),
    webhook({ egressInfo: { fileResults: [{ ...webhook().egressInfo.fileResults[0], filename: `${storageKey}.bak` }] } }),
    webhook({ egressInfo: { fileResults: [{ ...webhook().egressInfo.fileResults[0], location: `s3://private-recordings/${storageKey}.bak` }] } }),
    webhook({ egressInfo: { fileResults: [{ ...webhook().egressInfo.fileResults[0], duration: 0n }] } }),
    webhook({ egressInfo: { fileResults: [{ ...webhook().egressInfo.fileResults[0], size: 0n }] } }),
    webhook({ egressInfo: { endedAt: startedAt - 1n, updatedAt: startedAt - 1n } }),
  ];

  for (const invalid of invalidEvents) {
    const { service, calls } = setup(invalid);
    await assert.rejects(
      service.process("signed", "Bearer valid"),
      (error) => error instanceof LiveKitWebhookError && error.code === "webhook-payload-mismatch",
    );
    const failure = calls.find(([name]) => name === "fail");
    if (failure) assert.equal(failure[1].failureCode, "payload-mismatch");
    assert.equal(calls.some(([name]) => name === "complete"), false);
  }
});

test("the service refuses a DB target whose canonical request/key association differs", async () => {
  for (const target of [
    { recordingId, requestId, roomName: `${roomName}-other`, storageKey, recordingStatus: "recording" },
    { recordingId, requestId, roomName, storageKey: `${storageKey}.bak`, recordingStatus: "recording" },
  ]) {
    const { service, calls } = setup(webhook(), {
      repository: { getRecordingTarget: async () => target },
    });
    await assert.rejects(service.process("signed", "Bearer valid"));
    assert.equal(calls.some(([name]) => name === "complete"), false);
  }
});

test("stale out-of-order callbacks are acknowledged only after the repository atomically processes the receipt", async () => {
  const { service, calls } = setup(webhook(), {
    repository: { completeWebhook: async (input) => {
      calls.push(["complete", input]);
      return { state: "stale" };
    } },
  });
  assert.deepEqual(await service.process("signed", "Bearer valid"), {
    duplicate: false,
    status: "stale",
  });
  assert.equal(calls.at(-1)[0], "complete");
});

test("the route enforces webhook media type, Authorization, one MiB raw bodies, no-store, and retryable busy", async () => {
  let calls = 0;
  const handler = createLiveKitWebhookHandler({ process: async () => {
    calls += 1;
    return { duplicate: true, status: "processing" };
  } });
  for (const request of [
    new Request("https://reporter.inbcn.com/api/webhooks/livekit", { method: "POST", headers: { authorization: "Bearer valid" }, body: "{}" }),
    new Request("https://reporter.inbcn.com/api/webhooks/livekit", { method: "POST", headers: { "content-type": "application/webhook+json" }, body: "{}" }),
  ]) {
    const response = await handler(request);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  const tooLarge = await handler({
    headers: new Headers({
      authorization: "Bearer valid",
      "content-type": "application/webhook+json",
      "content-length": String(1024 * 1024 + 1),
    }),
    get body() { throw new Error("oversized stream must not be read"); },
  });
  assert.equal(tooLarge.status, 413);

  const busy = await handler(new Request("https://reporter.inbcn.com/api/webhooks/livekit", {
    method: "POST",
    headers: { authorization: "Bearer valid", "content-type": "application/webhook+json" },
    body: "{}",
  }));
  assert.equal(busy.status, 503);
  assert.equal(busy.headers.get("retry-after"), "60");
  assert.equal(busy.headers.get("cache-control"), "no-store");
  assert.equal(calls, 1);
});

test("the additive SQL makes receipt completion atomic, terminal monotonic, private, and fixed-alert only", async () => {
  const sql = (await readFile(new URL(
    "../../../../supabase/migrations/20260822163000_livekit_recording_review.sql",
    import.meta.url,
  ), "utf8")).replace(/\s+/gu, " ").toLowerCase();
  const complete = sql.slice(sql.indexOf("create function public.complete_livekit_webhook_event"), sql.indexOf("create function public.fail_livekit_webhook_event"));
  assert.match(sql, /create function public\.claim_livekit_webhook_event/u);
  const receiptLock = complete.indexOf("from public.webhook_events");
  const targetLookup = complete.indexOf("select live_request_id into target_request_id");
  const requestLock = complete.indexOf("from public.reporter_live_requests", targetLookup);
  const recordingLock = complete.indexOf("from public.live_recordings", requestLock);
  assert.ok(receiptLock >= 0 && targetLookup > receiptLock && requestLock > targetLookup && recordingLock > requestLock);
  assert.doesNotMatch(complete.slice(targetLookup, requestLock), /for update/u);
  assert.match(complete.slice(requestLock, recordingLock), /for update/u);
  assert.match(complete.slice(recordingLock), /for update/u);
  assert.match(complete, /current_recording\.live_request_id is distinct from current_request\.id/u);
  assert.match(complete, /current_recording\.egress_id is distinct from current_event\.provider_subject_id/u);
  assert.match(complete, /current_recording\.recording_status in \('completed', 'failed'\).*processing_status = 'processed'/u);
  assert.match(complete, /provider-egress-limit-reached/u);
  assert.match(complete, /reporter-live\/.*current_request\.id::text.*current_recording\.id::text.*[.]mp4/u);
  assert.match(complete, /'a reporter live recording requires editorial attention[.]'/u);
  assert.doesNotMatch(complete, /p_provider_error|p_location|manifest|room_sid|authorization|raw_body/u);
  assert.match(sql, /revoke all on function public\.claim_livekit_webhook_event\(uuid, text, text\) from public, anon, authenticated, service_role/u);
  assert.match(sql, /grant execute on function public\.claim_livekit_webhook_event\(uuid, text, text\) to service_role/u);
});
