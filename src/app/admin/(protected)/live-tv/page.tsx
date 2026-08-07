import { notFound, redirect } from "next/navigation";

import { requireAdminUser } from "@/features/admin/auth/server";
import { LiveTvEditor } from "@/features/admin/live-tv/live-tv-editor";
import { canManageLiveTv } from "@/features/admin/live-tv/live-tv.model";
import { getLiveTvEditorView, LiveTvManagementError } from "@/features/admin/live-tv/live-tv.service";

export default async function LiveTvAdminPage({ searchParams }: { searchParams: Promise<{ id?: string; saved?: string; changed?: string; error?: string }> }) {
  const admin = await requireAdminUser();
  if (!canManageLiveTv(admin.role)) redirect("/admin/forbidden");
  const notices = await searchParams;
  let view: Awaited<ReturnType<typeof getLiveTvEditorView>>;
  try {
    view = await getLiveTvEditorView(admin, notices.id);
  } catch (error) {
    if (error instanceof LiveTvManagementError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  return <LiveTvEditor notices={notices} view={view} />;
}
