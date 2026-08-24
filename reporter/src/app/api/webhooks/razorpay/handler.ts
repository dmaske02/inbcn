import {
  PaymentServiceError,
} from "../../../../features/payments/payment.service.ts";
import { readBoundedRawBody } from "../../../../features/webhooks/raw-body.ts";

export const MAX_RAZORPAY_WEBHOOK_SIZE = 1024 * 1024;
const RETRY_AFTER_SECONDS = 60;

type Dependencies = Readonly<{
  process(rawBody: string, signature: string, eventId: string): Promise<unknown>;
}>;

function isProcessing(result: unknown): boolean {
  return typeof result === "object"
    && result !== null
    && "status" in result
    && result.status === "processing";
}

export function createRazorpayWebhookHandler(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const signature = request.headers.get("x-razorpay-signature")?.trim();
    const eventId = request.headers.get("x-razorpay-event-id")?.trim();
    if (!signature || !eventId) {
      return Response.json({ code: "invalid-request" }, { status: 400 });
    }
    const body = await readBoundedRawBody(request, MAX_RAZORPAY_WEBHOOK_SIZE);
    if (!body.ok) return Response.json({ code: "invalid-request" }, { status: body.status });
    try {
      const result = await dependencies.process(body.rawBody, signature, eventId);
      if (isProcessing(result)) {
        return Response.json({ code: "razorpay-webhook-busy" }, {
          status: 503,
          headers: { "Retry-After": String(RETRY_AFTER_SECONDS) },
        });
      }
      return Response.json(result);
    } catch (error) {
      if (error instanceof PaymentServiceError) {
        return Response.json({ code: error.code }, { status: error.httpStatus });
      }
      return Response.json({ code: "razorpay-webhook-failed" }, { status: 500 });
    }
  };
}
