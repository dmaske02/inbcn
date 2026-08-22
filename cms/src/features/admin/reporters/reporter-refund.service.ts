import "server-only";

import type { Json } from "@inbcn/database";
import { z } from "zod";

const REFUND_AMOUNT_PAISE = 10_000;
const REFUND_CURRENCY = "INR";
const uuid = z.uuid();
const providerId = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/u);
const refundIdempotencyKey = z.string().min(10).regex(/^[A-Za-z0-9_-]+$/u);
const refundSchema = z.object({
  id: providerId,
  entity: z.literal("refund").optional(),
  payment_id: providerId,
  amount: z.number().int(),
  currency: z.string(),
  receipt: z.string().trim().min(1).max(40).nullable(),
  status: z.enum(["pending", "processed", "failed"]),
});
const refundCollectionSchema = z.object({
  entity: z.literal("collection"),
  count: z.number().int().nonnegative(),
  items: z.array(refundSchema),
});

type Refund = z.infer<typeof refundSchema>;

export class ReporterRefundError extends Error {
  readonly code:
    | "configuration-unavailable"
    | "forbidden"
    | "invalid-request"
    | "invalid-state"
    | "refund-busy"
    | "refund-mismatch"
    | "provider-failed";
  readonly httpStatus: number;

  constructor(code: ReporterRefundError["code"], httpStatus = 400) {
    super("The refund request could not be completed.");
    this.name = "ReporterRefundError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export class ReporterRefundProviderError extends Error {
  readonly definite: boolean;

  constructor(definite = false) {
    super("The refund provider request could not be completed.");
    this.name = "ReporterRefundProviderError";
    this.definite = definite;
  }
}

type RefundReservation =
  | Readonly<{
      state: "claimed";
      token: string;
      attempt: number;
      providerPaymentId: string;
      amountPaise: number;
      currency: string;
    }>
  | Readonly<{ state: "busy" | "invalid" | "pending" | "processed" }>;

type RefundRepository = Readonly<{
  reserveRefund(input: Readonly<{ paymentId: string; actorId: string }>): Promise<RefundReservation>;
  recordRefundRequest(input: Readonly<{
    paymentId: string;
    processingToken: string;
    refundId: string;
    providerPaymentId: string;
    amountPaise: number;
    currency: string;
  }>): Promise<unknown>;
  failRefundRequest(input: Readonly<{ paymentId: string; processingToken: string }>): Promise<unknown>;
}>;

type RefundProvider = Readonly<{
  findRefundByReceipt(paymentId: string, receipt: string): Promise<Refund | null>;
  createFullRefund(input: Readonly<{
    paymentId: string;
    amountPaise: number;
    currency: string;
    receipt: string;
    idempotencyKey: string;
    notes: Readonly<{ payment_id: string }>;
  }>): Promise<Refund>;
}>;

function assertExactRefund(
  refund: Refund,
  expected: Readonly<{
    providerPaymentId: string;
    receipt: string;
    amountPaise: number;
    currency: string;
  }>,
): void {
  if (refund.payment_id !== expected.providerPaymentId
    || refund.receipt !== expected.receipt
    || refund.amount !== expected.amountPaise
    || refund.currency !== expected.currency
    || refund.status === "failed") {
    throw new ReporterRefundError("refund-mismatch", 422);
  }
}

export function createReporterRefundService(dependencies: Readonly<{
  repository: RefundRepository;
  provider: RefundProvider;
}>) {
  return {
    async requestFullRefund(
      actor: Readonly<{ id: string; role: string }>,
      paymentIdInput: string,
    ) {
      if (actor.role !== "admin") {
        throw new ReporterRefundError("forbidden", 403);
      }
      const paymentId = uuid.safeParse(paymentIdInput);
      const actorId = uuid.safeParse(actor.id);
      if (!paymentId.success || !actorId.success) {
        throw new ReporterRefundError("invalid-request", 400);
      }

      const reservation = await dependencies.repository.reserveRefund({
        paymentId: paymentId.data,
        actorId: actorId.data,
      });
      if (reservation.state === "pending") return { status: "refund_pending" } as const;
      if (reservation.state === "processed") return { status: "refunded" } as const;
      if (reservation.state === "busy") {
        throw new ReporterRefundError("refund-busy", 409);
      }
      if (reservation.state === "invalid") {
        throw new ReporterRefundError("invalid-state", 409);
      }
      if (reservation.state !== "claimed") {
        throw new ReporterRefundError("invalid-state", 409);
      }
      if (reservation.amountPaise !== REFUND_AMOUNT_PAISE
        || reservation.currency !== REFUND_CURRENCY) {
        throw new ReporterRefundError("refund-mismatch", 422);
      }

      const receipt = `${paymentId.data}:${reservation.attempt}`;
      const idempotencyKey = `${paymentId.data}_${reservation.attempt}`;
      try {
        const refund = await dependencies.provider.findRefundByReceipt(
          reservation.providerPaymentId,
          receipt,
        ) ?? await dependencies.provider.createFullRefund({
          paymentId: reservation.providerPaymentId,
          amountPaise: REFUND_AMOUNT_PAISE,
          currency: REFUND_CURRENCY,
          receipt,
          idempotencyKey,
          notes: { payment_id: paymentId.data },
        });
        assertExactRefund(refund, {
          providerPaymentId: reservation.providerPaymentId,
          receipt,
          amountPaise: REFUND_AMOUNT_PAISE,
          currency: REFUND_CURRENCY,
        });
        await dependencies.repository.recordRefundRequest({
          paymentId: paymentId.data,
          processingToken: reservation.token,
          refundId: refund.id,
          providerPaymentId: refund.payment_id,
          amountPaise: refund.amount,
          currency: refund.currency,
        });
        // Even a synchronous `processed` response waits for a signed webhook.
        return { status: "refund_pending" } as const;
      } catch (error) {
        if (error instanceof ReporterRefundProviderError && error.definite) {
          try {
            await dependencies.repository.failRefundRequest({
              paymentId: paymentId.data,
              processingToken: reservation.token,
            });
          } catch {
            // A stale database lease is safe to retry through the same receipt.
          }
        }
        if (error instanceof ReporterRefundError) throw error;
        throw new ReporterRefundError("provider-failed", 502);
      }
    },
  } as const;
}

function jsonRecord(value: Json): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ReporterRefundError("invalid-state", 500);
  }
  return value;
}

