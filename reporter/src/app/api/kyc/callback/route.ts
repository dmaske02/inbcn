import {
  KycServiceError,
  processKycWebhook,
} from "../../../../features/application/application.service.ts";

const MAX_KYC_WEBHOOK_SIZE = 1024 * 1024;

type Dependencies = Readonly<{
  process(input: Readonly<{ rawBody: string; signature: string }>): Promise<unknown>;
}>;

export function createKycCallbackHandler(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const signature = request.headers.get("x-kyc-signature")?.trim();
    if (!signature) return Response.json({ code: "invalid-request" }, { status: 400 });

    const rawBody = await request.text();
    if (!rawBody || new TextEncoder().encode(rawBody).byteLength > MAX_KYC_WEBHOOK_SIZE) {
      return Response.json({ code: "invalid-request" }, { status: rawBody ? 413 : 400 });
    }
    try {
      return Response.json(await dependencies.process({ rawBody, signature }), { status: 200 });
    } catch (error) {
      if (error instanceof KycServiceError) {
        return Response.json({ code: error.code }, { status: error.httpStatus });
      }
      return Response.json({ code: "kyc-webhook-failed" }, { status: 500 });
    }
  };
}

export const POST = createKycCallbackHandler({ process: processKycWebhook });
