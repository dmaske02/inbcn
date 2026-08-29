import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8").catch(() => "");
const [layout, navigation, mobileNavigation, authActions, globals, button, card, badge, skeleton] = await Promise.all([
  source("../../app/(protected)/layout.tsx"),
  source("./reporter-navigation.tsx"),
  source("./reporter-mobile-navigation.tsx"),
  source("../auth/actions.ts"),
  source("../../app/globals.css"),
  source("../../components/ui/button.tsx"),
  source("../../components/ui/card.tsx"),
  source("../../components/ui/badge.tsx"),
  source("../../components/ui/skeleton.tsx"),
]);

test("protected shell uses the CMS container and Reporter-only navigation", () => {
  assert.match(layout, /min-h-16/u);
  assert.match(layout, /max-w-7xl/u);
  assert.match(layout, /px-4[^"\n]*sm:px-6[^"\n]*lg:px-8/u);
  assert.match(layout, /py-8[^"\n]*lg:py-10/u);
  assert.match(layout, /INBCN Reporter/u);
  assert.doesNotMatch(layout, /Review queue|Approve|Reject|Publish|Schedule/u);
  for (const label of ["Dashboard", "Application", "Stories", "Live", "Membership"]) {
    assert.match(navigation, new RegExp(label, "u"));
  }
  assert.doesNotMatch(navigation, /Review queue|Approve|Reject|Publish|Schedule/u);
});

test("navigation marks exact and nested Reporter routes active", () => {
  assert.match(navigation, /usePathname/u);
  assert.match(navigation, /pathname === item\.href/u);
  assert.match(navigation, /pathname\.startsWith\(`\$\{item\.href\}\/`\)/u);
  assert.match(navigation, /aria-current=\{active \? "page" : undefined\}/u);
});

test("mobile drawer preserves keyboard and touch accessibility", () => {
  assert.match(mobileNavigation, /event\.key === "Escape"/u);
  assert.match(mobileNavigation, /document\.body\.style\.overflow = "hidden"/u);
  assert.match(mobileNavigation, /trigger\?\.focus\(\)/u);
  assert.match(mobileNavigation, /aria-modal="true"/u);
  assert.match(mobileNavigation, /min-h-11/u);
  assert.match(mobileNavigation, /safe-area-inset/u);
  assert.match(mobileNavigation, /lg:hidden/u);
});

test("authenticated navigation logs out through the server auth boundary", () => {
  assert.match(authActions, /export async function logoutAction/u);
  assert.match(authActions, /authorizeCurrentReporter/u);
  assert.match(authActions, /if \(!authorization\.ok\) redirect\("\/login"\)/u);
  assert.match(authActions, /supabase\.auth\.signOut\(\)/u);
  assert.match(authActions, /redirect\("\/login"\)/u);
  assert.match(layout, /requireReporterSession/u);
  assert.match(layout, /action=\{logoutAction\}/u);
  assert.match(layout, />Log out</u);
  assert.match(mobileNavigation, /action=\{logoutAction\}/u);
  assert.match(mobileNavigation, />Log out</u);
  assert.match(mobileNavigation, /border-t border-border/u);
  assert.match(mobileNavigation, /w-full/u);
});

test("Reporter globals define the CMS-compatible semantic foundation", () => {
  for (const token of ["--background", "--foreground", "--card", "--border", "--destructive", "--ring", "--radius"]) {
    assert.match(globals, new RegExp(token, "u"));
  }
  assert.match(globals, /@theme inline/u);
  assert.doesNotMatch(globals, /Arial/u);
});

test("Reporter-local primitives expose the approved Phase 1 visual APIs", () => {
  for (const variant of ["primary", "secondary", "outline", "destructive"]) {
    assert.match(button, new RegExp(variant, "u"));
  }
  for (const part of ["Card", "CardHeader", "CardContent", "CardFooter"]) {
    assert.match(card, new RegExp(part, "u"));
  }
  for (const state of ["draft", "pending_review", "approved", "scheduled", "published", "rejected"]) {
    assert.match(badge, new RegExp(state, "u"));
  }
  assert.match(skeleton, /motion-reduce:animate-none/u);
});
