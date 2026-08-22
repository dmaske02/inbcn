import {
  KycServiceError,
  processKycWebhook,
} from "../../../../features/application/application.service.ts";

export const MAX_KYC_WEBHOOK_SIZE = 1024 * 1024;

type Dependencies = Readonly<{
  process(input: Readonly<{ rawBody: string; signature: string }>): Promise<unknown>;
}>;

type BodyReadResult =
  | Readonly<{ ok: true; rawBody: string }>
  | Readonly<{ ok: false; status: 400 | 413 }>;

export async function readKycWebhookBody(request: Request): Promise<BodyReadResult> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/u.test(declaredLength)) return { ok: false, status: 400 };
    if (Number(declaredLength) > MAX_KYC_WEBHOOK_SIZE) return { ok: false, status: 413 };
  }
  if (!request.body) return { ok: false, status: 400 };

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteLength = 0;
  let rawBody = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_KYC_WEBHOOK_SIZE) {
        try {
          await reader.cancel();
        } catch {
          // The size rejection is authoritative even if transport cancellation fails.
        }
        return { ok: false, status: 413 };
      }
      rawBody += decoder.decode(value, { stream: true });
    }
    rawBody += decoder.decode();
  } catch {
    try {
      await reader.cancel();
    } catch {
      // The request is already unusable; no diagnostic body is retained.
    }
    return { ok: false, status: 400 };
  }
  return rawBody ? { ok: true, rawBody } : { ok: false, status: 400 };
}

export function createKycCallbackHandler(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const signature = request.headers.get("x-kyc-signature")?.trim();
    if (!signature) return Response.json({ code: "invalid-request" }, { status: 400 });

    const body = await readKycWebhookBody(request);
    if (!body.ok) return Response.json({ code: "invalid-request" }, { status: body.status });
    try {
      return Response.json(await dependencies.process({ rawBody: body.rawBody, signature }), { status: 200 });
    } catch (error) {
      if (error instanceof KycServiceError) {
        return Response.json({ code: error.code }, { status: error.httpStatus });
      }
      return Response.json({ code: "kyc-webhook-failed" }, { status: 500 });
    }
  };
}

export const POST = createKycCallbackHandler({ process: processKycWebhook });
