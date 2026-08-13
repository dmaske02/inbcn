import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layout = await readFile(new URL("./layout.tsx", import.meta.url), "utf8");
const broadcastLinkUrl = new URL(
  "../../../features/admin/navigation/broadcast-navigation-link.tsx",
  import.meta.url,
);
const mobileNavigationUrl = new URL(
  "../../../features/admin/navigation/admin-mobile-navigation.tsx",
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

test("mobile navigation exposes every permitted destination in an accessible viewport-safe drawer", async () => {
  assert.match(layout, /className="hidden items-center gap-1 lg:flex"/u);
  assert.match(layout, /className="flex max-lg:min-w-0 items-center/u);
  assert.match(layout, /className="hidden text-right lg:block"/u);
  assert.match(layout, /<AdminMobileNavigation>[\s\S]*<\/AdminMobileNavigation>/u);

  const source = await readFile(mobileNavigationUrl, "utf8");
  assert.match(source, /^"use client"/u);
  assert.match(source, /aria-expanded=\{open\}/u);
  assert.match(source, /aria-controls=\{drawerId\}/u);
  assert.match(source, /aria-label="Close editorial navigation"/u);
  assert.match(source, /event\.key === "Escape"/u);
  assert.match(source, /fixed inset-0 z-\[100\]/u);
  assert.match(source, /overflow-y-auto/u);
  assert.match(source, /env\(safe-area-inset-top\)/u);
  assert.match(source, /env\(safe-area-inset-bottom\)/u);
  assert.match(source, /max-w-full/u);
  assert.match(source, /lg:hidden/u);
  assert.match(source, /onClick=\{closeNavigation\}/u);
  assert.match(source, /\{children\}/u);
});

test("mobile trigger is a non-collapsing elevated control below 1024px while desktop navigation starts at 1024px", async () => {
  assert.match(layout, /className="hidden items-center gap-1 lg:flex"/u);

  const source = await readFile(mobileNavigationUrl, "utf8");
  assert.match(source, /className="relative z-50 shrink-0 lg:hidden"/u);
  assert.match(source, /className="size-11 shrink-0"/u);
  assert.match(source, /aria-label="Open editorial navigation"/u);
  assert.match(source, /size="icon"/u);
});
