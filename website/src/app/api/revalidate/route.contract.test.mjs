import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("website revalidation is POST-only, secret-protected, and event-allowlisted", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

  assert.match(source, /export async function POST\(/u);
  assert.doesNotMatch(source, /export async function GET\(/u);
  assert.match(source, /WEBSITE_REVALIDATION_SECRET/u);
  assert.match(source, /websiteRevalidationEvents/u);
  assert.match(source, /revalidatePath/u);
  assert.doesNotMatch(source, /body\.path|input\.path/u);
});
