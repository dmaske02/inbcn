import { createUploadRouteHandler } from "../../../../features/uploads/upload.routes.ts";
import { requestSignedUpload } from "../../../../features/uploads/upload.service.ts";

export const runtime = "nodejs";

export const POST = createUploadRouteHandler({
  authorize: async () => {
    const { authorizeCurrentReporter } = await import("../../../../features/auth/server.ts");
    return authorizeCurrentReporter();
  },
  execute: requestSignedUpload,
});
