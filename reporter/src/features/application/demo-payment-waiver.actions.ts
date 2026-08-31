"use server";

import { revalidatePath } from "next/cache";

import { env } from "../../config/env.ts";
import { requireReporterSession } from "../auth/server.ts";
import { getCurrentApplication, waiveDemoReporterApplicationPayment } from "./application.repository.ts";
import { getCurrentDemoIdentity } from "./demo-payment-waiver.identity.ts";
import { createDemoPaymentWaiverService } from "./demo-payment-waiver.service.ts";

export type DemoPaymentWaiverActionState = Readonly<{ status: "idle" | "success" | "error"; message?: string }>;

export async function waiveDemoPaymentAction(
  applicationId: string,
  _previousState: DemoPaymentWaiverActionState,
  _formData: FormData,
): Promise<DemoPaymentWaiverActionState> {
  void _previousState;
  void _formData;
  const actor = await requireReporterSession();
  if (actor.state !== "applicant" || !applicationId) return { status: "error", message: "Demo payment waiver is unavailable." };
  const identity = await getCurrentDemoIdentity(actor.userId);
  const application = await getCurrentApplication(actor.userId);
  if (!identity || !application || application.id !== applicationId) {
    return { status: "error", message: "Demo payment waiver is unavailable." };
  }
  try {
    await createDemoPaymentWaiverService({ waive: waiveDemoReporterApplicationPayment }).waive({
      demoMode: env.server.demoMode,
      actor: { state: actor.state, profileId: actor.userId, ...identity },
      application: { ...application, profileId: actor.userId },
    });
  } catch {
    return { status: "error", message: "Demo payment waiver is unavailable." };
  }
  revalidatePath("/application");
  return { status: "success", message: "Demo payment waived. Continue with identity verification." };
}
