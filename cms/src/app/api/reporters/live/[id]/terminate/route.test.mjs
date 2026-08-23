import assert from "node:assert/strict";
import test from "node:test";

import { createTerminationHandler } from "./route.ts";

test("termination route authorizes, validates, and never exposes auth, params, or provider exceptions", async () => {
  const authFailure = await createTerminationHandler({ authorize: async () => { throw new Error("auth secret"); }, terminate: async () => {} })(new Request("https://cms.test"), { params: Promise.resolve({ id: requestId }) });
  const providerFailure = await createTerminationHandler({ authorize: async () => ({ ok: true, identity: { role: "admin" } }), terminate: async () => { throw new Error("provider secret"); } })(new Request("https://cms.test", { method: "POST", body: JSON.stringify({ reason: "Immediate safety concern" }) }), { params: Promise.resolve({ id: requestId }) });
  for (const response of [authFailure, providerFailure]) {
    assert.equal(response.status, 503);
    assert.match(response.headers.get("cache-control"), /no-store/u);
    assert.doesNotMatch(await response.text(), /secret/u);
  }
  const invalid = await createTerminationHandler({ authorize: async () => ({ ok: true, identity: { role: "admin" } }), terminate: async () => {} })(new Request("https://cms.test", { method: "POST", body: JSON.stringify({ reason: "x" }) }), { params: Promise.resolve({ id: "bad" }) });
  assert.equal(invalid.status, 400);
});

const requestId = "22222222-2222-4222-8222-222222222222";
