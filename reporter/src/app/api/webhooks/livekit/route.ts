import { processLiveKitWebhook } from "../../../../features/live/livekit-webhook.service.ts";
import { createLiveKitWebhookHandler } from "./handler.ts";

export const POST = createLiveKitWebhookHandler({ process: processLiveKitWebhook });
