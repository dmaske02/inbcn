import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createTemporaryAuthService } from "./temporary-auth.model.ts";

test("temporary Auth lookup tolerates Supabase's plus-less stored phone", async () => {
  const server = await readFile(new URL("./temporary-auth.server.ts", import.meta.url), "utf8");
  assert.match(server, /user\.phone\?\.replace\(\/\^\\\+\//u);
});

test("1234 creates a confirmed phone user and establishes a session", async () => {
  const events = [];
  const service = createTemporaryAuthService({
    findUser: async () => null,
    createUser: async (input) => { events.push(["create", input]); return "user-1"; },
    rotateCredentials: async () => { throw new Error("must not rotate a new user"); },
    ensureProfile: async (userId) => { events.push(["profile", userId]); },
    signIn: async (input) => { events.push(["sign-in", input.email]); },
    randomPassword: () => "generated-private-password",
  });

  await service.signIn({ phone: "+919876543210", code: "1234" });

  assert.deepEqual(events.map(([name]) => name), ["create", "profile", "sign-in"]);
  assert.equal(events[0][1].email, "reporter.919876543210@preview.inbcn.invalid");
});

test("1234 rotates a returning user's password before sign-in", async () => {
  const events = [];
  const service = createTemporaryAuthService({
    findUser: async () => "user-1",
    createUser: async () => { throw new Error("must not create duplicate"); },
    rotateCredentials: async () => { events.push("rotate"); },
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
    rotateCredentials: async () => {},
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
