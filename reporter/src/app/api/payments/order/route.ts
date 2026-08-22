import { z } from "zod";

import type { ReporterAuthorizationResult } from "../../../../features/auth/authorization.model.ts";
import {
  PaymentServiceError,
  createReporterOrderFor,
} from "../../../../features/payments/payment.service.ts";

const orderRequestSchema = z.discriminatedUnion("purpose", [
  z.object({ purpose: z.literal("application"), applicationId: z.uuid() }),
  z.object({ purpose: z.literal("renewal"), applicationId: z.null().optional() }),
]);

type Authorization = ReporterAuthorizationResult
  | Readonly<{ ok: false; reason: "unauthenticated" | "session-expired" | "profile-unavailable" }>;

type Dependencies = Readonly<{
  authorize(): Promise<Authorization>;
  createOrder(
    actor: Extract<ReporterAuthorizationResult, { ok: true }>,
    input: Readonly<{ applicationId: string | null; purpose: "application" | "renewal" }>,
  ): Promise<unknown>;
}>;

export function createOrderHandler(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const actor = await dependencies.authorize();
    if (!actor.ok) {
      const status = actor.reason === "unauthenticated" ? 401 : 403;
      return Response.json({ code: "payment-order-forbidden" }, { status });
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ code: "invalid-request" }, { status: 400 });
    }
    const parsed = orderRequestSchema.safeParse(body);
    if (!parsed.success) return Response.json({ code: "invalid-request" }, { status: 400 });
    if ((parsed.data.purpose === "application" && actor.state !== "applicant")
      || (parsed.data.purpose === "renewal" && actor.state !== "reporter")) {
      return Response.json({ code: "payment-order-forbidden" }, { status: 403 });
    }
    try {
      return Response.json(await dependencies.createOrder(actor, {
        purpose: parsed.data.purpose,
        applicationId: parsed.data.applicationId ?? null,
      }));
    } catch (error) {
      if (error instanceof PaymentServiceError) {
        return Response.json({ code: error.code }, { status: error.httpStatus });
      }
      return Response.json({ code: "payment-order-failed" }, { status: 500 });
    }
  };
}

export const POST = createOrderHandler({
  authorize: async () => {
    const { authorizeCurrentReporter } = await import("../../../../features/auth/server.ts");
    return authorizeCurrentReporter();
  },
  createOrder: createReporterOrderFor,
});
