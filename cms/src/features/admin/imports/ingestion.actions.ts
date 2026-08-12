"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { requireAdminUser } from "@/features/admin/auth/server";
import { revalidatePublicNews } from "@/features/admin/public-revalidation";
import {
  IngestionManagementError,
  runManualSourceImport,
  saveIngestionSource,
} from "./ingestion.service";
import { enqueueAutomatedImports, setSchedulerEnabled } from "./scheduler.service";

export type IngestionActionState = Readonly<{
  status: "idle" | "success" | "error";
  message?: string;
}>;

function safeError(error: unknown): IngestionActionState {
  if (error instanceof IngestionManagementError) {
    return { status: "error", message: error.message };
  }
  return {
    status: "error",
    message: "The import operation could not be completed. Please try again.",
  };
}

async function refreshIngestionViews(): Promise<void> {
  revalidatePath("/admin/imports");
  revalidatePath("/admin/sources");
  revalidatePath("/admin/stories");
  await revalidatePublicNews();
}

export async function saveIngestionSourceAction(
  _previousState: IngestionActionState,
  formData: FormData,
): Promise<IngestionActionState> {
  const admin = await requireAdminUser();
  try {
    await saveIngestionSource(admin, {
      id: String(formData.get("id") ?? ""),
      sourceType: String(formData.get("sourceType") ?? ""),
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      defaultLanguageId: String(formData.get("defaultLanguageId") ?? ""),
      defaultCategoryId: String(formData.get("defaultCategoryId") ?? ""),
      country: String(formData.get("country") ?? ""),
      feedUrl: String(formData.get("feedUrl") ?? ""),
      ingestionPriority: String(formData.get("ingestionPriority") ?? ""),
      isActive: formData.get("isActive") === "on",
    });
    await refreshIngestionViews();
    return { status: "success", message: "Import source saved." };
  } catch (error) {
    return safeError(error);
  }
}

export async function runSourceImportAction(
  sourceId: string,
  _previousState: IngestionActionState,
  _formData: FormData,
): Promise<IngestionActionState> {
  void _previousState;
  void _formData;
  const admin = await requireAdminUser();
  try {
    const result = await runManualSourceImport(admin, sourceId);
    await refreshIngestionViews();
    return {
      status: "success",
      message: `${result.counts.imported} imported, ${result.counts.duplicates} duplicates, ${result.counts.failed} failed.`,
    };
  } catch (error) {
    await refreshIngestionViews();
    return safeError(error);
  }
}

export async function pauseSchedulerAction(): Promise<void> {
  const admin = await requireAdminUser();
  await setSchedulerEnabled(admin, false);
  await refreshIngestionViews();
}

export async function resumeSchedulerAction(): Promise<void> {
  const admin = await requireAdminUser();
  await setSchedulerEnabled(admin, true);
  await refreshIngestionViews();
}

export async function runSchedulerNowAction(): Promise<void> {
  await requireAdminUser();
  const queued = await enqueueAutomatedImports({ force: true });
  if (queued.run) {
    after(async () => {
      try {
        await queued.run?.();
      } catch (error) {
        console.error(JSON.stringify({
          event: "scheduler_background_failed",
          reason: error instanceof Error ? error.message : "Unknown scheduler error",
        }));
      } finally {
        await refreshIngestionViews();
      }
    });
  }
  await refreshIngestionViews();
}
