import { redirect } from "next/navigation";

import { requireAdminUser } from "@/features/admin/auth/server";
import { RecordingList } from "@/features/admin/reporters/recordings/recording-list";
import { canReviewRecordings } from "@/features/admin/reporters/recordings/recording.model";
import { getRecordings } from "@/features/admin/reporters/recordings/recording.service";

export default async function RecordingReviewPage() {
  const admin = await requireAdminUser();
  if (!canReviewRecordings(admin.role)) redirect("/admin/forbidden");
  const recordings = await getRecordings(admin);
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-muted-foreground">Editorial workspace</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Live recording review</h1>
        <p className="mt-2 text-sm text-muted-foreground">Preview private reporter recordings and make terminal replay decisions.</p>
      </header>
      <RecordingList recordings={recordings} />
    </div>
  );
}
