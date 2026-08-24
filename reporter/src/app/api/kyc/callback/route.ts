import { processKycWebhook } from "../../../../features/application/application.service.ts";
import { createKycCallbackHandler } from "./handler.ts";

export const POST = createKycCallbackHandler({ process: processKycWebhook });
