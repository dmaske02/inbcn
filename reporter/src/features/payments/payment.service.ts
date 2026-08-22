import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import { env } from "../../config/env.ts";
import { getConsentNotices } from "../application/consent.model.ts";
import type { ReporterAuthorizationResult } from "../auth/authorization.model.ts";
import {
  REPORTER_PAYMENT_AMOUNT_PAISE,
  REPORTER_PAYMENT_CURRENCY,
} from "./payment.model.ts";
import { RazorpayClientError, createRazorpayClient } from "./razorpay.client.ts";
import { verifyHmac } from "./razorpay.signature.ts";

const providerId = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/u);
const eventHeaderId = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/u);
const supportedEvent = z.enum([
  "payment.captured",
  "order.paid",
  "refund.processed",
  "refund.failed",
]);
const eventEnvelopeSchema = z.object({
  entity: z.literal("event"),
  event: supportedEvent,
  payload: z.record(z.string(), z.unknown()),
  created_at: z.number().int().positive(),
});
const paymentEntitySchema = z.object({
  id: providerId,
  entity: z.literal("payment"),
  order_id: providerId,
  amount: z.number().int(),
  currency: z.string(),
  status: z.literal("captured"),
  captured: z.literal(true),
  created_at: z.number().int().positive(),
});
const orderEntitySchema = z.object({
  id: providerId,
  entity: z.literal("order"),
  amount: z.number().int(),
  amount_paid: z.number().int(),
  currency: z.string(),
  status: z.literal("paid"),
  created_at: z.number().int().positive(),
});
const refundEntitySchema = z.object({
  id: providerId,
  entity: z.literal("refund"),
  payment_id: providerId,
  amount: z.number().int(),
  currency: z.string(),
  status: z.enum(["processed", "failed"]),
});
const paymentPayloadSchema = z.object({
  payment: z.object({ entity: paymentEntitySchema }),
});
const paidOrderPayloadSchema = paymentPayloadSchema.extend({
  order: z.object({ entity: orderEntitySchema }),
});
const refundPayloadSchema = z.object({
  refund: z.object({ entity: refundEntitySchema }),
});

export type PaymentServiceErrorCode =
  | "configuration-unavailable"
  | "forbidden"
  | "invalid-payment-signature"
  | "invalid-request"
  | "invalid-state"
  | "invalid-webhook-signature"
  | "not-found"
  | "order-busy"
  | "payment-mismatch"
  | "provider-failed";

export class PaymentServiceError extends Error {
  readonly code: PaymentServiceErrorCode;
  readonly httpStatus: number;

