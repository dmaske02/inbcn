import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");

test("Broadcast Studio is protected and denies writers on the server", () => {
  assert.match(page, /requireAdminUser\(\)/);
  assert.match(page, /canAccessBroadcastStudio\(admin\.role\)/);
  assert.match(page, /redirect\("\/admin\/forbidden"\)/);
});

test("Broadcast Studio defaults unsupported preferred locales to English", () => {
  assert.match(page, /code === "hi" \|\| code === "mr"/);
  assert.match(page, /: "en"/);
  assert.match(page, /<BroadcastStudio/);
});
