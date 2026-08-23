import { z } from "zod";

import type { CurrentReporterResult } from "../../../../../features/auth/server.ts";
import {
  LiveSessionError,
  type ReporterLiveSession,
} from "../../../../../features/live/live-session.service.ts";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "private, no-store, max-age=0" };

type Dependencies = Readonly<{
  authorize(): Promise<CurrentReporterResult>;
  requestSession(input: Readonly<{
    profileId: string;
    accessGeneration: number;
    requestId: string;
  }>): Promise<ReporterLiveSession>;
}>;

export function createSessionHandler(dependencies: Dependencies) {
  return async function POST(
    _request: Request,
    context: Readonly<{ params: Promise<{ requestId: string }> }>,
  ): Promise<Response> {
    try {
      const actor = await dependencies.authorize();
      if (!actor.ok) {
        const status = actor.reason === "unauthenticated" || actor.reason === "session-expired"
          ? 401
          : actor.reason === "profile-unavailable" ? 503 : 403;
        return Response.json({ code: status === 503 ? "live-session-unavailable" : "live-session-forbidden" }, {
          status,
          headers: noStoreHeaders,
        });
      }
      if (actor.state !== "reporter" || typeof actor.accessGeneration !== "number") {
        return Response.json({ code: "live-session-forbidden" }, { status: 403, headers: noStoreHeaders });
      }
      const { requestId } = await context.params;
      const parsedRequestId = z.uuid().safeParse(requestId);
      if (!parsedRequestId.success) {
        return Response.json({ code: "invalid-request" }, { status: 400, headers: noStoreHeaders });
      }
      return Response.json(await dependencies.requestSession({
        profileId: actor.userId,
        accessGeneration: actor.accessGeneration,
        requestId: parsedRequestId.data.toLowerCase(),
      }), { headers: noStoreHeaders });
    } catch (error) {
      if (error instanceof LiveSessionError) {
        const headers = error.code === "STARTING"
          ? { ...noStoreHeaders, "Retry-After": "30" }
          : noStoreHeaders;
        return Response.json({
          code: error.code === "FORBIDDEN"
            ? "live-session-forbidden"
            : error.code === "STARTING"
              ? "live-session-starting"
              : "live-session-unavailable",
        }, { status: error.httpStatus, headers });
      }
      return Response.json({ code: "live-session-unavailable" }, { status: 503, headers: noStoreHeaders });
    }
  };
}

export const POST = createSessionHandler({
  authorize: async () => {
    const { authorizeCurrentReporter } = await import("../../../../../features/auth/server.ts");
    return authorizeCurrentReporter();
  },
  requestSession: async (input) => {
    const { requestReporterLiveSession } = await import("../../../../../features/live/live-session.service.ts");
    return requestReporterLiveSession(input.requestId, {
      profileId: input.profileId,
      accessGeneration: input.accessGeneration,
    });
  },
});
