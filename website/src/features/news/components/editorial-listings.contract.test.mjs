import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const categoryPageUrl = new URL(
  "../../../app/[locale]/category/[slug]/page.tsx",
  import.meta.url,
);
const searchPageUrl = new URL(
  "../../../app/[locale]/search/page.tsx",
  import.meta.url,
);
const listingFeedUrl = new URL("./editorial-listing-feed.tsx", import.meta.url);

test("category and search pages render their existing view models through one ledger feed", async () => {
  const [categoryPage, searchPage] = await Promise.all([
    readFile(categoryPageUrl, "utf8"),
    readFile(searchPageUrl, "utf8"),
  ]);

  for (const source of [categoryPage, searchPage]) {
    assert.match(source, /EditorialListingFeed/u);
    assert.match(source, /LedgerStory/u);
    assert.doesNotMatch(source, /AdvertisementPlaceholder|<Image|<article/u);
  }

  assert.match(categoryPage, /data\.hero/u);
  assert.match(categoryPage, /data\.stories/u);
  assert.match(categoryPage, /category:\s*data\.category\.name/u);
  assert.match(searchPage, /data\.results/u);
  assert.match(searchPage, /category:\s*story\.category/u);
});

test("listing feeds insert one reserved sponsor row after the third story", async () => {
  const source = await readFile(listingFeedUrl, "utf8");

  assert.match(source, /const SPONSOR_AFTER_STORIES = 3/u);
  assert.match(source, /<LedgerStoryRow/u);
  assert.match(source, /<EditorialSponsorRow/u);
  assert.match(source, /index \+ 1 === SPONSOR_AFTER_STORIES/u);
  assert.match(source, /index < stories\.length - 1/u);
  assert.match(source, /slotId=\{sponsorSlotId\}/u);
});

test("listing refactor preserves loaders, URL state, pagination, breadcrumbs, and metadata", async () => {
  const [categoryPage, searchPage] = await Promise.all([
    readFile(categoryPageUrl, "utf8"),
    readFile(searchPageUrl, "utf8"),
  ]);

  assert.match(categoryPage, /generateMetadata/u);
  assert.match(categoryPage, /getCategoryPageData\(locale, slug, page\)/u);
  assert.match(categoryPage, /pageHref\(locale, slug/u);
  assert.match(categoryPage, /<Breadcrumb/u);
  assert.match(categoryPage, /<Pagination/u);

  assert.match(searchPage, /generateMetadata/u);
  assert.match(searchPage, /getSearchPageData\(locale, resolvedSearchParams\)/u);
  assert.match(searchPage, /buildSearchHref/u);
  assert.match(searchPage, /<SearchForm/u);
  assert.match(searchPage, /<Breadcrumb/u);
  assert.match(searchPage, /<Pagination/u);
});
