import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("temporary onboarding actions are gated and ownership checked", async () => {
  const actions = await read("./temporary-onboarding.actions.ts");

  assert.match(actions, /requireReporterSession\(\)/u);
  assert.match(actions, /actor\.state !== "applicant"/u);
  assert.match(actions, /env\.server\.temporaryOnboarding/u);
  assert.match(actions, /getCurrentApplication\(actor\.userId\)/u);
  assert.match(actions, /application\.id !== applicationId/u);
  assert.match(actions, /revalidatePath\("\/application"\)/u);
  assert.match(actions, /redirect\("\/dashboard"\)/u);
});

test("temporary controls expose only explicit pending preview steps", async () => {
  const [controls, status, page] = await Promise.all([
    read("./temporary-onboarding-controls.tsx"),
    read("./application-status.tsx"),
    read("../../app/(protected)/application/page.tsx"),
  ]);

  assert.match(controls, /Complete dummy ₹100 payment/u);
  assert.match(controls, /Complete dummy KYC/u);
  assert.match(controls, /disabled=\{pending\}/u);
  assert.match(controls, /aria-live="polite"/u);
  assert.match(status, /temporaryOnboarding/u);
  assert.match(status, /TemporaryOnboardingControls/u);
  assert.match(page, /temporaryOnboarding=\{env\.server\.temporaryOnboarding\}/u);
});
