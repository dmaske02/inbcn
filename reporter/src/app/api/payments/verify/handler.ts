import { z } from "zod";

import type { ReporterAuthorizationResult } from "../../../../features/auth/authorization.model.ts";
import {
  PaymentServiceError,
} from "../../../../features/payments/payment.service.ts";

const providerId = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/u);
const verifyRequestSchema = z.object({
  orderId: providerId,
  paymentId: providerId,
  signature: z.string().regex(/^[\da-f]{64}$/iu),
});
type Authorization = ReporterAuthorizationResult
  | Readonly<{ ok: false; reason: "unauthenticated" | "session-expired" | "profile-unavailable" }>;
type Dependencies = Readonly<{
  authorize(): Promise<Authorization>;
  verify(input: Readonly<{
    profileId: string;
    orderId: string;
    paymentId: string;
    signature: string;
  }>): Promise<unknown>;
}>;

export function createVerifyHandler(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const actor = await dependencies.authorize();
    if (!actor.ok) {
      const status = actor.reason === "unauthenticated" ? 401 : 403;
      return Response.json({ code: "payment-verification-forbidden" }, { status });
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ code: "invalid-request" }, { status: 400 });
    }
    const parsed = verifyRequestSchema.safeParse(body);
    if (!parsed.success) return Response.json({ code: "invalid-request" }, { status: 400 });
    try {
      const result = await dependencies.verify({ profileId: actor.userId, ...parsed.data });
      const status = typeof result === "object"
        && result !== null
        && "status" in result
        && result.status === "pending"
        ? 202
        : 200;
      return Response.json(result, { status });
    } catch (error) {
      if (error instanceof PaymentServiceError) {
        return Response.json({ code: error.code }, { status: error.httpStatus });
      }
      return Response.json({ code: "payment-verification-failed" }, { status: 500 });
    }
  };
}
