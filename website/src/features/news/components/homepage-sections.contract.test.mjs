import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("legacy homepage composes reusable presentation without changing its public shell",async()=>{const homepage=await readFile("src/features/news/components/homepage.tsx","utf8");const sections=await readFile("src/features/news/components/homepage-sections.tsx","utf8");for(const token of ["proto-page","proto-wrap","proto-hero-grid","proto-feed","proto-category-rails","proto-editors"]) assert.match(homepage+sections,new RegExp(token,"u"));for(const field of ["featured","topHeadlines","latest","trending","categoryRails","editorPicks"]) assert.match(homepage,new RegExp(`data\\.${field}`,"u"));assert.match(sections,/getHeroImagePresentation/u);});
