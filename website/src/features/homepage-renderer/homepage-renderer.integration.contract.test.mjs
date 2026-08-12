import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("localized route selects one complete homepage implementation",async()=>{const source=await readFile("src/app/[locale]/page.tsx","utf8");assert.match(source,/getRenderedHomepage/u);assert.match(source,/result\.data\.kind === "builder"/u);assert.match(source,/HomepageBuilderLayout/u);assert.match(source,/<Homepage locale=\{locale\} data=\{result\.data\.legacy\}/u);for(const boundary of ["Suspense","HomepageSkeleton","hasLocale","notFound","setRequestLocale"])assert.match(source,new RegExp(boundary,"u"));});

test("caught renderer diagnostics stay server-side without triggering the Next.js error overlay",async()=>{
  const source=await readFile("src/features/homepage-renderer/homepage-renderer.service.ts","utf8");
  assert.match(source,/console\.warn\("\[homepage-builder\]",JSON\.stringify\(diagnostic\)\)/u);
  assert.doesNotMatch(source,/console\.error\("\[homepage-builder\]"/u);
});
