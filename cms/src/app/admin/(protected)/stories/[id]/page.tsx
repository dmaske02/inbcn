import { notFound, redirect } from "next/navigation";

import { requireAdminUser } from "@/features/admin/auth/server";
import { StoryEditor } from "@/features/admin/stories/story-editor";
import { getStoryEditorView, StoryManagementError } from "@/features/admin/stories/story.service";

export default async function EditStoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; changed?: string; error?: string }> }) {
  const admin = await requireAdminUser();
  const { id } = await params;
  const notices = await searchParams;
  let view: Awaited<ReturnType<typeof getStoryEditorView>>;
  try {
    view = await getStoryEditorView(admin, id);
  } catch (error) {
    if (error instanceof StoryManagementError && error.code === "NOT_FOUND") notFound();
    if (error instanceof StoryManagementError && error.code === "FORBIDDEN") redirect("/admin/forbidden");
    throw error;
  }
  return <StoryEditor adminRole={admin.role} view={view} notices={notices} />;
}
