import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./reporter-demo.tsx", import.meta.url), "utf8");
const proxy = await readFile(new URL("../../proxy.ts", import.meta.url), "utf8");

test("client preview is clearly synthetic and exposes the five reporter walkthrough views", () => {
  assert.match(source, /Synthetic data only/u);
  for (const view of ["home", "stories", "live", "application", "profile"]) {
    assert.match(source, new RegExp(`\\b${view}\\b`, "u"));
  }
  assert.match(source, /no camera, room or recording is created/iu);
  assert.doesNotMatch(source, /(aadhaar|razorpay_[a-z]|storage[_ ]key|egress[_ ]id|latitude|longitude)/iu);
  assert.match(proxy, /pathname === "\/"/u);
  assert.match(proxy, /return updateSession\(request\)/u);
});
