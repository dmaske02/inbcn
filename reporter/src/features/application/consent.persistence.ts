import {
  hasCurrentConsentReceipts,
  type ConsentLocale,
  type ConsentNoticeKey,
  type ConsentReceipt,
} from "./consent.model.ts";

export type ConsentReceiptRow = Readonly<{
  applicationId: string;
  profileId: string;
  key: ConsentNoticeKey;
  version: string;
  locale: ConsentLocale;
}>;

export const CONSENT_RECEIPT_UPSERT_OPTIONS = {
  onConflict: "application_id,notice_key,notice_version",
  ignoreDuplicates: true,
} as const;

type ConsentReceiptPersistenceDependencies = Readonly<{
  upsert(rows: readonly ConsentReceiptRow[]): Promise<void>;
  read(applicationId: string, profileId: string): Promise<readonly ConsentReceipt[]>;
}>;

export function createConsentReceiptPersistence(
  dependencies: ConsentReceiptPersistenceDependencies,
) {
  return async (
    applicationId: string,
    profileId: string,
    receipts: readonly ConsentReceipt[],
  ): Promise<void> => {
    await dependencies.upsert(receipts.map((receipt) => ({
      applicationId,
      profileId,
      key: receipt.key,
      version: receipt.version,
      locale: receipt.locale,
    })));
    if (!hasCurrentConsentReceipts(await dependencies.read(applicationId, profileId))) {
      throw new Error("Consent receipt persistence was incomplete.");
    }
  };
}
