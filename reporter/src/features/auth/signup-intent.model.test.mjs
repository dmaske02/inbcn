import assert from "node:assert/strict";
import test from "node:test";

import { authDestination, parseAuthMode } from "./signup-intent.model.ts";

test("only the explicit create mode is accepted", () => {
  assert.equal(parseAuthMode("create"), "create");
  assert.equal(parseAuthMode("signin"), "signin");
  assert.equal(parseAuthMode("https://example.com"), "signin");
  assert.equal(parseAuthMode("/application"), "signin");
  assert.equal(parseAuthMode(["create"]), "signin");
});

test("authenticated users land in the workspace for their role", () => {
  assert.equal(authDestination("create", "applicant"), "/application");
  assert.equal(authDestination("create", "reporter"), "/stories");
  assert.equal(authDestination("signin", "applicant"), "/application");
  assert.equal(authDestination("signin", "reporter"), "/stories");
});
