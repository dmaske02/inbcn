"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { env } from "../../config/env.ts";
import { createAdminClient } from "../../lib/supabase/admin.ts";
import { createClient } from "../../lib/supabase/server.ts";
import { requireReporterSession } from "../auth/server.ts";
import {
  claimTemporaryAccessSync,
  completeTemporaryAccessSync,
  completeTemporaryKycApproval,
  completeTemporaryPayment,
  getCurrentApplication,
} from "./application.repository.ts";
import { createTemporaryOnboardingService } from "./temporary-onboarding.service.ts";

export type TemporaryOnboardingActionState = Readonly<{
  status: "idle" | "success" | "error";
  message?: string;
}>;

function serverService() {
  return createTemporaryOnboardingService({
    completePayment: completeTemporaryPayment,
    approve: completeTemporaryKycApproval,
    claimSync: claimTemporaryAccessSync,
    completeSync: completeTemporaryAccessSync,
    async getAuthMetadata(profileId) {
      const { data, error } = await createAdminClient().auth.admin.getUserById(profileId);
      if (error || !data.user) throw error ?? new Error("Auth user unavailable.");
      return data.user.app_metadata;
    },
    async updateAuthClaims(profileId, metadata) {
      const { error } = await createAdminClient().auth.admin.updateUserById(profileId, {
        app_metadata: metadata,
      });
      if (error) throw error;
    },
    async refreshSession() {
      const { error } = await (await createClient()).auth.refreshSession();
      if (error) throw error;
    },
  });
}

function unavailable(): TemporaryOnboardingActionState {
  return { status: "error", message: "This preview step is unavailable. Please try again." };
}

export async function completeTemporaryPaymentAction(
  applicationId: string,
  _previousState: TemporaryOnboardingActionState,
  _formData: FormData,
): Promise<TemporaryOnboardingActionState> {
  void _previousState;
  void _formData;
  const actor = await requireReporterSession();
  if (actor.state !== "applicant" || !env.server.temporaryOnboarding || !applicationId) {
    return unavailable();
  }
  const application = await getCurrentApplication(actor.userId);
  if (!application || application.id !== applicationId
    || (application.status !== "draft" && application.status !== "payment_pending")) {
    return unavailable();
  }

  try {
    await serverService().completePayment(actor.userId, application.id);
  } catch {
    return unavailable();
  }
  revalidatePath("/application");
  return { status: "success", message: "Dummy payment completed." };
}

export async function completeTemporaryKycAction(
  applicationId: string,
  _previousState: TemporaryOnboardingActionState,
  _formData: FormData,
): Promise<TemporaryOnboardingActionState> {
  void _previousState;
  void _formData;
  const actor = await requireReporterSession();
  if (actor.state !== "applicant" || !env.server.temporaryOnboarding || !applicationId) {
    return unavailable();
  }
  const application = await getCurrentApplication(actor.userId);
  if (!application || application.id !== applicationId || application.status !== "kyc_pending") {
    return unavailable();
  }

  try {
    await serverService().completeKycAndApproval(actor.userId, application.id);
  } catch {
    return unavailable();
  }
  redirect("/dashboard");
}
