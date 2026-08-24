import { z } from "zod";

import {
  KycServiceError,
} from "../../../../features/application/application.service.ts";

const requestSchema = z.object({ applicationId: z.uuid() }).strict();

type Authorization =
  | Readonly<{ ok: true; state: "applicant" | "reporter"; userId: string }>
  | Readonly<{ ok: false; reason: string }>;

type Dependencies = Readonly<{
  authorize(): Promise<Authorization>;
  start(profileId: string, applicationId: string): Promise<Readonly<{ url: string }>>;
}>;

export function createKycStartHandler(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const actor = await dependencies.authorize();
    if (!actor.ok) {
      const status = actor.reason === "unauthenticated" || actor.reason === "session-expired" ? 401 : 403;
      return Response.json({ code: status === 401 ? "unauthorized" : "forbidden" }, { status });
    }
    if (actor.state !== "applicant") return Response.json({ code: "forbidden" }, { status: 403 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ code: "invalid-request" }, { status: 400 });
    }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return Response.json({ code: "invalid-request" }, { status: 400 });

    try {
      return Response.json(await dependencies.start(actor.userId, parsed.data.applicationId));
    } catch (error) {
      if (error instanceof KycServiceError) {
        return Response.json({ code: error.code }, { status: error.httpStatus });
      }
      return Response.json({ code: "kyc-start-failed" }, { status: 500 });
    }
  };
}
