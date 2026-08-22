import assert from "node:assert/strict";
import test from "node:test";

import {
  CONSENT_RECEIPT_UPSERT_OPTIONS,
  createConsentReceiptPersistence,
} from "./consent.persistence.ts";
import { CONSENT_NOTICE_KEYS, createConsentReceipts } from "./consent.model.ts";

test("concurrent identical consent completion is idempotent", async () => {
  assert.deepEqual(CONSENT_RECEIPT_UPSERT_OPTIONS, {
    onConflict: "application_id,notice_key,notice_version",
    ignoreDuplicates: true,
  });
  const persisted = new Map();
  const persistence = createConsentReceiptPersistence({
    upsert: async (rows) => {
      await Promise.resolve();
      for (const row of rows) {
        const key = `${row.applicationId}:${row.key}:${row.version}`;
        if (!persisted.has(key)) persisted.set(key, row);
      }
    },
    read: async (applicationId, profileId) => [...persisted.values()].filter((row) =>
      row.applicationId === applicationId && row.profileId === profileId),
  });
  const receipts = createConsentReceipts(
    { locale: "en", acceptedKeys: CONSENT_NOTICE_KEYS },
    "2026-08-22T10:00:00.000Z",
  );

  await Promise.all([
    persistence("application-1", "profile-1", receipts),
    persistence("application-1", "profile-1", receipts),
  ]);

  assert.equal(persisted.size, CONSENT_NOTICE_KEYS.length);
});
