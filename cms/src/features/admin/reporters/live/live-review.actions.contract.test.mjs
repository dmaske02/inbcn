import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("live review decisions stay behind the admin-only server action", async () => {
  const actions = await readFile(new URL("./live-review.actions.ts", import.meta.url), "utf8");
  assert.match(actions, /^"use server"/u);
  assert.match(actions, /requireAdminUser/u);
  assert.match(actions, /approveLiveRequest/u);
  assert.match(actions, /rejectLiveRequest/u);
  assert.match(actions, /import \{ LiveTerminationError, terminateReporterLiveRequest \} from "[.]\/live-termination[.]service"/u);
  assert.match(actions, /await terminateReporterLiveRequest\(admin, id,/u);
  assert.match(actions, /finally \{ refresh\(id\); \}/u);
  assert.doesNotMatch(actions, /import \{[^}]*terminateLiveRequest[^}]*\} from "[.]\/live-review[.]service"/u);
  assert.doesNotMatch(actions, /maximumMinutes/u);
});

test("the normal CMS form describes provider cleanup and keeps terminal cleanup retryable", async () => {
  const detail = await readFile(new URL("./live-review-detail.tsx", import.meta.url), "utf8");
  assert.match(detail, /ends the database workflow before revoking the reporter and deleting the exact LiveKit room/iu);
  assert.match(detail, /request\.status === "terminated"/u);
  assert.match(detail, /Retry provider cleanup/u);
  assert.match(detail, /name="reason"/u);
});

test("live review detail uses CMS editorial cards and accessible decision validation", async () => {
  const detail = await readFile(new URL("./live-review-detail.tsx", import.meta.url), "utf8");
  assert.match(detail, /import \{ Badge \}/u);
  assert.match(detail, /import \{ Card, CardContent, CardFooter, CardHeader \}/u);
  assert.match(detail, /variant="destructive"/u);
  assert.match(detail, /type="datetime-local"/u);
  assert.match(detail, /onInvalid=/u);
  assert.match(detail, /validity\.valid/u);
  assert.match(detail, /aria-invalid=/u);
  assert.match(detail, /Please enter a complete date and time\./u);
  assert.match(detail, /lg:grid-cols-2/u);
  assert.doesNotMatch(detail, /noValidate/u);
});
