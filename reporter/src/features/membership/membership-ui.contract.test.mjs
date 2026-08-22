import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../../app/(protected)/membership/page.tsx", import.meta.url);
const checkoutUrl = new URL("./renewal-checkout.tsx", import.meta.url);

test("membership page derives server-owned status and displays expiry and seven-day grace", async () => {
  const source = await readFile(pageUrl, "utf8");
  assert.match(source, /membershipStatusAt/u);
  assert.match(source, /membershipAccess/u);
  assert.match(source, /membershipExpiresAt/u);
  assert.match(source, /membershipGraceEndsAt/u);
  assert.match(source, /<RenewalCheckout/u);
});

test("renewal checkout uses the existing order and verification endpoints", async () => {
  const source = await readFile(checkoutUrl, "utf8");
  assert.match(source, /\/api\/payments\/order/u);
  assert.match(source, /purpose: "renewal"/u);
  assert.match(source, /\/api\/payments\/verify/u);
  assert.match(source, /disabled=\{disabled/u);
});
