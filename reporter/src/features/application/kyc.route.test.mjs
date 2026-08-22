import assert from "node:assert/strict";
import test from "node:test";

import { KycServiceError } from "./application.service.ts";
import { createKycCallbackHandler } from "../../app/api/kyc/callback/route.ts";
import { createKycStartHandler } from "../../app/api/kyc/start/route.ts";

test("the authenticated KYC start route returns the disabled 503 gate", async () => {
  const handler = createKycStartHandler({
    authorize: async () => ({ ok: true, state: "applicant", userId: "22222222-2222-4222-8222-222222222222" }),
    start: async () => { throw new KycServiceError("kyc-not-configured", 503, "Hosted identity verification is not configured."); },
  });
  const response = await handler(new Request("https://reporter.inbcn.com/api/kyc/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ applicationId: "11111111-1111-4111-8111-111111111111" }),
  }));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "kyc-not-configured" });
});

test("the KYC start route denies unauthenticated callers before starting", async () => {
  let started = false;
  const handler = createKycStartHandler({
    authorize: async () => ({ ok: false, reason: "unauthenticated" }),
    start: async () => { started = true; return { url: "https://should-not-run.example" }; },
  });
  const response = await handler(new Request("https://reporter.inbcn.com/api/kyc/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ applicationId: "11111111-1111-4111-8111-111111111111" }),
  }));

  assert.equal(response.status, 401);
  assert.equal(started, false);
});

test("the signed callback route maps invalid signatures to 401", async () => {
  const handler = createKycCallbackHandler({
    process: async () => { throw new KycServiceError("invalid-kyc-signature", 401, "The webhook signature is invalid."); },
  });
  const response = await handler(new Request("https://reporter.inbcn.com/api/kyc/callback", {
    method: "POST",
    headers: { "x-kyc-signature": "bad" },
    body: "opaque-body",
  }));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { code: "invalid-kyc-signature" });
});
