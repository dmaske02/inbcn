import assert from "node:assert/strict";
import test from "node:test";

test("collects every repository page without requesting past the final page", async () => {
  const pagination = await import("./repository.pagination.ts").catch(
    () => null,
  );
  assert.ok(pagination, "repository pagination helper should exist");

  const ranges = [];
  const items = await pagination.collectRepositoryPages(
    async (from, to) => {
      ranges.push([from, to]);
      return {
        items: from === 0 ? ["one", "two"] : ["three"],
        total: 3,
      };
    },
    2,
  );

  assert.deepEqual(items, ["one", "two", "three"]);
  assert.deepEqual(ranges, [
    [0, 1],
    [2, 3],
  ]);
});
