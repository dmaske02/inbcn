import { createReporterOrderFor } from "../../../../features/payments/payment.service.ts";
import { createOrderHandler } from "./handler.ts";

export const POST = createOrderHandler({
  authorize: async () => {
    const { authorizeCurrentReporter } = await import("../../../../features/auth/server.ts");
    return authorizeCurrentReporter();
  },
  createOrder: createReporterOrderFor,
});
