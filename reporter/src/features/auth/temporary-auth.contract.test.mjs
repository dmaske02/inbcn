import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("temporary preview auth is gated while provider OTP remains available", async () => {
  const [actions, form, login, verify] = await Promise.all([
    read("./actions.ts"),
    read("./otp-form.tsx"),
    read("../../app/(auth)/login/page.tsx"),
    read("../../app/(auth)/verify/page.tsx"),
  ]);

  assert.match(actions, /env\.server\.temporaryOnboarding/u);
  assert.match(actions, /signInWithTemporaryOtp/u);
  assert.match(actions, /signInWithOtp/u);
  assert.match(actions, /verifyOtp/u);
  assert.match(form, /Client preview code/u);
  assert.match(form, /1234/u);
  assert.match(form, /name="token"/u);
  assert.match(login, /temporaryOnboarding/u);
  assert.match(verify, /temporaryOnboarding/u);
});
