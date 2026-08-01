import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeAdminIdentity,
  parseAdminRole,
} from "./authorization.model.ts";

test("accepts only editorial roles from signed app metadata", () => {
  assert.equal(parseAdminRole("writer"), "writer");
  assert.equal(parseAdminRole("editor"), "editor");
  assert.equal(parseAdminRole("admin"), "admin");
  assert.equal(parseAdminRole("reader"), null);
  assert.equal(parseAdminRole(undefined), null);
});

test("authorizes an active profile whose id and role match the signed JWT", () => {
  assert.deepEqual(
    authorizeAdminIdentity(
      { id: "user-1", email: "editor@example.com", role: "editor" },
      {
        id: "user-1",
        displayName: "Editor One",
        role: "editor",
        isActive: true,
        preferredLanguage: { code: "en", name: "English" },
      },
    ),
    {
      ok: true,
      identity: {
        id: "user-1",
        email: "editor@example.com",
        displayName: "Editor One",
        role: "editor",
        preferredLanguage: { code: "en", name: "English" },
      },
    },
  );
});

test("denies unsupported roles and compromised profile integrity", () => {
  const validProfile = {
    id: "user-1",
    displayName: "Writer One",
    role: "writer",
    isActive: true,
    preferredLanguage: null,
  };

  assert.deepEqual(
    authorizeAdminIdentity({ id: "user-1", email: null, role: null }, validProfile),
    { ok: false, reason: "forbidden" },
  );
  assert.deepEqual(
    authorizeAdminIdentity(
      { id: "user-1", email: null, role: "writer" },
      null,
    ),
    { ok: false, reason: "profile-missing" },
  );
  assert.deepEqual(
    authorizeAdminIdentity(
      { id: "user-1", email: null, role: "writer" },
      { ...validProfile, isActive: false },
    ),
    { ok: false, reason: "profile-inactive" },
  );
  assert.deepEqual(
    authorizeAdminIdentity(
      { id: "user-1", email: null, role: "writer" },
      { ...validProfile, role: "editor" },
    ),
    { ok: false, reason: "role-mismatch" },
  );
  assert.deepEqual(
    authorizeAdminIdentity(
      { id: "user-1", email: null, role: "writer" },
      { ...validProfile, id: "user-2" },
    ),
    { ok: false, reason: "profile-mismatch" },
  );
});
