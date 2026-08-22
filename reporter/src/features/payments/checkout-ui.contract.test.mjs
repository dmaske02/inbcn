import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const applicationStatusUrl = new URL("../application/application-status.tsx", import.meta.url);
const renewalCheckoutUrl = new URL("../membership/renewal-checkout.tsx", import.meta.url);
const reporterCheckoutUrl = new URL("./reporter-checkout.tsx", import.meta.url);

async function sourceOrEmpty(url) {
  try {
    return await readFile(url, "utf8");
  } catch {
    return "";
  }
}

test("consent-complete drafts and payment-pending applications own a resumable checkout", async () => {
  const source = await readFile(applicationStatusUrl, "utf8");

  assert.match(source, /application\.status === "draft" && application\.consentsComplete/u);
  assert.match(source, /application\.status === "payment_pending"/u);
  assert.match(source, /<ReporterCheckout/u);
  assert.match(source, /purpose="application"/u);
  assert.match(source, /applicationId=\{application\.id\}/u);
  assert.match(source, /keyId=\{razorpayKeyId\}/u);
});

test("one production checkout owns exact application and renewal request bodies", async () => {
  const checkout = await sourceOrEmpty(reporterCheckoutUrl);
  const renewal = await readFile(renewalCheckoutUrl, "utf8");

  assert.match(checkout, /purpose: "application" \| "renewal"/u);
  assert.match(checkout, /JSON\.stringify\(\{ purpose, applicationId \}\)/u);
  assert.match(checkout, /\/api\/payments\/order/u);
  assert.match(checkout, /\/api\/payments\/verify/u);
  assert.match(renewal, /purpose="renewal"/u);
  assert.match(renewal, /applicationId=\{null\}/u);
});

test("checkout exposes load, provider, cancellation, verification, and retry feedback accessibly", async () => {
  const checkout = await sourceOrEmpty(reporterCheckoutUrl);

  assert.match(checkout, /onLoad=/u);
  assert.match(checkout, /onError=/u);
  assert.match(checkout, /setScriptAttempt/u);
  assert.match(checkout, /[?]inbcn_retry=/u);
  assert.match(checkout, /ondismiss/u);
  assert.match(checkout, /response\.status === 202/u);
  assert.match(checkout, /verificationReceipt/u);
  assert.match(checkout, /Check payment status/u);
  assert.match(checkout, /aria-live="polite"/u);
  assert.match(checkout, /role=\{state\.kind === "error" \? "alert" : "status"\}/u);
  assert.match(checkout, /Try again|try again/u);
  assert.doesNotMatch(checkout, /signatureValid.*Membership renewed|signatureValid.*Application paid/su);
});
