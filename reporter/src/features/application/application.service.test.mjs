import assert from "node:assert/strict";
import test from "node:test";

import {
  KycServiceError,
  createApplicationDraftService,
  createApplicationService,
} from "./application.service.ts";

function serviceFixture(overrides = {}) {
  const calls = [];
  const events = new Map();
  let reservationToken = null;
  const application = {
    id: "11111111-1111-4111-8111-111111111111",
    profileId: "22222222-2222-4222-8222-222222222222",
    status: "kyc_pending",
    kycStatus: "failed",
  };
  const repository = {
    reserveKycStart: async (input) => {
      calls.push(["reserve", input]);
      if (reservationToken) return null;
      reservationToken = "33333333-3333-4333-8333-333333333333";
      return reservationToken;
    },
    completeKycStart: async (input) => {
      calls.push(["start", input]);
      if (input.reservationToken !== reservationToken) return false;
      reservationToken = null;
      return true;
    },
    releaseKycStart: async (input) => {
      calls.push(["release", input]);
      if (input.reservationToken !== reservationToken) return false;
      reservationToken = null;
      return true;
    },
    claimKycWebhook: async (input) => {
      calls.push(["claim", input]);
      const existing = events.get(input.eventId);
      if (existing?.status === "processed") return { state: "processed" };
      if (existing?.status === "pending") return { state: "busy" };
      const attemptCount = (existing?.attemptCount ?? 0) + 1;
      const token = `44444444-4444-4444-8444-${String(attemptCount).padStart(12, "0")}`;
      events.set(input.eventId, { status: "pending", token, attemptCount });
      return { state: "claimed", token };
    },
    completeKycWebhook: async (input) => {
      calls.push(["transition", input]);
      calls.push(["complete", input]);
      const event = events.get(input.eventId);
      if (!event || event.status !== "pending" || event.token !== input.processingToken) return false;
      event.status = "processed";
      return true;
    },
    failKycWebhook: async (input) => {
      calls.push(["fail", input]);
      const event = events.get(input.eventId);
      if (!event || event.status !== "pending" || event.token !== input.processingToken) return false;
      event.status = "failed";
      return true;
    },
    ...overrides.repository,
  };
  const provider = overrides.provider === undefined ? {
    createSession: async () => ({
      url: "https://kyc.example/session/opaque",
      reference: "opaque-reference",
    }),
    verifyWebhook: () => ({
      eventId: "evt-1",
      reference: "opaque-reference",
      status: "verified",
      legalName: "Ananya Patil",
      adult: true,
      verifiedAt: "2026-08-22T12:00:00.000Z",
    }),
  } : overrides.provider;
  return {
    application,
    calls,
    events,
    repository,
    service: createApplicationService({
      repository,
      provider,
      providerName: "approved-hosted-provider",
      now: () => "2026-08-22T12:01:00.000Z",
      returnUrl: "https://reporter.inbcn.com/application",
    }),
  };
}

test("returns the real disabled KYC gate without creating a session", async () => {
  const { service } = serviceFixture({ provider: null });
  await assert.rejects(
    service.startKycSession("22222222-2222-4222-8222-222222222222", "11111111-1111-4111-8111-111111111111"),
    (error) => error instanceof KycServiceError && error.code === "kyc-not-configured" && error.httpStatus === 503,
  );
});

test("allows an owned failed KYC attempt to restart while the application remains pending", async () => {
  const { calls, service } = serviceFixture();
  const session = await service.startKycSession(
    "22222222-2222-4222-8222-222222222222",
    "11111111-1111-4111-8111-111111111111",
  );

  assert.deepEqual(session, { url: "https://kyc.example/session/opaque" });
  assert.deepEqual(calls.map(([name]) => name), ["reserve", "start"]);
  assert.equal(calls[1][1].reference, "opaque-reference");
  assert.equal(calls[1][1].reservationToken, "33333333-3333-4333-8333-333333333333");
  assert.equal("rawBody" in calls[1][1], false);
});

test("reserves KYC start before the provider call so concurrent starts create one session", async () => {
  let createCount = 0;
  let releaseProvider;
  const providerReady = Promise.withResolvers();
  const providerDone = new Promise((resolve) => { releaseProvider = resolve; });
  const { service } = serviceFixture({
    provider: {
      createSession: async () => {
        createCount += 1;
        providerReady.resolve();
        await providerDone;
        return { url: "https://kyc.example/session/opaque", reference: "opaque-reference" };
      },
      verifyWebhook: () => { throw new Error("not used"); },
    },
  });
  const profileId = "22222222-2222-4222-8222-222222222222";
  const applicationId = "11111111-1111-4111-8111-111111111111";

  const first = service.startKycSession(profileId, applicationId);
  await providerReady.promise;
  await assert.rejects(
    service.startKycSession(profileId, applicationId),
    (error) => error instanceof KycServiceError && error.code === "invalid-state",
  );
  releaseProvider();
  await first;
  assert.equal(createCount, 1);
});

