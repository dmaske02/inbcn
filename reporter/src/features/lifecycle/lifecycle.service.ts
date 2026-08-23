import "server-only";

import { createAwsS3Presigner } from "@inbcn/domain/server/aws-s3-presigner";

import type {
  LifecycleRepository,
  LifecycleWork,
} from "./lifecycle.repository.ts";

const PAGE_SIZE = 25;
const MAX_PAGES = 10;
const WORK_CONCURRENCY = 5;
const canonicalRecordingKey = /^reporter-live\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$/u;

type RazorpayRefund = Readonly<{
  id: string;
  payment_id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: string;
}>;

type RefundProvider = Readonly<{
  findRefundByReceipt(paymentId: string, receipt: string): Promise<RazorpayRefund | null>;
  createFullRefund(input: Readonly<{
    paymentId: string;
    receipt: string;
    idempotencyKey: string;
    internalPaymentId: string;
  }>): Promise<RazorpayRefund>;
}>;

type RecordingObjectStore = Readonly<{
  deleteObject(key: string, now?: Date): Promise<"deleted" | "not_found">;
}>;

export type LifecycleSummary = Readonly<{
  ok: boolean;
  processed: number;
  failed: number;
  capped: boolean;
  counts: Readonly<Record<string, number>>;
}>;

function exactRefund(refund: RazorpayRefund, work: Extract<LifecycleWork, { kind: "refund" }>, receipt: string): boolean {
  return refund.payment_id === work.providerPaymentId
    && refund.receipt === receipt
    && refund.amount === work.amountPaise
    && refund.currency === work.currency;
}

export function createLifecycleService(dependencies: Readonly<{
  repository: LifecycleRepository;
  refundProvider: RefundProvider | null;
  objectStore: RecordingObjectStore | null;
}>) {
  async function refund(work: Extract<LifecycleWork, { kind: "refund" }>): Promise<boolean> {
    if (!dependencies.refundProvider) {
      await dependencies.repository.failRefund({
        paymentId: work.id,
        leaseToken: work.leaseToken,
        failureCode: "provider-not-configured",
      });
      return false;
    }
    const receipt = `${work.id}:${work.attempt}`;
    let providerRefund: RazorpayRefund;
    try {
      providerRefund = await dependencies.refundProvider.findRefundByReceipt(
        work.providerPaymentId,
        receipt,
      ) ?? await dependencies.refundProvider.createFullRefund({
        paymentId: work.providerPaymentId,
        receipt,
        idempotencyKey: `${work.id}_${work.attempt}`,
        internalPaymentId: work.id,
      });
    } catch {
      await dependencies.repository.failRefund({
        paymentId: work.id,
        leaseToken: work.leaseToken,
        failureCode: "provider-request-failed",
      });
      return false;
    }
    if (!exactRefund(providerRefund, work, receipt)) {
      await dependencies.repository.failRefund({
        paymentId: work.id,
        leaseToken: work.leaseToken,
        failureCode: "provider-response-mismatch",
      });
      return false;
    }
    return dependencies.repository.completeRefund({
      paymentId: work.id,
      leaseToken: work.leaseToken,
      refundId: providerRefund.id,
      providerPaymentId: providerRefund.payment_id,
      amountPaise: providerRefund.amount,
      currency: providerRefund.currency,
    });
  }

  async function deleteRecording(
    work: Extract<LifecycleWork, { kind: "recording_delete" }>,
  ): Promise<boolean> {
    if (!dependencies.objectStore) {
      await dependencies.repository.failRecordingDeletion({
        recordingId: work.id,
        leaseToken: work.leaseToken,
        objectKey: work.objectKey,
        failureCode: "provider-not-configured",
      });
      return false;
    }
    let result: "deleted" | "not_found";
    try {
      result = await dependencies.objectStore.deleteObject(work.objectKey);
    } catch {
      await dependencies.repository.failRecordingDeletion({
        recordingId: work.id,
        leaseToken: work.leaseToken,
        objectKey: work.objectKey,
        failureCode: "provider-request-failed",
      });
      return false;
    }
    return dependencies.repository.completeRecordingDeletion({
      recordingId: work.id,
      leaseToken: work.leaseToken,
      objectKey: work.objectKey,
      result,
    });
  }

  async function processItem(item: LifecycleWork): Promise<boolean> {
    return item.kind === "refund"
      ? refund(item)
      : item.kind === "recording_delete"
        ? deleteRecording(item)
        : true;
  }

  async function processPage(work: readonly LifecycleWork[]) {
    const outcomes: Array<
      | Readonly<{ item: LifecycleWork; value: boolean }>
      | Readonly<{ error: unknown; item: LifecycleWork }>
    > = new Array(work.length);
    let nextIndex = 0;
    const workers = Array.from(
      { length: Math.min(WORK_CONCURRENCY, work.length) },
      async () => {
        while (nextIndex < work.length) {
          const index = nextIndex;
          nextIndex += 1;
          const item = work[index];
          try {
            outcomes[index] = { item, value: await processItem(item) };
          } catch (error) {
            outcomes[index] = { error, item };
          }
        }
      },
    );
    await Promise.all(workers);
    return outcomes;
  }

  return {
    async run(now: Date): Promise<LifecycleSummary> {
      if (!Number.isFinite(now.getTime())) throw new TypeError("Invalid lifecycle time.");
      const counts: Record<string, number> = {};
      let processed = 0;
      let failed = 0;
      let capped = false;

      for (let page = 0; page < MAX_PAGES; page += 1) {
        const work = await dependencies.repository.claimPage(PAGE_SIZE);
        if (work.length === 0) break;
        if (page === MAX_PAGES - 1) capped = true;

        const outcomes = await processPage(work);
        const rejected = outcomes.find((outcome) => "error" in outcome);
        if (rejected && "error" in rejected) throw rejected.error;
        for (const outcome of outcomes) {
          if (!("error" in outcome) && outcome.value) {
            processed += 1;
            counts[outcome.item.kind] = (counts[outcome.item.kind] ?? 0) + 1;
          } else {
            failed += 1;
          }
        }
      }

      return { ok: failed === 0, processed, failed, capped, counts };
    },
  } as const;
}

