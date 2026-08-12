import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

const adminDirectory = new URL("./", import.meta.url);

test("grouped admin pages are not shadowed by direct route directories", async () => {
  const [adminEntries, protectedEntries] = await Promise.all([
    readdir(adminDirectory, { withFileTypes: true }),
    readdir(new URL("./(protected)/", adminDirectory), { withFileTypes: true }),
  ]);

  const directDirectories = new Set(
    adminEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
  );
  const collisions = protectedEntries.filter(
    (entry) => entry.isDirectory() && directDirectories.has(entry.name),
  )
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(collisions, []);
});
