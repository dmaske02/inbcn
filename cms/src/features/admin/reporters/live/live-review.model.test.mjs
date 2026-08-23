import assert from "node:assert/strict";
import test from "node:test";

import { canDecideLiveRequest, canViewLiveRequests } from "./live-review.model.ts";

test("active editorial roles can view live requests but only admins can decide", () => {
  assert.equal(canViewLiveRequests("admin"), true);
  assert.equal(canViewLiveRequests("editor"), true);
  assert.equal(canViewLiveRequests("writer"), false);
  assert.equal(canDecideLiveRequest("admin"), true);
  assert.equal(canDecideLiveRequest("editor"), false);
});