  constructor(code: PaymentServiceErrorCode, httpStatus: number) {
    super("The payment request could not be completed.");
    this.name = "PaymentServiceError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

type Actor = Extract<ReporterAuthorizationResult, { ok: true }>;
type Claim =
  | Readonly<{ state: "claimed"; token: string }>
  | Readonly<{ state: "busy" | "processed" }>;
type OrderReservation =
  | Readonly<{ state: "claimed"; paymentId: string; token: string }>
  | Readonly<{ state: "existing"; orderId: string }>
  | Readonly<{ state: "busy" | "invalid" | "paid" }>;

type PaymentRepository = Readonly<{
  reserveOrder(input: Readonly<{
    profileId: string;
    applicationId: string | null;
    purpose: "application" | "renewal";
    requiredConsents: readonly Readonly<{ key: string; version: string }>[];
  }>): Promise<OrderReservation>;
  completeOrder(input: Readonly<{ paymentId: string; token: string; orderId: string }>): Promise<unknown>;
  failOrder(input: Readonly<{ paymentId: string; token: string }>): Promise<unknown>;
  getOwnedOrder(input: Readonly<{ profileId: string; orderId: string }>): Promise<Readonly<{
    paymentId: string;
    orderId: string;
    amountPaise: number;
    currency: string;
    paymentStatus: string;
    createdAt: string;
  }> | null>;
  applyCapturedPayment(input: Readonly<{
    orderId: string;
    paymentId: string;
    amountPaise: number;
    currency: string;
    capturedAt: string;
  }>): Promise<unknown>;
  claimWebhook(input: Readonly<{ eventId: string; eventType: string }>): Promise<Claim>;
  completePaymentWebhook(input: Readonly<{
    eventId: string;
    processingToken: string;
    orderId: string;
    paymentId: string;
    amountPaise: number;
    currency: string;
    capturedAt: string;
  }>): Promise<unknown>;
  completeRefundWebhook(input: Readonly<{
    eventId: string;
    processingToken: string;
    refundId: string;
    paymentId: string;
    amountPaise: number;
    currency: string;
  }>): Promise<unknown>;
  completeRefundFailureWebhook(input: Readonly<{
    eventId: string;
    processingToken: string;
    refundId: string;
    paymentId: string;
    amountPaise: number;
    currency: string;
  }>): Promise<unknown>;
  failWebhook(input: Readonly<{
    eventId: string;
    processingToken: string;
    failureDetail: string;
  }>): Promise<unknown>;
}>;

type PaymentClient = ReturnType<typeof createRazorpayClient>;

type PaymentServiceDependencies = Readonly<{
  repository: PaymentRepository;
  client: PaymentClient;
  checkoutSecret: string;
  webhookSecret: string;
  now: () => string;
}>;

const PROVIDER_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const INTERNAL_ORDER_SKEW_MS = 15 * 60 * 1_000;

function timestampMs(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new PaymentServiceError("payment-mismatch", 422);
  return parsed;
}

function providerTimestamp(seconds: number): Readonly<{ iso: string; ms: number }> {
  const milliseconds = seconds * 1_000;
  if (!Number.isSafeInteger(milliseconds)) {
    throw new PaymentServiceError("payment-mismatch", 422);
  }
  const date = new Date(milliseconds);
  if (!Number.isFinite(date.getTime())) {
    throw new PaymentServiceError("payment-mismatch", 422);
  }
  return { iso: date.toISOString(), ms: date.getTime() };
}

function assertProviderTime(input: Readonly<{
  providerSeconds: number;
  now: string;
  earliest: Readonly<{ value: number | string; toleranceMs: number }>;
}>): string {
  const provider = providerTimestamp(input.providerSeconds);
  const now = timestampMs(input.now);
  const earliest = typeof input.earliest.value === "number"
    ? providerTimestamp(input.earliest.value).ms
    : timestampMs(input.earliest.value);
  if (provider.ms > now + PROVIDER_CLOCK_SKEW_MS
    || provider.ms < earliest - input.earliest.toleranceMs) {
    throw new PaymentServiceError("payment-mismatch", 422);
  }
  return provider.iso;
}

function assertFixedMoney(input: Readonly<{ amount: number; currency: string }>): void {
  if (input.amount !== REPORTER_PAYMENT_AMOUNT_PAISE
    || input.currency !== REPORTER_PAYMENT_CURRENCY) {
    throw new PaymentServiceError("payment-mismatch", 422);
  }
}

function assertExactOrder(input: Readonly<{
  id: string;
  amount: number;
  currency: string;
  receipt?: string | null;
  notes?: Readonly<Record<string, string>>;
}>, paymentId: string): void {
  assertFixedMoney(input);
  if (input.receipt !== paymentId || input.notes?.payment_id !== paymentId) {
    throw new PaymentServiceError("payment-mismatch", 422);
  }
}

export function createPaymentService(dependencies: PaymentServiceDependencies) {
  const requiredConsents = getConsentNotices("en").map(({ key, version }) => ({ key, version }));

  async function failClaim(eventId: string, processingToken: string, detail: string): Promise<void> {
    try {
      await dependencies.repository.failWebhook({
        eventId,
        processingToken,
        failureDetail: detail,
      });
    } catch {
      // The five-minute database lease makes a valid retry reclaimable.
    }
  }

  return {
    async createReporterOrder(input: Readonly<{
      actor: Readonly<{ userId: string; state: "applicant" | "reporter" }>;
      applicationId: string | null;
      purpose: "application" | "renewal";
    }>) {
      if ((input.purpose === "application"
          && (input.actor.state !== "applicant" || !input.applicationId))
        || (input.purpose === "renewal"
          && (input.actor.state !== "reporter" || input.applicationId !== null))) {
        throw new PaymentServiceError("forbidden", 403);
      }
      const reservation = await dependencies.repository.reserveOrder({
        profileId: input.actor.userId,
        applicationId: input.applicationId,
        purpose: input.purpose,
        requiredConsents,
      });
      if (reservation.state === "existing") {
        return {
          orderId: reservation.orderId,
          amount: REPORTER_PAYMENT_AMOUNT_PAISE,
          currency: REPORTER_PAYMENT_CURRENCY,
        } as const;
      }
      if (reservation.state === "busy") {
        throw new PaymentServiceError("order-busy", 409);
      }
      if (reservation.state === "paid") {
        throw new PaymentServiceError("invalid-state", 409);
      }
      if (reservation.state === "invalid") {
        throw new PaymentServiceError("invalid-state", 409);
      }
      if (reservation.state !== "claimed") {
        throw new PaymentServiceError("invalid-state", 409);
      }

      try {
        const order = await dependencies.client.findOrderByReceipt(reservation.paymentId)
          ?? await dependencies.client.createOrder(reservation.paymentId);
        assertExactOrder(order, reservation.paymentId);
        await dependencies.repository.completeOrder({
          paymentId: reservation.paymentId,
          token: reservation.token,
          orderId: order.id,
        });
        return {
          orderId: order.id,
          amount: REPORTER_PAYMENT_AMOUNT_PAISE,
          currency: REPORTER_PAYMENT_CURRENCY,
        } as const;
      } catch (error) {
        if (error instanceof RazorpayClientError && error.definite) {
          try {
            await dependencies.repository.failOrder({
              paymentId: reservation.paymentId,
              token: reservation.token,
            });
          } catch {
            // A stale reservation is reclaimable without creating a second receipt.
          }
        }
        if (error instanceof PaymentServiceError) throw error;
        throw new PaymentServiceError("provider-failed", 502);
      }
    },

    async verifyCheckoutPayment(input: Readonly<{
      profileId: string;
      orderId: string;
      paymentId: string;
      signature: string;
    }>) {
      const local = await dependencies.repository.getOwnedOrder({
        profileId: input.profileId,
        orderId: input.orderId,
      });
      if (!local) throw new PaymentServiceError("not-found", 404);
      if (local.paymentStatus !== "order_created"
        && local.paymentStatus !== "captured") {
        throw new PaymentServiceError("invalid-state", 409);
      }
      if (!verifyHmac(`${local.orderId}|${input.paymentId}`, dependencies.checkoutSecret, input.signature)) {
        throw new PaymentServiceError("invalid-payment-signature", 400);
      }
      const payment = await dependencies.client.fetchPayment(input.paymentId);
      if (payment.id !== input.paymentId
        || payment.order_id !== local.orderId
        || payment.amount !== local.amountPaise
        || payment.currency !== local.currency) {
        throw new PaymentServiceError("payment-mismatch", 422);
      }
      if (payment.status !== "captured" || payment.captured !== true) {
        return { signatureValid: true, status: "pending" } as const;
      }
      const order = await dependencies.client.fetchOrder(local.orderId);
      if (order.id !== local.orderId
        || order.amount !== local.amountPaise
        || order.amount_paid !== local.amountPaise
        || order.currency !== local.currency
        || order.receipt !== local.paymentId
        || order.notes?.payment_id !== local.paymentId
        || order.status !== "paid") {
        throw new PaymentServiceError("payment-mismatch", 422);
      }
      const capturedAt = assertProviderTime({
        providerSeconds: payment.created_at,
        now: dependencies.now(),
        earliest: { value: local.createdAt, toleranceMs: INTERNAL_ORDER_SKEW_MS },
      });
      assertProviderTime({
        providerSeconds: payment.created_at,
        now: dependencies.now(),
        earliest: { value: order.created_at, toleranceMs: PROVIDER_CLOCK_SKEW_MS },
      });
      await dependencies.repository.applyCapturedPayment({
        orderId: local.orderId,
        paymentId: payment.id,
        amountPaise: payment.amount,
        currency: payment.currency,
        capturedAt,
      });
      return { signatureValid: true, status: "captured" } as const;
    },

    async processRazorpayEvent(rawBody: string, signature: string, headerEventId?: string) {
      if (!rawBody || !verifyHmac(rawBody, dependencies.webhookSecret, signature)) {
        throw new PaymentServiceError("invalid-webhook-signature", 401);
      }
      let untrusted: unknown;
      try {
        untrusted = JSON.parse(rawBody);
      } catch {
        throw new PaymentServiceError("invalid-request", 400);
      }
      const envelope = eventEnvelopeSchema.safeParse(untrusted);
      if (!envelope.success) throw new PaymentServiceError("invalid-request", 400);
      const digest = createHash("sha256").update(rawBody).digest("hex");
      const parsedHeaderId = headerEventId === undefined
        ? null
        : eventHeaderId.safeParse(headerEventId);
      if (parsedHeaderId && !parsedHeaderId.success) {
        throw new PaymentServiceError("invalid-request", 400);
      }
      // The signature covers the raw body, not the delivery header. The body digest
      // prevents a captured request being replayed under attacker-chosen event IDs.
      const eventId = digest;
      const receipt = await dependencies.repository.claimWebhook({
        eventId,
        eventType: envelope.data.event,
      });
      if (receipt.state === "processed") return { duplicate: true, status: "processed" } as const;
      if (receipt.state === "busy") return { duplicate: true, status: "processing" } as const;
      if (receipt.state !== "claimed") {
        throw new PaymentServiceError("provider-failed", 500);
      }

      try {
        if (envelope.data.event === "payment.captured"
          || envelope.data.event === "order.paid") {
          const parsed = (envelope.data.event === "order.paid"
            ? paidOrderPayloadSchema
            : paymentPayloadSchema).safeParse(envelope.data.payload);
          if (!parsed.success) throw new PaymentServiceError("payment-mismatch", 422);
          const payment = parsed.data.payment.entity;
          assertFixedMoney(payment);
          const capturedAt = assertProviderTime({
            providerSeconds: envelope.data.created_at,
            now: dependencies.now(),
            earliest: { value: payment.created_at, toleranceMs: PROVIDER_CLOCK_SKEW_MS },
          });
          if (envelope.data.event === "order.paid") {
            const paidOrder = paidOrderPayloadSchema.parse(envelope.data.payload).order.entity;
            assertFixedMoney(paidOrder);
            if (paidOrder.id !== payment.order_id
              || paidOrder.amount_paid !== REPORTER_PAYMENT_AMOUNT_PAISE
              || paidOrder.status !== "paid") {
              throw new PaymentServiceError("payment-mismatch", 422);
            }
            assertProviderTime({
              providerSeconds: envelope.data.created_at,
              now: dependencies.now(),
              earliest: { value: paidOrder.created_at, toleranceMs: PROVIDER_CLOCK_SKEW_MS },
            });
          }
          await dependencies.repository.completePaymentWebhook({
            eventId,
            processingToken: receipt.token,
            orderId: payment.order_id,
            paymentId: payment.id,
            amountPaise: payment.amount,
            currency: payment.currency,
            capturedAt,
          });
          return { duplicate: false, status: "captured" } as const;
        }

        const parsed = refundPayloadSchema.safeParse(envelope.data.payload);
        if (!parsed.success) throw new PaymentServiceError("payment-mismatch", 422);
        const refund = parsed.data.refund.entity;
        assertFixedMoney(refund);
        if (envelope.data.event === "refund.processed" && refund.status !== "processed") {
          throw new PaymentServiceError("payment-mismatch", 422);
        }
        if (envelope.data.event === "refund.failed" && refund.status !== "failed") {
          throw new PaymentServiceError("payment-mismatch", 422);
        }
        const completion = {
          eventId,
          processingToken: receipt.token,
          refundId: refund.id,
          paymentId: refund.payment_id,
          amountPaise: refund.amount,
          currency: refund.currency,
        };
        if (envelope.data.event === "refund.processed") {
          await dependencies.repository.completeRefundWebhook(completion);
          return { duplicate: false, status: "refunded" } as const;
        }
        await dependencies.repository.completeRefundFailureWebhook(completion);
        return { duplicate: false, status: "refund_failed" } as const;
      } catch (error) {
        await failClaim(
          eventId,
          receipt.token,
          error instanceof PaymentServiceError ? "payload-mismatch" : "processing-failed",
        );
        if (error instanceof PaymentServiceError) throw error;
        throw new PaymentServiceError("provider-failed", 500);
      }
    },
  } as const;
}

async function runtimeService() {
  const { keyId, keySecret, webhookSecret } = env.server.razorpay;
  if (!keyId || !keySecret || !webhookSecret) {
    throw new PaymentServiceError("configuration-unavailable", 503);
  }
  const { paymentRepository } = await import("./payment.repository.ts");
  return createPaymentService({
    repository: paymentRepository,
    client: createRazorpayClient({ keyId, keySecret }),
    checkoutSecret: keySecret,
    webhookSecret,
    now: () => new Date().toISOString(),
  });
}

export async function createReporterOrder(input: Readonly<{
  applicationId: string | null;
  purpose: "application" | "renewal";
}>) {
  const { authorizeCurrentReporter } = await import("../auth/server.ts");
  const actor = await authorizeCurrentReporter();
  if (!actor.ok) throw new PaymentServiceError("forbidden", 403);
  return createReporterOrderFor(actor, input);
}

export async function createReporterOrderFor(
  actor: Actor,
  input: Readonly<{ applicationId: string | null; purpose: "application" | "renewal" }>,
) {
  return (await runtimeService()).createReporterOrder({ actor, ...input });
}

export function verifyCheckoutSignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  const secret = env.server.razorpay.keySecret;
  return Boolean(secret) && verifyHmac(`${orderId}|${paymentId}`, secret!, signature);
}

export async function verifyCheckoutPaymentFor(input: Readonly<{
  profileId: string;
  orderId: string;
  paymentId: string;
  signature: string;
}>) {
  return (await runtimeService()).verifyCheckoutPayment(input);
}

export async function processRazorpayEvent(
  rawBody: string,
  signature: string,
  eventId?: string,
) {
  return (await runtimeService()).processRazorpayEvent(rawBody, signature, eventId);
}