test("releases the exact KYC start reservation when provider creation fails", async () => {
  const { calls, service } = serviceFixture({
    provider: {
      createSession: async () => { throw new Error("provider secret detail"); },
      verifyWebhook: () => { throw new Error("not used"); },
    },
  });

  await assert.rejects(service.startKycSession(
    "22222222-2222-4222-8222-222222222222",
    "11111111-1111-4111-8111-111111111111",
  ));
  const release = calls.find(([name]) => name === "release")[1];
  assert.equal(release.reservationToken, "33333333-3333-4333-8333-333333333333");
});

test("rejects invalid webhook signatures before any receipt or transition", async () => {
  const { calls, service } = serviceFixture({
    provider: {
      createSession: async () => { throw new Error("not used"); },
      verifyWebhook: () => { throw new Error("bad signature with secret payload"); },
    },
  });

  await assert.rejects(
    service.processKycWebhook({ rawBody: '{"aadhaar":"do-not-store"}', signature: "bad" }),
    (error) => error instanceof KycServiceError && error.code === "invalid-kyc-signature" && error.httpStatus === 401,
  );
  assert.deepEqual(calls, []);
});

test("records a verified adult legal-name result once without persisting the raw body", async () => {
  const { calls, service } = serviceFixture();
  const input = { rawBody: '{"aadhaar":"do-not-store"}', signature: "valid" };

  assert.deepEqual(await service.processKycWebhook(input), { duplicate: false, status: "verified" });
  assert.deepEqual(await service.processKycWebhook(input), { duplicate: true, status: "processed" });

  const transitions = calls.filter(([name]) => name === "transition");
  assert.equal(transitions.length, 1);
  assert.equal(transitions[0][1].verified, true);
  assert.equal(transitions[0][1].adult, true);
  assert.equal(transitions[0][1].legalName, "Ananya Patil");
  assert.equal(transitions[0][1].verifiedAt, "2026-08-22T12:00:00.000Z");
  assert.equal("processedAt" in transitions[0][1], false);
  assert.doesNotMatch(JSON.stringify(calls), /aadhaar|do-not-store|rawBody/iu);
});

test("marks unexpected post-claim failures failed so a valid retry can reclaim them", async () => {
  let applyAttempts = 0;
  const { calls, events, service } = serviceFixture({
    repository: {
      completeKycWebhook: async (input) => {
        calls.push(["transition", input]);
        applyAttempts += 1;
        if (applyAttempts === 1) throw new Error("database temporarily unavailable");
        const event = events.get(input.eventId);
        if (!event || event.status !== "pending" || event.token !== input.processingToken) return false;
        event.status = "processed";
        return true;
      },
    },
  });
  const input = { rawBody: "{}", signature: "valid" };

  await assert.rejects(service.processKycWebhook(input));
  assert.equal(events.get("evt-1").status, "failed");
  assert.deepEqual(await service.processKycWebhook(input), { duplicate: false, status: "verified" });
  assert.equal(events.get("evt-1").status, "processed");
  assert.equal(events.get("evt-1").attemptCount, 2);
  assert.equal(calls.filter(([name]) => name === "transition").length, 2);
});

test("acknowledges an actively processed webhook without running a second processor", async () => {
  const { calls, service } = serviceFixture({
    repository: {
      claimKycWebhook: async () => ({ state: "busy" }),
    },
  });

  assert.deepEqual(await service.processKycWebhook({ rawBody: "{}", signature: "valid" }), {
    duplicate: true,
    status: "processing",
  });
  assert.equal(calls.some(([name]) => name === "transition"), false);
});

test("keeps the application KYC-pending when adult or legal-name verification is absent", async () => {
  for (const result of [
    { eventId: "evt-adult", reference: "opaque-reference", status: "verified", legalName: "Ananya Patil", adult: false, verifiedAt: "2026-08-22T12:00:00.000Z" },
    { eventId: "evt-name", reference: "opaque-reference", status: "verified", adult: true, verifiedAt: "2026-08-22T12:00:00.000Z" },
  ]) {
    const { calls, service } = serviceFixture({
      provider: {
        createSession: async () => { throw new Error("not used"); },
        verifyWebhook: () => result,
      },
    });
    assert.deepEqual(await service.processKycWebhook({ rawBody: "{}", signature: "valid" }), {
      duplicate: false,
      status: "failed",
    });
    const transition = calls.find(([name]) => name === "transition")[1];
    assert.equal(transition.verified, false);
    assert.equal(transition.legalName, null);
  }
});

