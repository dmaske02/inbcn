import assert from "node:assert/strict";
import test from "node:test";

import {
  CONSENT_NOTICE_KEYS,
  createConsentReceipts,
  getConsentNotices,
  missingConsentReceipts,
  hasCurrentConsentReceipts,
} from "./consent.model.ts";

test("renders every separate notice unchecked in English, Hindi, and Marathi", () => {
  for (const locale of ["en", "hi", "mr"]) {
    const notices = getConsentNotices(locale);
    assert.deepEqual(notices.map(({ key }) => key), CONSENT_NOTICE_KEYS);
    assert.equal(notices.every(({ accepted }) => accepted === false), true);
    assert.equal(notices.every(({ text }) => text.trim().length > 20), true);
  }
  assert.notEqual(getConsentNotices("en")[0].text, getConsentNotices("hi")[0].text);
  assert.notEqual(getConsentNotices("hi")[0].text, getConsentNotices("mr")[0].text);
});

test("rejects payment readiness until every notice is separately accepted", () => {
  assert.throws(
    () => createConsentReceipts({ locale: "en", acceptedKeys: CONSENT_NOTICE_KEYS.slice(1) }, "2026-08-22T10:00:00.000Z"),
    /every consent notice/iu,
  );
});

test("creates versioned receipts with server timestamps and gates payment on persisted receipts", () => {
  const consentedAt = "2026-08-22T10:00:00.000Z";
  const receipts = createConsentReceipts(
    { locale: "mr", acceptedKeys: CONSENT_NOTICE_KEYS },
    consentedAt,
  );

  assert.equal(receipts.length, 6);
  assert.equal(receipts.every((receipt) => receipt.locale === "mr"), true);
  assert.equal(receipts.every((receipt) => receipt.consentedAt === consentedAt), true);
  assert.equal(receipts.every((receipt) => receipt.version.length > 0), true);
  assert.equal(hasCurrentConsentReceipts(receipts), true);
  assert.equal(hasCurrentConsentReceipts(receipts.slice(1)), false);
  assert.equal(hasCurrentConsentReceipts(receipts.map((receipt, index) => index === 0
    ? { ...receipt, withdrawnAt: consentedAt }
    : receipt)), false);
});

test("retries only consent receipts not already persisted", () => {
  const receipts = createConsentReceipts(
    { locale: "en", acceptedKeys: CONSENT_NOTICE_KEYS },
    "2026-08-22T10:00:00.000Z",
  );
  assert.deepEqual(
    missingConsentReceipts(receipts, receipts.slice(0, 2)).map(({ key }) => key),
    CONSENT_NOTICE_KEYS.slice(2),
  );
});
