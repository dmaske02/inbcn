import assert from "node:assert/strict";
import test from "node:test";

import {
  KycServiceError,
  createApplicationDraftService,
  createApplicationService,
} from "./application.service.ts";

function serviceFixture(overrides = {}) {
  const calls = [];
  const events = new Set();
  const application = {
    id: "11111111-1111-4111-8111-111111111111",
    profileId: "22222222-2222-4222-8222-222222222222",
    status: "kyc_pending",
    kycStatus: "failed",
  };
  const repository = {
    findOwnedApplication: async () => application,
    markKycStarted: async (input) => { calls.push(["start", input]); return true; },
    claimKycWebhook: async (input) => {
      calls.push(["claim", input]);
      if (events.has(input.eventId)) return "processed";
      events.add(input.eventId);
      return "claimed";
    },
    findApplicationByKycReference: async () => application,
    applyKycResult: async (input) => { calls.push(["transition", input]); return true; },
    completeKycWebhook: async (input) => { calls.push(["complete", input]); },
    failKycWebhook: async (input) => { calls.push(["fail", input]); },
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
  assert.equal(calls[0][0], "start");
  assert.equal(calls[0][1].reference, "opaque-reference");
  assert.equal("rawBody" in calls[0][1], false);
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
  assert.equal(transitions[0][1].applicationStatus, "under_review");
  assert.equal(transitions[0][1].kycStatus, "verified");
  assert.equal(transitions[0][1].adult, true);
  assert.equal(transitions[0][1].legalName, "Ananya Patil");
  assert.equal(transitions[0][1].processedAt, "2026-08-22T12:01:00.000Z");
  assert.doesNotMatch(JSON.stringify(calls), /aadhaar|do-not-store|rawBody/iu);
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
    assert.equal(transition.applicationStatus, "kyc_pending");
    assert.equal(transition.kycStatus, "failed");
    assert.equal(transition.legalName, null);
  }
});

test("stores a separately uploaded portrait and all consent receipts on the draft", async () => {
  const state = { application: null, receipts: [] };
  const save = createApplicationDraftService({
    uploadPortrait: async () => ({ publicId: "inbcn/reporter/portrait/generated", secureUrl: "https://res.cloudinary.com/demo/portrait.jpg" }),
    insertApplication: async (input) => {
      state.application = input;
      return { id: "11111111-1111-4111-8111-111111111111", status: "draft" };
    },
    insertConsents: async (_applicationId, _profileId, receipts) => { state.receipts.push(...receipts); },
    destroyPortrait: async () => {},
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
  assert.equal(state.application.publicPhotoId, "inbcn/reporter/portrait/generated");
  assert.equal(state.application.fields, fields);
  assert.deepEqual(state.receipts, receipts);
});
