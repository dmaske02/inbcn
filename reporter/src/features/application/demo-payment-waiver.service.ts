import { REPORTER_DEMO_PHONE } from "../auth/temporary-auth.model.ts";

type WaiverResult = Readonly<{ state: "waived"; applicationId: string; status: "kyc_pending"; waivedAt: string }>;

type WaiverInput = Readonly<{
  demoMode: boolean;
  actor: Readonly<{ state: string; profileId: string; phone: string; demoMarked: boolean }>;
  application: Readonly<{ id: string; profileId: string; status: string; consentsComplete: boolean }>;
}>;

export function createDemoPaymentWaiverService(dependencies: Readonly<{
  waive(profileId: string, applicationId: string): Promise<WaiverResult>;
}>) {
  return {
    async waive(input: WaiverInput): Promise<WaiverResult> {
      const allowedState = input.application.status === "draft" || input.application.status === "payment_pending";
      if (!input.demoMode
        || input.actor.state !== "applicant"
        || input.actor.phone !== REPORTER_DEMO_PHONE
        || !input.actor.demoMarked
        || input.application.profileId !== input.actor.profileId
        || !allowedState
        || !input.application.consentsComplete) {
        throw new Error("demo-payment-waiver-forbidden");
      }
      return dependencies.waive(input.actor.profileId, input.application.id);
    },
  };
}
