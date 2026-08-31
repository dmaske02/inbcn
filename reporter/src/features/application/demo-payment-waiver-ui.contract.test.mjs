import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("waiver action derives identity and ownership server-side before the RPC", async () => {
  const [actions, repository] = await Promise.all([
    read("./demo-payment-waiver.actions.ts"),
    read("./application.repository.ts"),
  ]);

  assert.match(actions, /requireReporterSession\(\)/u);
  assert.match(actions, /env\.server\.demoMode/u);
  assert.match(actions, /getCurrentDemoIdentity/u);
  assert.match(actions, /getCurrentApplication\(actor\.userId\)/u);
  assert.match(actions, /application\.id !== applicationId/u);
  assert.match(actions, /createDemoPaymentWaiverService/u);
  assert.match(actions, /revalidatePath\("\/application"\)/u);
  assert.doesNotMatch(actions, /formData\.get\([^)]*profile/u);
  assert.match(repository, /rpc\("waive_demo_reporter_application_payment"/u);
});

test("canonical demo payment boundary renders an explicit waiver instead of checkout", async () => {
  const [control, status, page] = await Promise.all([
    read("./demo-payment-waiver-control.tsx"),
    read("./application-status.tsx"),
    read("../../app/(protected)/application/page.tsx"),
  ]);

  assert.match(control, /Payment is disabled for this demo/u);
  assert.match(control, /No payment or Razorpay transaction will be created/u);
  assert.match(control, /Continue demo without payment/u);
  assert.match(control, /aria-live="polite"/u);
  assert.match(status, /demoPaymentWaiver/u);
  assert.match(status, /<DemoPaymentWaiverControl/u);
  assert.match(status, /<ReporterCheckout/u);
  assert.match(page, /env\.server\.demoMode/u);
  assert.match(page, /getCurrentDemoIdentity/u);
  assert.match(page, /demoPaymentWaiver=/u);
});

test("real Razorpay and temporary onboarding flows remain separate", async () => {
  const [status, paymentRepository, temporaryRepository] = await Promise.all([
    read("./application-status.tsx"),
    read("../payments/payment.repository.ts"),
    read("./application.repository.ts"),
  ]);

  assert.match(status, /demoPaymentWaiver[\s\S]*DemoPaymentWaiverControl[\s\S]*ReporterCheckout/u);
  assert.match(paymentRepository, /reserve_reporter_order/u);
  assert.match(temporaryRepository, /complete_temporary_reporter_payment/u);
  const temporaryPayment = temporaryRepository.match(/export async function completeTemporaryPayment[\s\S]*?\n\}/u)?.[0] ?? "";
  assert.match(temporaryPayment, /complete_temporary_reporter_payment/u);
  assert.doesNotMatch(temporaryPayment, /waive_demo_reporter_application_payment/u);
});
