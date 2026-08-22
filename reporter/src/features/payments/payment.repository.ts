import "server-only";

import type { Json } from "@inbcn/database";

import { createAdminClient } from "../../lib/supabase/admin.ts";

export class PaymentRepositoryError extends Error {
  constructor() {
    super("The payment record could not be updated.");
    this.name = "PaymentRepositoryError";
  }
}

function record(value: Json): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PaymentRepositoryError();
  }
  return value;
}

async function reserveOrder(input: Readonly<{
  profileId: string;
  applicationId: string | null;
  purpose: "application" | "renewal";
  requiredConsents: readonly Readonly<{ key: string; version: string }>[];
}>) {
  const { data, error } = await createAdminClient().rpc("reserve_reporter_order", {
    p_profile_id: input.profileId,
    p_application_id: input.applicationId,
    p_purpose: input.purpose,
    p_required_consents: input.requiredConsents.map(({ key, version }) => ({ key, version })),
  });
  if (error) throw new PaymentRepositoryError();
  const value = record(data);
  if (value.state === "claimed"
    && typeof value.payment_id === "string"
    && typeof value.token === "string") {
    return { state: "claimed", paymentId: value.payment_id, token: value.token } as const;
  }
  if (value.state === "existing" && typeof value.order_id === "string") {
    return { state: "existing", orderId: value.order_id } as const;
  }
  if (value.state === "busy" || value.state === "invalid" || value.state === "paid") {
    return { state: value.state } as const;
  }
  throw new PaymentRepositoryError();
}

async function completeOrder(input: Readonly<{
  paymentId: string;
  token: string;
  orderId: string;
}>) {
  const { data, error } = await createAdminClient().rpc("complete_reporter_order", {
    p_payment_id: input.paymentId,
    p_order_creation_token: input.token,
    p_razorpay_order_id: input.orderId,
  });
  if (error || !data) throw new PaymentRepositoryError();
  return data;
}

async function failOrder(input: Readonly<{ paymentId: string; token: string }>) {
  const { data, error } = await createAdminClient().rpc("fail_reporter_order", {
    p_payment_id: input.paymentId,
    p_order_creation_token: input.token,
  });
  if (error || !data) throw new PaymentRepositoryError();
  return data;
}

async function getOwnedOrder(input: Readonly<{ profileId: string; orderId: string }>) {
  const { data, error } = await createAdminClient()
    .from("reporter_payments")
    .select("id, razorpay_order_id, amount_paise, currency, payment_status")
    .eq("profile_id", input.profileId)
    .eq("razorpay_order_id", input.orderId)
    .maybeSingle();
  if (error) throw new PaymentRepositoryError();
  if (!data || !data.razorpay_order_id) return null;
  return {
    paymentId: data.id,
    orderId: data.razorpay_order_id,
    amountPaise: data.amount_paise,
    currency: data.currency,
    paymentStatus: data.payment_status,
  } as const;
}

async function applyCapturedPayment(input: Readonly<{
  orderId: string;
  paymentId: string;
  amountPaise: number;
  currency: string;
  capturedAt: string;
}>) {
  const { data, error } = await createAdminClient().rpc("apply_reporter_payment", {
    p_razorpay_order_id: input.orderId,
    p_razorpay_payment_id: input.paymentId,
    p_amount_paise: input.amountPaise,
    p_currency: input.currency,
    p_captured_at: input.capturedAt,
  });
  if (error || !data) throw new PaymentRepositoryError();
  return data;
}

async function claimWebhook(input: Readonly<{ eventId: string; eventType: string }>) {
  const { data, error } = await createAdminClient().rpc("claim_razorpay_webhook_event", {
    p_event_id: input.eventId,
    p_event_type: input.eventType,
  });
  if (error) throw new PaymentRepositoryError();
  const value = record(data);
  if (value.state === "claimed" && typeof value.token === "string") {
    return { state: "claimed", token: value.token } as const;
  }
  if (value.state === "busy" || value.state === "processed") {
    return { state: value.state } as const;
  }
  throw new PaymentRepositoryError();
}

async function completePaymentWebhook(input: Readonly<{
  eventId: string;
  processingToken: string;
  orderId: string;
  paymentId: string;
  amountPaise: number;
  currency: string;
}>) {
  const { data, error } = await createAdminClient().rpc("complete_razorpay_payment_webhook", {
    p_event_id: input.eventId,
    p_processing_token: input.processingToken,
    p_razorpay_order_id: input.orderId,
    p_razorpay_payment_id: input.paymentId,
    p_amount_paise: input.amountPaise,
    p_currency: input.currency,
  });
  if (error || !data) throw new PaymentRepositoryError();
  return data;
}

type RefundWebhookInput = Readonly<{
  eventId: string;
  processingToken: string;
  refundId: string;
  paymentId: string;
  amountPaise: number;
  currency: string;
}>;

async function completeRefundRpc(
  name: "complete_razorpay_refund_webhook" | "complete_razorpay_refund_failure_webhook",
  input: RefundWebhookInput,
) {
  const { data, error } = await createAdminClient().rpc(name, {
    p_event_id: input.eventId,
    p_processing_token: input.processingToken,
    p_razorpay_refund_id: input.refundId,
    p_razorpay_payment_id: input.paymentId,
    p_amount_paise: input.amountPaise,
    p_currency: input.currency,
  });
  if (error || !data) throw new PaymentRepositoryError();
  return data;
}

const completeRefundWebhook = (input: RefundWebhookInput) =>
  completeRefundRpc("complete_razorpay_refund_webhook", input);
const completeRefundFailureWebhook = (input: RefundWebhookInput) =>
  completeRefundRpc("complete_razorpay_refund_failure_webhook", input);

async function failWebhook(input: Readonly<{
  eventId: string;
  processingToken: string;
  failureDetail: string;
}>) {
  const { data, error } = await createAdminClient().rpc("fail_razorpay_webhook_event", {
    p_event_id: input.eventId,
    p_processing_token: input.processingToken,
    p_failure_detail: input.failureDetail,
  });
  if (error || !data) throw new PaymentRepositoryError();
  return data;
}

export const paymentRepository = {
  reserveOrder,
  completeOrder,
  failOrder,
  getOwnedOrder,
  applyCapturedPayment,
  claimWebhook,
  completePaymentWebhook,
  completeRefundWebhook,
  completeRefundFailureWebhook,
  failWebhook,
} as const;
