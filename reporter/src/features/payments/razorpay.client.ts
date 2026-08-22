import "server-only";

import { z } from "zod";

import {
  REPORTER_PAYMENT_AMOUNT_PAISE,
  REPORTER_PAYMENT_CURRENCY,
} from "./payment.model.ts";

const providerId = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/u);
const internalId = z.uuid();
const notesSchema = z.record(z.string(), z.string());

const orderSchema = z.object({
  id: providerId,
  entity: z.literal("order").optional(),
  amount: z.number().int(),
  amount_paid: z.number().int().optional(),
  amount_due: z.number().int().optional(),
  currency: z.string(),
  receipt: z.string().nullable(),
  status: z.enum(["created", "attempted", "paid"]),
  notes: notesSchema.optional(),
  created_at: z.number().int().optional(),
});

const paymentSchema = z.object({
  id: providerId,
  entity: z.literal("payment").optional(),
  order_id: providerId.nullable(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.enum(["created", "authorized", "captured", "refunded", "failed"]),
  captured: z.boolean(),
});

const orderCollectionSchema = z.object({
  entity: z.literal("collection"),
  count: z.number().int().nonnegative(),
  items: z.array(orderSchema),
});

export type RazorpayOrder = z.infer<typeof orderSchema>;
export type RazorpayPayment = z.infer<typeof paymentSchema>;

export class RazorpayClientError extends Error {
  readonly code: "provider-request-failed" | "provider-response-invalid";
  readonly definite: boolean;

  constructor(
    code: "provider-request-failed" | "provider-response-invalid",
    definite = false,
  ) {
    super("Razorpay request could not be completed.");
    this.name = "RazorpayClientError";
    this.code = code;
    this.definite = definite;
  }
}

type RazorpayClientOptions = Readonly<{
  keyId: string;
  keySecret: string;
  fetchImpl?: typeof fetch;
}>;

export function createRazorpayClient(options: RazorpayClientOptions) {
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
        },
      });
    } catch {
      throw new RazorpayClientError("provider-request-failed");
    }
    if (!response.ok) {
      // Razorpay may have accepted the request even when the response is lost,
      // concurrent, throttled, or otherwise non-successful. Reconcile by receipt.
      throw new RazorpayClientError("provider-request-failed");
    }
    try {
      return await response.json();
    } catch {
      throw new RazorpayClientError("provider-response-invalid");
    }
  }

  function exactOrder(value: unknown, receipt: string): RazorpayOrder {
    const parsed = orderSchema.safeParse(value);
    if (!parsed.success
      || parsed.data.amount !== REPORTER_PAYMENT_AMOUNT_PAISE
      || parsed.data.currency !== REPORTER_PAYMENT_CURRENCY
      || parsed.data.receipt !== receipt
      || parsed.data.notes?.payment_id !== receipt) {
      throw new RazorpayClientError("provider-response-invalid");
    }
    return parsed.data;
  }

  function exactInternalId(value: string): string {
    const parsed = internalId.safeParse(value);
    if (!parsed.success) {
      throw new RazorpayClientError("provider-request-failed", true);
    }
    return parsed.data;
  }

  return {
    async createOrder(paymentId: string): Promise<RazorpayOrder> {
      const receipt = exactInternalId(paymentId);
      return exactOrder(await request("/orders", {
        method: "POST",
        body: JSON.stringify({
          amount: REPORTER_PAYMENT_AMOUNT_PAISE,
          currency: REPORTER_PAYMENT_CURRENCY,
          receipt,
          partial_payment: false,
          notes: { payment_id: receipt },
        }),
      }), receipt);
    },

    async findOrderByReceipt(paymentId: string): Promise<RazorpayOrder | null> {
      const receipt = exactInternalId(paymentId);
      const params = new URLSearchParams({ receipt, count: "2" });
      const parsed = orderCollectionSchema.safeParse(await request(`/orders?${params}`));
      if (!parsed.success || parsed.data.items.length > 1) {
        throw new RazorpayClientError("provider-response-invalid");
      }
      return parsed.data.items[0] ? exactOrder(parsed.data.items[0], receipt) : null;
    },

    async fetchPayment(paymentId: string): Promise<RazorpayPayment> {
      const id = providerId.parse(paymentId);
      const parsed = paymentSchema.safeParse(await request(`/payments/${encodeURIComponent(id)}`));
      if (!parsed.success || parsed.data.id !== id) {
        throw new RazorpayClientError("provider-response-invalid");
      }
      return parsed.data;
    },

    async fetchOrder(orderId: string): Promise<RazorpayOrder> {
      const id = providerId.parse(orderId);
      const parsed = orderSchema.safeParse(await request(`/orders/${encodeURIComponent(id)}`));
      if (!parsed.success || parsed.data.id !== id) {
        throw new RazorpayClientError("provider-response-invalid");
      }
      return parsed.data;
    },
  } as const;
}