test("stores a separately uploaded portrait and all consent receipts on the draft", async () => {
  const state = { application: null, receipts: [] };
  const save = createApplicationDraftService({
    randomId: () => "11111111-1111-4111-8111-111111111111",
    uploadPortrait: async (_portrait, applicationId) => ({ publicId: `inbcn/reporter/portrait/${applicationId}`, secureUrl: "https://res.cloudinary.com/demo/portrait.jpg" }),
    insertApplication: async (input) => {
      state.application = input;
      return { id: "11111111-1111-4111-8111-111111111111", status: "draft" };
    },
    recoverApplication: async () => null,
    isPortraitReferenced: async () => false,
    insertConsents: async (_applicationId, _profileId, receipts) => { state.receipts.push(...receipts); },
    destroyPortrait: async () => {},
    reportCleanupFailure: () => {},
  });
  const fields = {
    legalName: "Ananya Patil",
    dateOfBirth: "2000-04-12",
    age18Declared: true,
    homeCity: "Pune",
    homeDistrict: "Pune",
    homeState: "Maharashtra",
    bio: "Local reporter",
    beats: ["civic"],
  };
  const receipts = [
    { key: "payment_refund", version: "1.0", locale: "en", consentedAt: "2026-08-22T10:00:00.000Z" },
  ];

  const application = await save({ profileId: "22222222-2222-4222-8222-222222222222", fields, receipts, portrait: {} });

  assert.equal(application.status, "draft");
  assert.equal(state.application.applicationId, "11111111-1111-4111-8111-111111111111");
  assert.equal(state.application.publicPhotoId, "inbcn/reporter/portrait/11111111-1111-4111-8111-111111111111");
  assert.equal(state.application.fields, fields);
  assert.deepEqual(state.receipts, receipts);
});

test("recovers a committed draft after response loss and never destroys its referenced portrait", async () => {
  const calls = [];
  const committed = { id: "11111111-1111-4111-8111-111111111111", status: "draft" };
  const save = createApplicationDraftService({
    randomId: () => committed.id,
    uploadPortrait: async (_portrait, applicationId) => ({
      publicId: `inbcn/reporter/portrait/${applicationId}`,
      secureUrl: "https://res.cloudinary.com/demo/portrait.jpg",
    }),
    insertApplication: async () => { throw new Error("response lost after commit"); },
    recoverApplication: async (input) => {
      calls.push(["recover", input]);
      return committed;
    },
    isPortraitReferenced: async () => { throw new Error("must not run"); },
    insertConsents: async () => { calls.push(["consents"]); },
    destroyPortrait: async () => { calls.push(["destroy"]); },
    reportCleanupFailure: (publicId) => { calls.push(["reconcile", publicId]); },
  });

  assert.deepEqual(await save({
    profileId: "22222222-2222-4222-8222-222222222222",
    fields: {},
    receipts: [],
    portrait: {},
  }), committed);
  assert.equal(calls.some(([name]) => name === "destroy"), false);
  assert.equal(calls.some(([name]) => name === "consents"), true);
});

test("destroys a portrait after a definite insert rejection and authoritative no-reference proof", async () => {
  const calls = [];
  const insertError = Object.assign(new Error("constraint rejected"), { definite: true });
  const save = createApplicationDraftService({
    randomId: () => "11111111-1111-4111-8111-111111111111",
    uploadPortrait: async () => ({
      publicId: "inbcn/reporter/portrait/11111111-1111-4111-8111-111111111111",
      secureUrl: "https://res.cloudinary.com/demo/portrait.jpg",
    }),
    insertApplication: async () => { throw insertError; },
    recoverApplication: async () => { throw new Error("definite failures do not recover by id"); },
    isPortraitReferenced: async (publicId) => { calls.push(["reference", publicId]); return false; },
    insertConsents: async () => {},
    destroyPortrait: async (publicId) => { calls.push(["destroy", publicId]); },
    reportCleanupFailure: (publicId) => { calls.push(["reconcile", publicId]); },
  });

  await assert.rejects(save({ profileId: "profile", fields: {}, receipts: [], portrait: {} }), insertError);
  assert.deepEqual(calls.map(([name]) => name), ["reference", "destroy"]);
});

test("an ambiguous insert with an unavailable authoritative reread queues reconciliation without deletion", async () => {
  const calls = [];
  const save = createApplicationDraftService({
    randomId: () => "11111111-1111-4111-8111-111111111111",
    uploadPortrait: async () => ({
      publicId: "inbcn/reporter/portrait/11111111-1111-4111-8111-111111111111",
      secureUrl: "https://res.cloudinary.com/demo/portrait.jpg",
    }),
    insertApplication: async () => { throw new Error("response lost"); },
    recoverApplication: async () => { throw new Error("database unavailable"); },
    isPortraitReferenced: async () => { throw new Error("must not run"); },
    insertConsents: async () => {},
    destroyPortrait: async () => { calls.push(["destroy"]); },
    reportCleanupFailure: (publicId) => { calls.push(["reconcile", publicId]); },
  });

  await assert.rejects(save({ profileId: "profile", fields: {}, receipts: [], portrait: {} }));
  assert.deepEqual(calls, [["reconcile", "inbcn/reporter/portrait/11111111-1111-4111-8111-111111111111"]]);
});