export function createRecordingObjectStore(config: Readonly<{
  accessKey: string;
  secret: string;
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  fetchImpl?: typeof fetch;
}>): RecordingObjectStore {
  const signer = createAwsS3Presigner(config);
  const fetchImpl = config.fetchImpl ?? fetch;
  return {
    async deleteObject(key, now = new Date()) {
      if (!canonicalRecordingKey.test(key)) throw new Error("Private object is unavailable.");
      const response = await fetchImpl(signer.signDelete(key, 60, now), {
        method: "DELETE",
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 404) return "not_found";
      if (response.ok) return "deleted";
      throw new Error("Private object deletion failed.");
    },
  };
}

export async function runReporterLifecycle(now = new Date()): Promise<LifecycleSummary> {
  const [{ env }, { createRazorpayClient }, { lifecycleRepository }] = await Promise.all([
    import("../../config/env.ts"),
    import("../payments/razorpay.client.ts"),
    import("./lifecycle.repository.ts"),
  ]);
  const { keyId, keySecret } = env.server.razorpay;
  const storage = env.server.liveKit.storage;
  let objectStore: RecordingObjectStore | null = null;
  if (storage.accessKey && storage.secret && storage.bucket && storage.region) {
    try {
      objectStore = createRecordingObjectStore({
        accessKey: storage.accessKey,
        secret: storage.secret,
        bucket: storage.bucket,
        region: storage.region,
        endpoint: storage.endpoint,
        forcePathStyle: storage.forcePathStyle,
      });
    } catch {
      objectStore = null;
    }
  }
  return createLifecycleService({
    repository: lifecycleRepository,
    refundProvider: keyId && keySecret ? createRazorpayClient({ keyId, keySecret }) : null,
    objectStore,
  }).run(now);
}
