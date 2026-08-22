import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPublicReporterUrl,
  composePublicReporterMetadata,
  mapPublicReporter,
  resolveStoryReporter,
} from "./public-reporter.model.ts";

const safeRow = (overrides = {}) => ({
  public_slug: "ananya_patil",
  legal_display_name: "Ananya Patil",
  avatar_url: "https://res.cloudinary.com/inbcn/image/upload/reporter/ananya.jpg",
  public_status: "active",
  home_district: "Pune",
  bio: "Reports on civic life.",
  beats: ["civic", "health"],
  ...overrides,
});

test("maps only the exact safe public reporter fields", () => {
  const reporter = mapPublicReporter({
    ...safeRow(),
    profile_id: "11111111-1111-4111-8111-111111111111",
    phone: "+919999999999",
    latitude: 19.076,
    review_notes: "private",
  });

  assert.ok(reporter);
  assert.deepEqual(Object.keys(reporter).sort(), [
    "beats",
    "bio",
    "district",
    "legalName",
    "photoUrl",
    "slug",
    "status",
  ]);
  assert.deepEqual(reporter, {
    slug: "ananya_patil",
    legalName: "Ananya Patil",
    photoUrl: "https://res.cloudinary.com/inbcn/image/upload/reporter/ananya.jpg",
    status: "verified",
    district: "Pune",
    bio: "Reports on civic life.",
    beats: ["civic", "health"],
  });
  const serialized = JSON.stringify(reporter);
  for (const forbidden of ["profile_id", "phone", "latitude", "review_notes"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("normalizes current public membership status without erasing attribution", () => {
  assert.equal(mapPublicReporter(safeRow({ public_status: "active" }))?.status, "verified");
  assert.equal(mapPublicReporter(safeRow({ public_status: "grace" }))?.status, "verified");
  assert.equal(mapPublicReporter(safeRow({ public_status: "expired" }))?.status, "former");
  assert.equal(mapPublicReporter(safeRow({ public_status: "suspended" }))?.status, "suspended");
});

test("fails closed for absent, malformed, unbounded, or insecure projection data", () => {
  for (const row of [
    null,
    undefined,
    {},
    safeRow({ public_slug: "../private" }),
    safeRow({ public_slug: "A".repeat(33) }),
    safeRow({ legal_display_name: " " }),
    safeRow({ avatar_url: "http://res.cloudinary.com/insecure.jpg" }),
    safeRow({ avatar_url: "not a URL" }),
    safeRow({ public_status: "approved" }),
    safeRow({ beats: ["civic", "politics"] }),
    safeRow({ beats: Array.from({ length: 9 }, () => "civic") }),
  ]) {
    assert.equal(mapPublicReporter(row), null);
  }
});

test("requires both canonical publication and true reporter provenance", () => {
  const reporterRow = safeRow({ public_status: "expired" });

  assert.equal(resolveStoryReporter("published", true, reporterRow)?.status, "former");
  assert.equal(resolveStoryReporter("published", false, reporterRow), null);
  assert.equal(resolveStoryReporter("draft", true, reporterRow), null);
  assert.equal(resolveStoryReporter("archived", true, reporterRow), null);
  assert.equal(resolveStoryReporter("published", true, null), null);
});

test("builds a localized safe profile URL and canonical metadata", () => {
  assert.equal(
    buildPublicReporterUrl("hi", "ananya_patil"),
    "/hi/reporters/ananya_patil",
  );
  assert.equal(buildPublicReporterUrl("fr", "ananya_patil"), null);
  assert.equal(buildPublicReporterUrl("en", "../private"), null);

  const metadata = composePublicReporterMetadata({
    reporter: mapPublicReporter(safeRow()),
    locale: "mr",
    siteUrl: "https://inbcn.example",
  });
  assert.ok(metadata);
  assert.equal(
    metadata.canonical,
    "https://inbcn.example/mr/reporters/ananya_patil",
  );
  assert.deepEqual(metadata.openGraph.images, [
    "https://res.cloudinary.com/inbcn/image/upload/reporter/ananya.jpg",
  ]);
});
