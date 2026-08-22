import type { ReporterAuthorizationResult } from "../auth/authorization.model.ts";
import { readBoundedRawBody } from "../webhooks/raw-body.ts";
import { UploadServiceError } from "./upload.service.ts";

export const MAX_UPLOAD_ROUTE_BODY_BYTES = 16 * 1024;

type Authorization = ReporterAuthorizationResult | Readonly<{ ok: false; reason: string }>;
type Dependencies = Readonly<{
  authorize(): Promise<Authorization>;
  execute(profileId: string, input: unknown): Promise<unknown>;
}>;

function errorResponse(error: unknown): Response {
  if (error instanceof UploadServiceError) {
    const status = error.code === "invalid-upload" ? 400
      : error.code === "forbidden" ? 403
        : error.code === "conflict" ? 409
          : 503;
    return Response.json({ code: error.code }, { status });
  }
  return Response.json({ code: "upload-failed" }, { status: 500 });
}

export function createUploadRouteHandler(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const actor = await dependencies.authorize();
    if (!actor.ok) {
      const status = actor.reason === "unauthenticated" || actor.reason === "session-expired" ? 401 : 403;
      return Response.json({ code: status === 401 ? "unauthorized" : "forbidden" }, { status });
    }
    if (actor.state !== "reporter") return Response.json({ code: "forbidden" }, { status: 403 });
    const body = await readBoundedRawBody(request, MAX_UPLOAD_ROUTE_BODY_BYTES);
    if (!body.ok) return Response.json({ code: "invalid-request" }, { status: body.status });
    let input: unknown;
    try {
      input = JSON.parse(body.rawBody);
    } catch {
      return Response.json({ code: "invalid-request" }, { status: 400 });
    }
    try {
      return Response.json(await dependencies.execute(actor.userId, input));
    } catch (error) {
      return errorResponse(error);
    }
  };
}