const refundRepository: RefundRepository = {
  async reserveRefund({ paymentId, actorId }) {
    const { createAdminClient } = await import("../../../lib/supabase/admin.ts");
    const { data, error } = await createAdminClient().rpc("reserve_reporter_refund", {
      p_payment_id: paymentId,
      p_actor_id: actorId,
    });
    if (error) throw new ReporterRefundError("invalid-state", 500);
    const value = jsonRecord(data);
    if (value.state === "claimed"
      && typeof value.token === "string"
      && typeof value.attempt === "number"
      && typeof value.provider_payment_id === "string"
      && typeof value.amount_paise === "number"
      && typeof value.currency === "string") {
      return {
        state: "claimed",
        token: value.token,
        attempt: value.attempt,
        providerPaymentId: value.provider_payment_id,
        amountPaise: value.amount_paise,
        currency: value.currency,
      };
    }
    if (value.state === "busy" || value.state === "invalid"
      || value.state === "pending" || value.state === "processed") {
      return { state: value.state };
    }
    throw new ReporterRefundError("invalid-state", 500);
  },

  async recordRefundRequest(input) {
    const { createAdminClient } = await import("../../../lib/supabase/admin.ts");
    const { data, error } = await createAdminClient().rpc("record_reporter_refund_request", {
      p_payment_id: input.paymentId,
      p_refund_request_token: input.processingToken,
      p_razorpay_refund_id: input.refundId,
      p_razorpay_payment_id: input.providerPaymentId,
      p_amount_paise: input.amountPaise,
      p_currency: input.currency,
    });
    if (error || !data) throw new ReporterRefundError("invalid-state", 500);
  },

  async failRefundRequest(input) {
    const { createAdminClient } = await import("../../../lib/supabase/admin.ts");
    const { data, error } = await createAdminClient().rpc("fail_reporter_refund_request", {
      p_payment_id: input.paymentId,
      p_refund_request_token: input.processingToken,
    });
    if (error || !data) throw new ReporterRefundError("invalid-state", 500);
  },
};

