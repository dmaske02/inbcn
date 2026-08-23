import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("studio page fails closed to the reporter-owned approved window and active live trust", async () => {
  const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
  for (const marker of [
    "requireReporterSession", "getLiveRequest", "getCurrentMembership", "request.status !== \"approved\"",
    "membership.status !== \"active\"", "!membership.canBroadcastLive", "now < startsAt", "now >= endsAt", "ReporterBroadcastStudio",
    "catch { notFound(); }",
  ]) assert.ok(source.includes(marker), `missing ${marker}`);
});
