import { startKycSessionFor } from "../../../../features/application/application.service.ts";
import { createKycStartHandler } from "./handler.ts";

export const POST = createKycStartHandler({
  authorize: async () => {
    const { authorizeCurrentReporter } = await import("../../../../features/auth/server.ts");
    return authorizeCurrentReporter();
  },
  start: startKycSessionFor,
});
