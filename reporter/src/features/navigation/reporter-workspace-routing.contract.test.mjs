import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [layout, dashboard, login, verify, authActions, authServer, submissionActions, stories, application, live, membership] = await Promise.all([
  source("../../app/(protected)/layout.tsx"),
  source("../../app/(protected)/dashboard/page.tsx"),
  source("../../app/(auth)/login/page.tsx"),
  source("../../app/(auth)/verify/page.tsx"),
  source("../auth/actions.ts"),
  source("../auth/server.ts"),
  source("../submissions/submission.actions.ts"),
  source("../../app/(protected)/stories/page.tsx"),
  source("../../app/(protected)/application/page.tsx"),
  source("../../app/(protected)/live/page.tsx"),
  source("../../app/(protected)/membership/page.tsx"),
]);

test("authenticated entry points use the role-aware workspace destination", () => {
  assert.match(login, /authDestination\("signin", authorization\.state\)/u);
  assert.match(verify, /authDestination\("signin", authorization\.state\)/u);
  assert.match(authActions, /redirectAfterAuthentication\("signin"\)/u);
  assert.doesNotMatch(`${login}\n${verify}\n${authActions}`, /redirect\("\/dashboard"\)/u);
  assert.match(submissionActions, /revalidatePath\("\/stories"\)/u);
  assert.doesNotMatch(submissionActions, /revalidatePath\("\/dashboard"\)/u);
});

test("legacy dashboard route preserves authentication and redirects by role", () => {
  assert.match(dashboard, /requireReporterSession\(\)/u);
  assert.match(dashboard, /authDestination\("signin", actor\.state\)/u);
  assert.doesNotMatch(dashboard, /Reporter dashboard/u);
});

test("header home link uses the same role-aware destination", () => {
  assert.match(layout, /authDestination\("signin", actor\.state\)/u);
  assert.match(layout, /href=\{homeHref\}/u);
  assert.doesNotMatch(layout, /href="\/dashboard"/u);
});

test("workspace routes retain the existing server-side session boundary", () => {
  assert.match(authServer, /export async function requireReporterSession/u);
  assert.match(authServer, /const result = await authorizeCurrentReporter\(\)/u);
  assert.match(authServer, /if \(!result\.ok\)[\s\S]*redirect\("\/login"\)/u);
  for (const page of [stories, application, live, membership]) {
    assert.match(page, /requireReporterSession\(\)/u);
  }
});
