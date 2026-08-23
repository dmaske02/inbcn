import "server-only";

import { z } from "zod";

type AdminRole = "admin" | "editor" | "writer";
type Authorization =
  | Readonly<{ ok: true; identity: Readonly<{ role: AdminRole }> }>
  | Readonly<{ ok: false; reason: string }>;
type Dependencies = Readonly<{
  authorize(): Promise<Authorization>;
  terminate(actor: Readonly<{ role: AdminRole }>, id: string, reason: string): Promise<void>;
}>;

const noStoreHeaders = { "Cache-Control": "private, no-store, max-age=0" };

function response(code: string, status: number): Response {
  return Response.json({ code }, { status, headers: noStoreHeaders });
}

export function createTerminationHandler(dependencies: Dependencies) {
  return async function terminate(
    request: Request,
    context: Readonly<{ params: Promise<{ id: string }> }>,
  ): Promise<Response> {
    try {
      const actor = await dependencies.authorize();
      if (!actor.ok) {
        const unauthenticated = actor.reason === "unauthenticated" || actor.reason === "session-expired";
        return response(
          unauthenticated ? "live-termination-forbidden" : "live-termination-unavailable",
          unauthenticated ? 401 : actor.reason === "profile-unavailable" ? 503 : 403,
        );
      }
      if (actor.identity.role !== "admin") return response("live-termination-forbidden", 403);
      const { id } = await context.params;
      const parsedId = z.uuid().safeParse(id);
      if (!parsedId.success) return response("invalid-request", 400);
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return response("invalid-termination", 400);
      }
      const parsed = z.object({ reason: z.string().trim().min(1).max(2_000) }).safeParse(body);
      if (!parsed.success) return response("invalid-termination", 400);
      await dependencies.terminate(actor.identity, parsedId.data.toLowerCase(), parsed.data.reason);
      return response("live-terminated", 200);
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : null;
      if (code === "INVALID") return response("invalid-termination", 400);
      if (code === "FORBIDDEN") return response("live-termination-forbidden", 403);
      return response("live-termination-unavailable", 503);
    }
  };
}
