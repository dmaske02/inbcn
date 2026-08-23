import "server-only";

import { z } from "zod";

import { createAdminClient } from "../../lib/supabase/admin.ts";

const providerId = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/u);
const completedWork = z.object({
  kind: z.enum([
    "application_reminder",
    "application_cancelled",
    "membership_reminder",
    "membership_grace",
    "membership_expired",
    "coordinate_delete",
  ]),
}).strict();
const refundWork = z.object({
  kind: z.literal("refund"),
  id: z.uuid(),
  lease_token: z.uuid(),
  attempt: z.number().int().positive(),
  provider_payment_id: providerId,
  provider_refund_id: providerId.nullable(),
  amount_paise: z.literal(10_000),
  currency: z.literal("INR"),
}).strict();
const recordingWork = z.object({
  kind: z.literal("recording_delete"),
  id: z.uuid(),
  lease_token: z.uuid(),
  attempt: z.number().int().positive(),
  object_key: z.string().regex(
    /^reporter-live\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.mp4$/u,
  ),
}).strict();
const workPage = z.array(z.union([completedWork, refundWork, recordingWork]));

export type LifecycleWork =
  | Readonly<{ kind: z.infer<typeof completedWork>["kind"] }>
  | Readonly<{
      kind: "refund";
      id: string;
      leaseToken: string;
      attempt: number;
      providerPaymentId: string;
      providerRefundId: string | null;
      amountPaise: 10_000;
      currency: "INR";
    }>
  | Readonly<{
      kind: "recording_delete";
      id: string;
      leaseToken: string;
      attempt: number;
      objectKey: string;
    }>;

export type LifecycleRepository = Readonly<{
  claimPage(limit: number): Promise<readonly LifecycleWork[]>;
  completeRefund(input: Readonly<{
    paymentId: string;
    leaseToken: string;
    refundId: string;
    providerPaymentId: string;
    amountPaise: number;
    currency: string;
  }>): Promise<boolean>;
  reconcileRefund(input: Readonly<{
    paymentId: string;
    leaseToken: string;
    refundId: string;
    providerPaymentId: string;
    receipt: string;
    amountPaise: number;
    currency: string;
    status: "processed" | "failed";
  }>): Promise<boolean>;
  failRefund(input: Readonly<{
    paymentId: string;
    leaseToken: string;
    failureCode:
      | "provider-not-configured"
      | "provider-request-failed"
      | "provider-response-mismatch"
      | "provider-still-pending";
  }>): Promise<boolean>;
  completeRecordingDeletion(input: Readonly<{
    recordingId: string;
    leaseToken: string;
    objectKey: string;
    result: "deleted" | "not_found";
  }>): Promise<boolean>;
  failRecordingDeletion(input: Readonly<{
    recordingId: string;
    leaseToken: string;
    objectKey: string;
    failureCode: "provider-not-configured" | "provider-request-failed";
  }>): Promise<boolean>;
}>;

export class LifecycleRepositoryError extends Error {
  constructor() {
    super("Reporter lifecycle persistence is unavailable.");
    this.name = "LifecycleRepositoryError";
  }
}

function assertResult(error: unknown, data: boolean | null): boolean {
  if (error || data !== true) throw new LifecycleRepositoryError();
  return true;
}

export const lifecycleRepository: LifecycleRepository = {
  async claimPage(limit) {
    const { data, error } = await createAdminClient().rpc("claim_reporter_lifecycle", {
      p_limit: limit,
    });
    if (error) throw new LifecycleRepositoryError();
    const parsed = workPage.safeParse(data);
    if (!parsed.success) throw new LifecycleRepositoryError();
    return parsed.data.map((work): LifecycleWork => {
      if (work.kind === "refund") return {
        kind: work.kind,
        id: work.id,
        leaseToken: work.lease_token,
        attempt: work.attempt,
        providerPaymentId: work.provider_payment_id,
        providerRefundId: work.provider_refund_id,
        amountPaise: work.amount_paise,
        currency: work.currency,
      };
      if (work.kind === "recording_delete") return {
        kind: work.kind,
        id: work.id,
        leaseToken: work.lease_token,
        attempt: work.attempt,
        objectKey: work.object_key,
      };
      return { kind: work.kind };
    });
  },

  async completeRefund(input) {
    const { data, error } = await createAdminClient().rpc("record_reporter_refund_request", {
      p_payment_id: input.paymentId,
      p_refund_request_token: input.leaseToken,
      p_razorpay_refund_id: input.refundId,
      p_razorpay_payment_id: input.providerPaymentId,
      p_amount_paise: input.amountPaise,
      p_currency: input.currency,
    });
    return assertResult(error, data);
  },

  async failRefund(input) {
    const { data, error } = await createAdminClient().rpc("fail_reporter_lifecycle_refund", {
      p_payment_id: input.paymentId,
      p_lease_token: input.leaseToken,
      p_failure_code: input.failureCode,
    });
    return assertResult(error, data);
  },

  async reconcileRefund(input) {
    const { data, error } = await createAdminClient().rpc("reconcile_reporter_refund", {
      p_payment_id: input.paymentId,
      p_lease_token: input.leaseToken,
      p_razorpay_refund_id: input.refundId,
      p_razorpay_payment_id: input.providerPaymentId,
      p_receipt: input.receipt,
      p_amount_paise: input.amountPaise,
      p_currency: input.currency,
      p_provider_status: input.status,
    });
    return assertResult(error, data);
  },

  async completeRecordingDeletion(input) {
    const { data, error } = await createAdminClient().rpc("complete_reporter_recording_deletion", {
      p_recording_id: input.recordingId,
      p_lease_token: input.leaseToken,
      p_object_key: input.objectKey,
      p_result: input.result,
    });
    return assertResult(error, data);
  },

  async failRecordingDeletion(input) {
    const { data, error } = await createAdminClient().rpc("fail_reporter_recording_deletion", {
      p_recording_id: input.recordingId,
      p_lease_token: input.leaseToken,
      p_object_key: input.objectKey,
      p_failure_code: input.failureCode,
    });
    return assertResult(error, data);
  },
};
