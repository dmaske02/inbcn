"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/features/admin/auth/server";
import { revalidateWebsite } from "@/features/admin/public-revalidation";
import { alertFormSchema } from "./breaking-alerts.model";
import { AlertManagementError, createBreakingAlert, runBreakingAlertCommand, saveBreakingAlert } from "./breaking-alerts.service";

export type AlertActionState = Readonly<{ status: "idle"|"error"; message?: string; fieldErrors?: Record<string,string[]|undefined> }>;
function values(form: FormData) { return { title: form.get("title"), message: form.get("message"), type: form.get("type"), placement: form.get("placement"), status: form.get("status") ?? "draft", isActive: form.get("isActive") === "on", priority: form.get("priority"), targetScope: form.get("targetScope"), languageId: form.get("languageId"), categoryId: form.get("categoryId") ?? "", storyId: form.get("storyId") ?? "", backgroundColor: form.get("backgroundColor"), textColor: form.get("textColor"), dismissible: form.get("dismissible") === "on", startAt: form.get("startAt"), endAt: form.get("endAt") ?? "" }; }
async function refresh() { revalidatePath("/admin/alerts"); await revalidateWebsite("alerts"); }
function safe(error: unknown): AlertActionState { return { status: "error", message: error instanceof AlertManagementError ? error.message : "The alert could not be saved." }; }

export async function createAlertAction(_state: AlertActionState, form: FormData): Promise<AlertActionState> {
  const admin = await requireAdminUser(); const parsed = alertFormSchema.safeParse(values(form));
  if (!parsed.success) return { status: "error", message: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  let id: string; try { id = String((await createBreakingAlert(admin, parsed.data) as {id:string}).id); } catch (error) { return safe(error); }
  await refresh(); redirect(`/admin/alerts/${id}?saved=created`);
}
export async function saveAlertAction(id: string, _state: AlertActionState, form: FormData): Promise<AlertActionState> {
  const admin = await requireAdminUser(); const parsed = alertFormSchema.safeParse(values(form));
  if (!parsed.success) return { status: "error", message: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  try { await saveBreakingAlert(admin, id, parsed.data); } catch (error) { return safe(error); }
  await refresh(); redirect(`/admin/alerts/${id}?saved=updated`);
}
export async function alertCommandAction(form: FormData) {
  const admin = await requireAdminUser(); const id = String(form.get("id") ?? ""); const command = String(form.get("command") ?? "");
  if (!id || !["activate","deactivate","archive","delete","duplicate"].includes(command)) redirect("/admin/alerts?error=invalid-action");
  try { await runBreakingAlertCommand(admin, id, command as "activate"|"deactivate"|"archive"|"delete"|"duplicate"); } catch { redirect(`/admin/alerts?error=action-failed`); }
  await refresh(); redirect(`/admin/alerts?changed=${command}`);
}
