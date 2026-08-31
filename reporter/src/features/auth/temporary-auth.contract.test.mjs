import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("explicit demo auth is gated separately while provider OTP remains available", async () => {
  const [actions, form, login, verify] = await Promise.all([
    read("./actions.ts"),
    read("./otp-form.tsx"),
    read("../../app/(auth)/login/page.tsx"),
    read("../../app/(auth)/verify/page.tsx"),
  ]);

  assert.match(actions, /env\.server\.demoMode/u);
  assert.match(actions, /signInWithTemporaryOtp/u);
  assert.match(actions, /signInWithOtp/u);
  assert.match(actions, /verifyOtp/u);
  assert.match(form, /Client preview code/u);
  assert.match(form, /1234/u);
  assert.match(form, /name="token"/u);
  assert.match(login, /demoMode/u);
  assert.match(verify, /demoMode/u);
  assert.doesNotMatch(login, /temporaryOnboarding/u);
});

test("the demo code is isolated from the provider OTP actions", async () => {
  const actions = await read("./actions.ts");
  const temporaryStart = actions.indexOf("export async function temporarySignInAction");
  const requestStart = actions.indexOf("export async function requestOtpAction");
  const verifyStart = actions.indexOf("export async function verifyOtpAction");
  const completeStart = actions.indexOf("export async function completeTemporarySignupAction");
  assert.ok(temporaryStart >= 0 && requestStart > temporaryStart && verifyStart > requestStart && completeStart > verifyStart);

  const temporaryAction = actions.slice(temporaryStart, requestStart);
  const providerActions = actions.slice(requestStart, completeStart);
  assert.match(temporaryAction, /signInWithTemporaryOtp/u);
  assert.doesNotMatch(providerActions, /signInWithTemporaryOtp|["']1234["']/u);
  assert.match(providerActions, /signInWithOtp/u);
  assert.match(providerActions, /captchaToken/u);
  assert.match(providerActions, /verifyOtp/u);
  assert.doesNotMatch(providerActions, /modeQuery|ensureApplicantProfile/u);
});

test("login presents distinct sign-in and create-account modes", async () => {
  const login = await read("../../app/(auth)/login/page.tsx");
  assert.match(login, /searchParams/u);
  assert.match(login, /requestedMode === "create"/u);
  assert.match(login, /env\.server\.demoMode && requestedMode/u);
  assert.match(login, /Sign in to your Reporter account\./u);
  assert.match(login, /Create your INBCN account/u);
  assert.match(login, /Verify your mobile number to get started with your INBCN reporter application\./u);
  assert.match(login, /href=\{creating \? "\/login" : "\/login\?mode=create"\}/u);
  assert.match(login, /New to INBCN\?/u);
  assert.match(login, /Create reporter account/u);
  assert.match(login, /Already have an account\?/u);
  assert.match(login, /"Sign in"/u);
  assert.match(login, /<OtpForm[\s\S]*mode=\{mode\}[\s\S]*temporary=\{env\.server\.demoMode\}/u);
  assert.doesNotMatch(login, /href=[^>]*(?:signup|register|application)/iu);
});

test("temporary preview form requests the code before accepting it", async () => {
  const form = await read("./otp-form.tsx");
  assert.match(form, /Send code/u);
  assert.match(form, /codeRequested/u);
  assert.match(form, /Client preview code/u);
  assert.match(form, /name="mode"/u);
});

test("create mode is a two-step demo signup and hides details until OTP verification", async () => {
  const [form, actions] = await Promise.all([read("./otp-form.tsx"), read("./actions.ts")]);
  assert.match(form, /Step 1 of 2/u);
  assert.match(form, /Verify mobile/u);
  assert.match(form, /state\.status === "verified"/u);
  assert.match(form, /Create your Reporter profile/u);
  assert.match(form, /Step 2 of 2/u);
  assert.match(form, /name="fullName"/u);
  assert.match(form, /name="email"/u);
  assert.match(form, /name="cityLocality"/u);
  assert.match(form, /name="state"/u);
  assert.match(form, /name="preferredLanguageId"/u);
  assert.match(form, /name="experience"/u);
  assert.match(form, /name="introduction"/u);
  assert.match(form, /Create reporter account/u);
  assert.match(actions, /completeTemporarySignupAction/u);
});

test("create-mode OTP advances without creating an account or session", async () => {
  const actions = await read("./actions.ts");
  const start = actions.indexOf("export async function temporarySignInAction");
  const end = actions.indexOf("export async function requestOtpAction");
  const stepOne = actions.slice(start, end);
  const createBranch = stepOne.slice(stepOne.indexOf('if (mode === "create")'), stepOne.indexOf("  try {"));
  assert.match(stepOne, /validateTemporaryDemoOtp/u);
  assert.doesNotMatch(createBranch, /signInWithTemporaryOtp/u);
  assert.match(actions, /status: "verified"/u);
  assert.match(actions, /verifiedPhone: phone/u);
  assert.match(actions, /signInWithTemporaryOtp\(phone, token/u);
  assert.match(actions, /ensureApplicantProfile\(userId,/u);
  assert.match(actions, /redirectAfterAuthentication\("create"\)/u);
});

test("applicant profile bootstrap is server-only and never overwrites an existing profile", async () => {
  const bootstrap = await read("./applicant-profile.server.ts");
  assert.match(bootstrap, /import "server-only"/u);
  assert.match(bootstrap, /applicantProfileInsert\(userId, profile\)/u);
  assert.match(bootstrap, /onConflict: "id"/u);
  assert.match(bootstrap, /ignoreDuplicates: true/u);
  assert.match(bootstrap, /\.eq\("is_active", true\)/u);
});

test("temporary signup details are metadata only and never become authorization claims", async () => {
  const server = await read("./temporary-auth.server.ts");
  assert.match(server, /user_metadata: input\.signupProfile \?/u);
  assert.doesNotMatch(server, /app_metadata:\s*input\.signupProfile/u);
});

test("demo Auth users carry an ownership marker and privileged identities fail closed", async () => {
  const server = await read("./temporary-auth.server.ts");
  assert.match(server, /reporter_demo_identity/u);
  assert.match(server, /role === "reader"/u);
  assert.match(server, /is_active/u);
  assert.match(server, /marked:/u);
  assert.match(server, /eligible:/u);
});

test("demo authentication does not enable temporary payment or KYC onboarding", async () => {
  const [applicationPage, temporaryActions] = await Promise.all([
    read("../application/../../app/(protected)/application/page.tsx"),
    read("../application/temporary-onboarding.actions.ts"),
  ]);
  assert.match(applicationPage, /temporaryOnboarding=\{env\.server\.temporaryOnboarding\}/u);
  assert.doesNotMatch(applicationPage, /temporaryOnboarding=\{env\.server\.demoMode\}/u);
  assert.match(temporaryActions, /env\.server\.temporaryOnboarding/u);
  assert.doesNotMatch(temporaryActions, /env\.server\.demoMode/u);
});
