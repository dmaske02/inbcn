import {
  KycServiceError,
} from "../../../../features/application/application.service.ts";
import { readBoundedRawBody } from "../../../../features/webhooks/raw-body.ts";

export const MAX_KYC_WEBHOOK_SIZE = 1024 * 1024;
const KYC_WEBHOOK_RETRY_AFTER_SECONDS = 60;

type Dependencies = Readonly<{
  process(input: Readonly<{ rawBody: string; signature: string }>): Promise<unknown>;
}>;

function hasActiveProcessingLease(result: unknown): boolean {
  return typeof result === "object"
    && result !== null
    && "status" in result
    && result.status === "processing";
}

export const readKycWebhookBody = (request: Request) =>
  readBoundedRawBody(request, MAX_KYC_WEBHOOK_SIZE);

export function createKycCallbackHandler(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const signature = request.headers.get("x-kyc-signature")?.trim();
    if (!signature) return Response.json({ code: "invalid-request" }, { status: 400 });

    const body = await readKycWebhookBody(request);
    if (!body.ok) return Response.json({ code: "invalid-request" }, { status: body.status });
    try {
      const result = await dependencies.process({ rawBody: body.rawBody, signature });
      if (hasActiveProcessingLease(result)) {
        return Response.json({ code: "kyc-webhook-busy" }, {
          status: 503,
          headers: { "Retry-After": String(KYC_WEBHOOK_RETRY_AFTER_SECONDS) },
        });
      }
      return Response.json(result, { status: 200 });
    } catch (error) {
      if (error instanceof KycServiceError) {
        return Response.json({ code: error.code }, { status: error.httpStatus });
      }
      return Response.json({ code: "kyc-webhook-failed" }, { status: 500 });
    }
  };
}
