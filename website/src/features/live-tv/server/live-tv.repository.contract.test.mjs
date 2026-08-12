import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production repository is server-only and exposes the approved persistence methods", async () => {
  const source = await readFile(
    new URL("./live-tv.repository.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /import "server-only"/u);
  assert.match(source, /createClient/u);
  for (const method of [
    "getLiveChannel",
    "getLiveChannelByLanguage",
    "getLiveSchedule",
    "createLiveChannel",
    "updateLiveChannel",
    "deleteLiveChannel",
    "createSchedule",
    "updateSchedule",
    "deleteSchedule",
  ]) {
    assert.match(source, new RegExp(`export (?:async )?function ${method}`, "u"));
  }
  assert.doesNotMatch(source, /service_role|SUPABASE_SERVICE_ROLE_KEY/u);
});

test("minimal service remains server-only and delegates without player or UI concerns", async () => {
  const source = await readFile(
    new URL("./live-tv.service.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /import "server-only"/u);
  assert.match(source, /live-tv\.repository/u);
  assert.doesNotMatch(source, /player|React|metadata|advertisement|next\/navigation/iu);
});
