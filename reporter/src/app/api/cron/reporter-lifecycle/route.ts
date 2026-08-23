import { createHash, timingSafeEqual } from "node:crypto";

import { env } from "../../../../config/env.ts";
import { runReporterLifecycle } from "../../../../features/lifecycle/lifecycle.service.ts";

const headers = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

export const maxDuration = 60;

function authorized(value: string | null): boolean {
  const secret = env.server.cronSecret;
  if (!secret || !value) return false;
  const actual = createHash("sha256").update(value).digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(actual, expected);
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request.headers.get("authorization"))) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers });
  }
  try {
    const result = await runReporterLifecycle();
    return Response.json(result, { status: result.ok ? 200 : 503, headers });
  } catch {
    return Response.json(
      { ok: false, error: "lifecycle_unavailable" },
      { status: 503, headers },
    );
  }
}
