import { z } from "zod";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "private, no-store, max-age=0" };
type AdminRole = "admin" | "editor" | "writer";
type Authorization =
  | Readonly<{ ok: true; identity: Readonly<{ role: AdminRole }> }>
  | Readonly<{ ok: false; reason: string }>;
type Dependencies = Readonly<{
  authorize(): Promise<Authorization>;
  terminate(actor: Readonly<{ role: AdminRole }>, id: string, reason: string): Promise<void>;
}>;

function response(code: string, status: number): Response {
  return Response.json({ code }, { status, headers: noStoreHeaders });
}

export function createTerminationHandler(dependencies: Dependencies) {
  return async function POST(request: Request, context: Readonly<{ params: Promise<{ id: string }> }>): Promise<Response> {
    try {
      const actor = await dependencies.authorize();
      if (!actor.ok) return response(actor.reason === "unauthenticated" || actor.reason === "session-expired" ? "live-termination-forbidden" : "live-termination-unavailable", actor.reason === "unauthenticated" || actor.reason === "session-expired" ? 401 : actor.reason === "profile-unavailable" ? 503 : 403);
      if (actor.identity.role !== "admin") return response("live-termination-forbidden", 403);
      const { id } = await context.params;
      const parsedId = z.uuid().safeParse(id);
      if (!parsedId.success) return response("invalid-request", 400);
      let body: unknown;
      try { body = await request.json(); } catch { return response("invalid-termination", 400); }
      const parsed = z.object({ reason: z.string().trim().min(1).max(2_000) }).safeParse(body);
      if (!parsed.success) return response("invalid-termination", 400);
      await dependencies.terminate(actor.identity, parsedId.data.toLowerCase(), parsed.data.reason);
      return response("live-terminated", 200);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "INVALID") return response("invalid-termination", 400);
      if (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "FORBIDDEN") return response("live-termination-forbidden", 403);
      return response("live-termination-unavailable", 503);
    }
  };
}

export const POST = createTerminationHandler({
  authorize: async () => (await import("../../../../../../features/admin/auth/server.ts")).authorizeCurrentAdmin(),
  terminate: async (actor, id, reason) => {
    const { terminateReporterLiveRequest } = await import("../../../../../../features/admin/reporters/live/live-termination.service.ts");
    return terminateReporterLiveRequest(actor, id, reason);
  },
});
