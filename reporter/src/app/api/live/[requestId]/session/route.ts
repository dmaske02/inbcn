import { createSessionHandler } from "./handler.ts";

export const dynamic = "force-dynamic";

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
