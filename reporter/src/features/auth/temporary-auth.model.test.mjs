import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createTemporaryAuthService,
  isTemporaryDemoIdentityEligible,
  validateTemporaryDemoOtp,
} from "./temporary-auth.model.ts";

test("demo OTP validation accepts only the canonical phone with 1234", () => {
  assert.deepEqual(validateTemporaryDemoOtp("+919000000829", "1234"), { ok: true, phone: "+919000000829" });
  assert.deepEqual(validateTemporaryDemoOtp("+919876543210", "1234"), { ok: false });
  assert.deepEqual(validateTemporaryDemoOtp("+919000000829", "9999"), { ok: false });
});

test("temporary Auth lookup tolerates Supabase's plus-less stored phone", async () => {
  const server = await readFile(new URL("./temporary-auth.server.ts", import.meta.url), "utf8");
  assert.match(server, /user\.phone\?\.replace\(\/\^\\\+\//u);
});

test("canonical demo credentials create a marked user and establish a session", async () => {
  const events = [];
  const service = createTemporaryAuthService({
    findUser: async () => null,
    createUser: async (input) => { events.push(["create", input]); return "user-1"; },
    rotateCredentials: async () => { throw new Error("must not rotate a new user"); },
    ensureProfile: async (userId) => { events.push(["profile", userId]); },
    signIn: async (input) => { events.push(["sign-in", input.email]); },
    randomPassword: () => "generated-private-password",
  });

  await service.signIn({ phone: "+919000000829", code: "1234" });

  assert.deepEqual(events.map(([name]) => name), ["create", "profile", "sign-in"]);
  assert.equal(events[0][1].email, "reporter.919000000829@preview.inbcn.invalid");
});

test("an approved demo reporter is reusable only when signed and database access agree", async () => {
  const server = (await readFile(new URL("./temporary-auth.server.ts", import.meta.url), "utf8")).replaceAll("\r\n", "\n");
  assert.match(server, /public_status, access_sync_status/u);
  assert.doesNotMatch(server, /access_generation|access_sync_generation/u);
  assert.match(server, /isTemporaryDemoIdentityEligible/u);
});

test("demo identity eligibility accepts only coherent applicant or active Reporter states", () => {
  const applicant = {
    authRole: "reader",
    profile: { role: "reader", isActive: true },
    reporter: null,
  };
  const reporter = {
    authRole: "reporter",
    profile: { role: "reporter", isActive: true },
    reporter: { publicStatus: "active", accessSyncStatus: "succeeded" },
  };

  assert.equal(isTemporaryDemoIdentityEligible(applicant), true);
  assert.equal(isTemporaryDemoIdentityEligible(reporter), true);
  assert.equal(isTemporaryDemoIdentityEligible({ ...reporter, authRole: "admin" }), false);
  assert.equal(isTemporaryDemoIdentityEligible({ ...reporter, profile: { role: "reader", isActive: true } }), false);
  assert.equal(isTemporaryDemoIdentityEligible({ ...reporter, profile: { role: "reporter", isActive: false } }), false);
  assert.equal(isTemporaryDemoIdentityEligible({ ...reporter, reporter: { publicStatus: "suspended", accessSyncStatus: "succeeded" } }), false);
  assert.equal(isTemporaryDemoIdentityEligible({ ...reporter, reporter: { publicStatus: "active", accessSyncStatus: "failed" } }), false);
});

test("create mode can defer profile persistence until personal details are submitted", async () => {
  const events = [];
  const service = createTemporaryAuthService({
    findUser: async () => null,
    createUser: async () => "user-1",
    rotateCredentials: async () => {},
    ensureProfile: async () => { events.push("profile"); },
    signIn: async () => { events.push("sign-in"); },
    randomPassword: () => "generated-private-password",
  });

  const userId = await service.signIn(
    { phone: "+919000000829", code: "1234" },
    { ensureProfile: false },
  );

  assert.equal(userId, "user-1");
  assert.deepEqual(events, ["sign-in"]);
});

test("fresh demo signup metadata is attached only while creating the temporary Auth user", async () => {
  let created;
  const signupProfile = {
    fullName: "Synthetic Reporter",
    email: "reporter@example.com",
    cityLocality: "Synthetic Test Locality",
    state: "Karnataka",
    preferredLanguageId: "5ac922dd-5db8-4d18-907f-762d44f12be1",
    experience: "Community reporting.",
    introduction: "I want to report verified local civic stories.",
  };
  const service = createTemporaryAuthService({
    findUser: async () => null,
    createUser: async (input) => { created = input; return "user-1"; },
    rotateCredentials: async () => {},
    ensureProfile: async () => {},
    signIn: async () => {},
    randomPassword: () => "generated-private-password",
  });

  await service.signIn({ phone: "+919000000829", code: "1234" }, { signupProfile });
  assert.deepEqual(created.signupProfile, signupProfile);
});

test("a marked eligible demo identity is safely reused", async () => {
  const events = [];
  const service = createTemporaryAuthService({
    findUser: async () => ({ id: "user-1", marked: true, eligible: true }),
    createUser: async () => { throw new Error("must not create duplicate"); },
    rotateCredentials: async () => { events.push("rotate"); },
    ensureProfile: async () => { events.push("profile"); },
    signIn: async () => { events.push("sign-in"); },
    randomPassword: () => "generated-private-password",
  });

  await service.signIn({ phone: "+919000000829", code: "1234" });

  assert.deepEqual(events, ["rotate", "profile", "sign-in"]);
});

test("an unmarked canonical account is rejected before credential rotation", async () => {
  const events = [];
  const service = createTemporaryAuthService({
    findUser: async () => ({ id: "user-1", marked: false, eligible: true }),
    createUser: async () => { events.push("create"); return "user-1"; },
    rotateCredentials: async () => { events.push("rotate"); },
    ensureProfile: async () => { events.push("profile"); },
    signIn: async () => { events.push("sign-in"); },
    randomPassword: () => "generated-private-password",
  });

  await assert.rejects(
    () => service.signIn({ phone: "+919000000829", code: "1234" }),
    /invalid-credentials/u,
  );
  assert.deepEqual(events, []);
});

test("a privileged canonical identity is rejected before credential rotation", async () => {
  const events = [];
  const service = createTemporaryAuthService({
    findUser: async () => ({ id: "user-1", marked: true, eligible: false }),
    createUser: async () => { events.push("create"); return "user-1"; },
    rotateCredentials: async () => { events.push("rotate"); },
    ensureProfile: async () => { events.push("profile"); },
    signIn: async () => { events.push("sign-in"); },
    randomPassword: () => "generated-private-password",
  });

  await assert.rejects(
    () => service.signIn({ phone: "+919000000829", code: "1234" }),
    /invalid-credentials/u,
  );
  assert.deepEqual(events, []);
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
    () => service.signIn({ phone: "+919000000829", code: "9999" }),
    /invalid-credentials/u,
  );
  assert.equal(lookedUp, false);
});

test("another valid phone with 1234 is rejected before user lookup", async () => {
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
    () => service.signIn({ phone: "+919876543210", code: "1234" }),
    /invalid-credentials/u,
  );
  assert.equal(lookedUp, false);
});
