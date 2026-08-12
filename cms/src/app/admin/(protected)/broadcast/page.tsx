import { redirect } from "next/navigation";

import { requireAdminUser } from "@/features/admin/auth/server";
import { BroadcastStudio } from "@/features/broadcast-studio/components/broadcast-studio";
import { canAccessBroadcastStudio } from "@/features/broadcast-studio/models/broadcast-session.model";
import type { BroadcastLanguage } from "@/features/live-broadcast/broadcast.types";

function preferredBroadcastLanguage(code: string | undefined): BroadcastLanguage {
  return code === "hi" || code === "mr" ? code : "en";
}

export default async function BroadcastStudioPage() {
  const admin = await requireAdminUser();
  if (!canAccessBroadcastStudio(admin.role)) redirect("/admin/forbidden");

  return (
    <BroadcastStudio
      initialLanguage={preferredBroadcastLanguage(admin.preferredLanguage?.code)}
    />
  );
}