export function createRazorpayRefundProvider(options: Readonly<{
  keyId: string;
  keySecret: string;
  fetchImpl?: typeof fetch;
}>): RefundProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const authorization = `Basic ${Buffer.from(`${options.keyId}:${options.keySecret}`).toString("base64")}`;

  async function request(path: string, init?: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`https://api.razorpay.com/v1${path}`, {
        ...init,
        cache: "no-store",
        headers: {
          authorization,
          accept: "application/json",
          ...(init?.body ? { "content-type": "application/json" } : {}),
          ...(init?.headers as Readonly<Record<string, string>> | undefined),
        },
      });
    } catch {
      throw new ReporterRefundProviderError(false);
    }
    if (!response.ok) {
      // Any provider response can follow an accepted request. Keep the same
      // database attempt and reconcile with its receipt/idempotency key.
      throw new ReporterRefundProviderError(false);
    }
    try {
      return await response.json();
    } catch {
      throw new ReporterRefundProviderError(false);
    }
  }

  return {
    async findRefundByReceipt(paymentIdInput, receipt) {
      const paymentId = providerId.parse(paymentIdInput);
      const result = refundCollectionSchema.safeParse(await request(
        `/payments/${encodeURIComponent(paymentId)}/refunds?count=100`,
      ));
      if (!result.success) throw new ReporterRefundProviderError(false);
      const matches = result.data.items.filter((item) => item.receipt === receipt);
      if (matches.length > 1) throw new ReporterRefundProviderError(false);
      return matches[0] ?? null;
    },

    async createFullRefund(input) {
      if (input.amountPaise !== REFUND_AMOUNT_PAISE
        || input.currency !== REFUND_CURRENCY) {
        throw new ReporterRefundProviderError(true);
      }
      const parsedIdempotencyKey = refundIdempotencyKey.safeParse(input.idempotencyKey);
      if (!parsedIdempotencyKey.success) {
        throw new ReporterRefundProviderError(true);
      }
      const paymentId = providerId.parse(input.paymentId);
      const parsed = refundSchema.safeParse(await request(
        `/payments/${encodeURIComponent(paymentId)}/refund`,
        {
          method: "POST",
          headers: { "X-Refund-Idempotency": parsedIdempotencyKey.data },
          body: JSON.stringify({
            amount: input.amountPaise,
            receipt: input.receipt,
            notes: input.notes,
          }),
        },
      ));
      if (!parsed.success) throw new ReporterRefundProviderError(false);
      return parsed.data;
    },
  };
}

export async function requestFullRefund(paymentId: string) {
  const [{ requireAdminUser }, { env }] = await Promise.all([
    import("../auth/server.ts"),
    import("../../../config/env.ts"),
  ]);
  const actor = await requireAdminUser();
  if (actor.role !== "admin") {
    throw new ReporterRefundError("forbidden", 403);
  }
  const { keyId, keySecret } = env.server.razorpay;
  if (!keyId || !keySecret) {
    throw new ReporterRefundError("configuration-unavailable", 503);
  }
  return createReporterRefundService({
    repository: refundRepository,
    provider: createRazorpayRefundProvider({ keyId, keySecret }),
  }).requestFullRefund(actor, paymentId);
}
