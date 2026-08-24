import { verifyCheckoutPaymentFor } from "../../../../features/payments/payment.service.ts";
import { createVerifyHandler } from "./handler.ts";

export const POST = createVerifyHandler({
  authorize: async () => {
    const { authorizeCurrentReporter } = await import("../../../../features/auth/server.ts");
    return authorizeCurrentReporter();
  },
  verify: verifyCheckoutPaymentFor,
});
