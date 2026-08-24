import {
  LiveKitWebhookError,
} from "../../../../features/live/livekit-webhook.service.ts";
import { readBoundedRawBody } from "../../../../features/webhooks/raw-body.ts";

export const MAX_LIVEKIT_WEBHOOK_SIZE = 1024 * 1024;
const RETRY_AFTER_SECONDS = 60;

type Dependencies = Readonly<{
  process(rawBody: string, authorization: string): Promise<unknown>;
}>;

function response(body: Readonly<Record<string, unknown>>, status = 200, retry = false): Response {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (retry) headers["Retry-After"] = String(RETRY_AFTER_SECONDS);
  return Response.json(body, { status, headers });
}

function isBusy(result: unknown): boolean {
  return result !== null && typeof result === "object"
    && "status" in result && result.status === "processing";
}

export function createLiveKitWebhookHandler(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    const authorization = request.headers.get("authorization")?.trim();
    if (mediaType !== "application/webhook+json" || !authorization) {
      return response({ code: "invalid-request" }, 400);
    }
    const body = await readBoundedRawBody(request, MAX_LIVEKIT_WEBHOOK_SIZE);
    if (!body.ok) return response({ code: "invalid-request" }, body.status);

    try {
      const result = await dependencies.process(body.rawBody, authorization);
      if (isBusy(result)) return response({ code: "livekit-webhook-busy" }, 503, true);
      return response({ ok: true });
    } catch (error) {
      if (error instanceof LiveKitWebhookError) {
        return response(
          { code: error.code },
          error.httpStatus,
          error.httpStatus === 503,
        );
      }
      return response({ code: "webhook-processing-failed" }, 500);
    }
  };
}
