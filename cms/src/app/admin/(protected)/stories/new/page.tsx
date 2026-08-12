import { redirect } from "next/navigation";

import { requireAdminUser } from "@/features/admin/auth/server";
import { canCreateStory } from "@/features/admin/stories/story.model";
import { StoryEditor } from "@/features/admin/stories/story-editor";
import { getStoryEditorView } from "@/features/admin/stories/story.service";

export default async function NewStoryPage() {
  const admin = await requireAdminUser();
  if (!canCreateStory(admin.role)) redirect("/admin/stories?error=create-forbidden");
  const view = await getStoryEditorView(admin);
  return <StoryEditor adminRole={admin.role} view={view} />;
}
