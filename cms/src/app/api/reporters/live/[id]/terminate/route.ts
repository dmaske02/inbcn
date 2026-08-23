import { createTerminationHandler } from "../../../../../../features/admin/reporters/live/live-termination.route-handler.ts";

export const dynamic = "force-dynamic";

export const POST = createTerminationHandler({
  authorize: async () => (await import("../../../../../../features/admin/auth/server.ts")).authorizeCurrentAdmin(),
  terminate: async (actor, id, reason) => {
    const { terminateReporterLiveRequest } = await import("../../../../../../features/admin/reporters/live/live-termination.service.ts");
    return terminateReporterLiveRequest(actor, id, reason);
  },
});
