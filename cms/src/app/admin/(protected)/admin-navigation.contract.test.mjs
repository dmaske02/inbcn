import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layout = await readFile(new URL("./layout.tsx", import.meta.url), "utf8");
const broadcastLinkUrl = new URL(
  "../../../features/admin/navigation/broadcast-navigation-link.tsx",
  import.meta.url,
);

test("permitted editors see Broadcast immediately after Live TV", () => {
  assert.match(layout, /canAccessBroadcastStudio\(admin\.role\)/u);
  assert.match(
    layout,
    /href="\/admin\/live-tv"[\s\S]*BroadcastNavigationLink[\s\S]*href="\/admin\/alerts"/u,
  );
});

test("Broadcast navigation links to the existing route and marks nested paths active", async () => {
  const source = await readFile(broadcastLinkUrl, "utf8");
  assert.match(source, /^"use client"/u);
  assert.match(source, /usePathname\(\)/u);
  assert.match(source, /pathname === "\/admin\/broadcast"/u);
  assert.match(source, /pathname\.startsWith\("\/admin\/broadcast\/"\)/u);
  assert.match(source, /href="\/admin\/broadcast"/u);
  assert.match(source, /aria-current=\{active \? "page" : undefined\}/u);
  assert.match(source, /Broadcast\s*\n\s*<\/Link>/u);
});
