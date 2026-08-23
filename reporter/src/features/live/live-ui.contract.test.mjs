import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("live request UI uses safe native controls and contains no location capture", async () => {
  const [form, actions, layout] = await Promise.all([
    readFile(new URL("./live-request-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("./live-request.actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/(protected)/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(form, /type="datetime-local"/u);
  assert.match(form, /type="number"/u);
  assert.match(form, /IST/u);
  assert.doesNotMatch(form, /geolocation|latitude|longitude|coordinates/iu);
  assert.match(actions, /requireReporterSession/u);
  assert.match(layout, /href="\/live"/u);
});
