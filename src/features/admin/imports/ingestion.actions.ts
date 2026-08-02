"use server";

import { revalidatePath } from "next/cache";

import { requireAdminUser } from "@/features/admin/auth/server";
import {
  IngestionManagementError,
  runManualNewsDataImport,
  saveNewsDataSource,
} from "./ingestion.service";

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
    message: "The NewsData operation could not be completed. Please try again.",
  };
}

function refreshIngestionViews(): void {
  revalidatePath("/admin/imports");
  revalidatePath("/admin/sources");
  revalidatePath("/admin/stories");
}

export async function saveNewsDataSourceAction(
  _previousState: IngestionActionState,
  formData: FormData,
): Promise<IngestionActionState> {
  const admin = await requireAdminUser();
  try {
    await saveNewsDataSource(admin, {
      id: String(formData.get("id") ?? ""),
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      defaultLanguageId: String(formData.get("defaultLanguageId") ?? ""),
      defaultCategoryId: String(formData.get("defaultCategoryId") ?? ""),
      country: String(formData.get("country") ?? ""),
      ingestionPriority: String(formData.get("ingestionPriority") ?? ""),
      isActive: formData.get("isActive") === "on",
    });
    refreshIngestionViews();
    return { status: "success", message: "NewsData source saved." };
  } catch (error) {
    return safeError(error);
  }
}

export async function runNewsDataImportAction(
  sourceId: string,
  _previousState: IngestionActionState,
  _formData: FormData,
): Promise<IngestionActionState> {
  void _previousState;
  void _formData;
  const admin = await requireAdminUser();
  try {
    const result = await runManualNewsDataImport(admin, sourceId);
    refreshIngestionViews();
    return {
      status: "success",
      message: `${result.counts.imported} imported, ${result.counts.duplicates} duplicates, ${result.counts.failed} failed.`,
    };
  } catch (error) {
    refreshIngestionViews();
    return safeError(error);
  }
}
