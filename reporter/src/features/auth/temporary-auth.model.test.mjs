import assert from "node:assert/strict";
import test from "node:test";

import { createTemporaryAuthService } from "./temporary-auth.model.ts";

test("1234 creates a confirmed phone user and establishes a session", async () => {
  const events = [];
  const service = createTemporaryAuthService({
    findUser: async () => null,
    createUser: async (input) => { events.push(["create", input]); return "user-1"; },
    rotatePassword: async () => { throw new Error("must not rotate a new user"); },
    ensureProfile: async (userId) => { events.push(["profile", userId]); },
    signIn: async (input) => { events.push(["sign-in", input.phone]); },
    randomPassword: () => "generated-private-password",
  });

  await service.signIn({ phone: "+919876543210", code: "1234" });

  assert.deepEqual(events.map(([name]) => name), ["create", "profile", "sign-in"]);
});

test("1234 rotates a returning user's password before sign-in", async () => {
  const events = [];
  const service = createTemporaryAuthService({
    findUser: async () => "user-1",
    createUser: async () => { throw new Error("must not create duplicate"); },
    rotatePassword: async () => { events.push("rotate"); },
    ensureProfile: async () => { events.push("profile"); },
    signIn: async () => { events.push("sign-in"); },
    randomPassword: () => "generated-private-password",
  });

  await service.signIn({ phone: "+919876543210", code: "1234" });

  assert.deepEqual(events, ["rotate", "profile", "sign-in"]);
});

test("temporary auth rejects every code except 1234 before user lookup", async () => {
  let lookedUp = false;
  const service = createTemporaryAuthService({
    findUser: async () => { lookedUp = true; return null; },
    createUser: async () => "user-1",
    rotatePassword: async () => {},
    ensureProfile: async () => {},
    signIn: async () => {},
    randomPassword: () => "generated-private-password",
  });

  await assert.rejects(
    () => service.signIn({ phone: "+919876543210", code: "9999" }),
    /invalid-credentials/u,
  );
  assert.equal(lookedUp, false);
});
