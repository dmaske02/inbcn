import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./reporter-demo.tsx", import.meta.url), "utf8");
const proxy = await readFile(new URL("../../proxy.ts", import.meta.url), "utf8");

test("client preview is a synthetic onboarding and reporter application", () => {
  assert.match(source, /Synthetic data only/u);
  for (const step of ["Mobile signup", "Reporter application", "₹100", "Aadhaar KYC", "Awaiting approval"]) {
    assert.match(source, new RegExp(step, "u"));
  }
  for (const view of ["home", "stories", "live", "application", "profile"]) {
    assert.match(source, new RegExp(`\\b${view}\\b`, "u"));
  }
  assert.match(source, /Save draft/u);
  assert.match(source, /Submit for review/u);
  assert.match(source, /Restart demo/u);
  assert.match(source, /if\s*\(ready\).*localStorage\.setItem/su);
  assert.match(source, /no camera, room or recording is created/iu);
  assert.doesNotMatch(source, /(razorpay_[a-z]|storage[_ ]key|egress[_ ]id|latitude|longitude)/iu);
  assert.match(proxy, /pathname === "\/"/u);
  assert.match(proxy, /return updateSession\(request\)/u);
});
