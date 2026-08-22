"use server";

import { revalidatePath } from "next/cache";

import { requireAdminUser } from "../auth/server";
import { ReporterManagementError, reporterService } from "./reporter.service";

export type ReporterActionState = Readonly<{
  status: "idle" | "error" | "success";
  message?: string;
}>;

function safeError(error: unknown): ReporterActionState {
  return {
    status: "error",
    message: error instanceof ReporterManagementError
      ? error.message
      : "The reporter record could not be changed. Please try again.",
  };
}

function refresh(applicationId?: string): void {
  revalidatePath("/admin/reporters");
  revalidatePath("/admin/reporters/[id]", "page");
  revalidatePath("/admin/reporters/applications");
  if (applicationId) revalidatePath(`/admin/reporters/applications/${applicationId}`);
  revalidatePath("/admin/stories");
  revalidatePath("/admin/stories/[id]", "page");
}

export async function setReporterTrustAction(
  profileId: string,
  _previous: ReporterActionState,
  formData: FormData,
): Promise<ReporterActionState> {
  const admin = await requireAdminUser();
  const enabledValue = String(formData.get("enabled") ?? "");
  if (enabledValue !== "true" && enabledValue !== "false") {
    return { status: "error", message: "Choose whether to enable or disable the capability." };
  }
  try {
    await (await reporterService()).setTrust(
      admin,
      profileId,
      String(formData.get("capability") ?? ""),
      enabledValue === "true",
      String(formData.get("reason") ?? ""),
    );
    refresh();
    return { status: "success", message: "Reporter trust updated." };
  } catch (error) {
    refresh();
    return safeError(error);
  }
}

export async function approveReporterAction(
  applicationId: string,
  _previous: ReporterActionState,
  formData: FormData,
): Promise<ReporterActionState> {
  const admin = await requireAdminUser();
  try {
    await (await reporterService()).approve(
      admin,
      applicationId,
      formData.get("publicPhotoIdentityMatch") === "on",
    );
    refresh(applicationId);
    return { status: "success", message: "Application approved and reporter access synchronized." };
  } catch (error) {
    refresh(applicationId);
    return safeError(error);
  }
}

export async function rejectReporterAction(
  applicationId: string,
  _previous: ReporterActionState,
  formData: FormData,
): Promise<ReporterActionState> {
  const admin = await requireAdminUser();
  try {
    await (await reporterService()).reject(
      admin,
      applicationId,
      String(formData.get("reason") ?? ""),
    );
    refresh(applicationId);
    return { status: "success", message: "Application rejected and the full refund is pending confirmation." };
  } catch (error) {
    refresh(applicationId);
    return safeError(error);
  }
}

export async function suspendReporterAction(
  applicationId: string,
  profileId: string,
  _previous: ReporterActionState,
  formData: FormData,
): Promise<ReporterActionState> {
  const admin = await requireAdminUser();
  try {
    await (await reporterService()).suspend(
      admin,
      profileId,
      String(formData.get("reason") ?? ""),
    );
    refresh(applicationId);
    return {
      status: "success",
      message: "Reporter access suspended. Supabase cannot delete sessions by user ID; database and signed-role checks deny access immediately.",
    };
  } catch (error) {
    refresh(applicationId);
    return safeError(error);
  }
}

export async function reinstateReporterAction(
  applicationId: string,
  profileId: string,
  _previous: ReporterActionState,
  _formData: FormData,
): Promise<ReporterActionState> {
  void _previous;
  void _formData;
  const admin = await requireAdminUser();
  try {
    await (await reporterService()).reinstate(admin, profileId);
    refresh(applicationId);
    return {
      status: "success",
      message: "Reporter access reinstated. Direct-publish and live trust remain disabled.",
    };
  } catch (error) {
    refresh(applicationId);
    return safeError(error);
  }
}

export async function retryReporterAccessSyncAction(
  applicationId: string,
  profileId: string,
  _previous: ReporterActionState,
  _formData: FormData,
): Promise<ReporterActionState> {
  void _previous;
  void _formData;
  const admin = await requireAdminUser();
  try {
    await (await reporterService()).retryAccessSync(admin, profileId);
    refresh(applicationId);
    return { status: "success", message: "Reporter signed access synchronized." };
  } catch (error) {
    refresh(applicationId);
    return safeError(error);
  }
}
