import "server-only";

import { createAwsS3Presigner } from "@inbcn/domain/server/aws-s3-presigner";

import type {
  LifecycleRepository,
  LifecycleWork,
} from "./lifecycle.repository.ts";

const PAGE_SIZE = 25;
const MAX_PAGES = 10;
const WORK_CONCURRENCY = 5;
const SAFE_RUN_MS = 50_000;
const PROVIDER_CALL_BUDGET_MS = 10_000;
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
  fetchRefund(paymentId: string, refundId: string): Promise<RazorpayRefund>;
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

type ScheduledProviderCall<T> =
  | Readonly<{ started: false }>
  | Readonly<{ started: true; value: T }>;

export type LifecycleSummary = Readonly<{
  ok: boolean;
  processed: number;
  failed: number;
  capped: boolean;
  counts: Readonly<Record<string, number>>;
}>;

function exactRefund(refund: RazorpayRefund, work: Extract<LifecycleWork, { kind: "refund" }>, receipt: string): boolean {
  return (work.providerRefundId === null || refund.id === work.providerRefundId)
    && refund.payment_id === work.providerPaymentId
    && refund.receipt === receipt
    && refund.amount === work.amountPaise
    && refund.currency === work.currency;
}

export function createLifecycleService(dependencies: Readonly<{
  repository: LifecycleRepository;
  refundProvider: RefundProvider | null;
  objectStore: RecordingObjectStore | null;
  nowMs?: () => number;
}>) {
  const nowMs = dependencies.nowMs ?? (() => performance.now());

  async function providerCall<T>(
    deadline: number,
    call: () => Promise<T>,
  ): Promise<ScheduledProviderCall<T>> {
    if (nowMs() + PROVIDER_CALL_BUDGET_MS > deadline) return { started: false };
    return { started: true, value: await call() };
  }

  async function refund(
    work: Extract<LifecycleWork, { kind: "refund" }>,
    deadline: number,
  ): Promise<boolean | "deferred"> {
    if (!dependencies.refundProvider) {
      await dependencies.repository.failRefund({
        paymentId: work.id,
        leaseToken: work.leaseToken,
        failureCode: "provider-not-configured",
      });
      return false;
    }
    const receipt = `${work.id}:${work.attempt}`;

    if (work.providerRefundId !== null) {
      let fetched: ScheduledProviderCall<RazorpayRefund>;
      try {
        fetched = await providerCall(deadline, () =>
          dependencies.refundProvider!.fetchRefund(
            work.providerPaymentId,
            work.providerRefundId!,
          ));
      } catch {
        await dependencies.repository.failRefund({
          paymentId: work.id,
          leaseToken: work.leaseToken,
          failureCode: "provider-request-failed",
        });
        return false;
      }
      if (!fetched.started) return "deferred";
      const providerRefund = fetched.value;
      if (!exactRefund(providerRefund, work, receipt)) {
        await dependencies.repository.failRefund({
          paymentId: work.id,
          leaseToken: work.leaseToken,
          failureCode: "provider-response-mismatch",
        });
        return false;
      }
      if (providerRefund.status === "pending") {
        await dependencies.repository.failRefund({
          paymentId: work.id,
          leaseToken: work.leaseToken,
          failureCode: "provider-still-pending",
        });
        return false;
      }
      if (providerRefund.status !== "processed" && providerRefund.status !== "failed") {
        await dependencies.repository.failRefund({
          paymentId: work.id,
          leaseToken: work.leaseToken,
          failureCode: "provider-response-mismatch",
        });
        return false;
      }
      return dependencies.repository.reconcileRefund({
        paymentId: work.id,
        leaseToken: work.leaseToken,
        refundId: providerRefund.id,
        providerPaymentId: providerRefund.payment_id,
        receipt,
        amountPaise: providerRefund.amount,
        currency: providerRefund.currency,
        status: providerRefund.status,
      });
    }

    let providerRefund: RazorpayRefund;
    try {
      const found = await providerCall(deadline, () =>
        dependencies.refundProvider!.findRefundByReceipt(
          work.providerPaymentId,
          receipt,
        ));
      if (!found.started) return "deferred";
      if (found.value) {
        providerRefund = found.value;
      } else {
        const created = await providerCall(deadline, () =>
          dependencies.refundProvider!.createFullRefund({
            paymentId: work.providerPaymentId,
            receipt,
            idempotencyKey: `${work.id}_${work.attempt}`,
            internalPaymentId: work.id,
          }));
        if (!created.started) return "deferred";
        providerRefund = created.value;
      }
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
    deadline: number,
  ): Promise<boolean | "deferred"> {
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
      const deletion = await providerCall(deadline, () =>
        dependencies.objectStore!.deleteObject(work.objectKey));
      if (!deletion.started) return "deferred";
      result = deletion.value;
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

  async function processItem(
    item: LifecycleWork,
    deadline: number,
  ): Promise<boolean | "deferred"> {
    return item.kind === "refund"
      ? refund(item, deadline)
      : item.kind === "recording_delete"
        ? deleteRecording(item, deadline)
        : true;
  }

  async function processPage(work: readonly LifecycleWork[], deadline: number) {
    const outcomes: Array<
      | Readonly<{ item: LifecycleWork; value: boolean | "deferred" }>
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
            outcomes[index] = { item, value: await processItem(item, deadline) };
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
      const deadline = nowMs() + SAFE_RUN_MS;

      for (let page = 0; page < MAX_PAGES; page += 1) {
        if (nowMs() + PROVIDER_CALL_BUDGET_MS > deadline) {
          capped = true;
          break;
        }
        const work = await dependencies.repository.claimPage(PAGE_SIZE);
        if (work.length === 0) break;
        if (page === MAX_PAGES - 1) capped = true;

        const outcomes = await processPage(work, deadline);
        const rejected = outcomes.find((outcome) => "error" in outcome);
        if (rejected && "error" in rejected) throw rejected.error;
        for (const outcome of outcomes) {
          if (!("error" in outcome) && outcome.value === true) {
            processed += 1;
            counts[outcome.item.kind] = (counts[outcome.item.kind] ?? 0) + 1;
          } else if (!("error" in outcome) && outcome.value === "deferred") {
            capped = true;
          } else {
            failed += 1;
          }
        }
        if (capped) break;
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
