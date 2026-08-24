import { processRazorpayEvent } from "../../../../features/payments/payment.service.ts";
import { createRazorpayWebhookHandler } from "./handler.ts";

export const POST = createRazorpayWebhookHandler({ process: processRazorpayEvent });
