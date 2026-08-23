import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { requireAdminUser } from "@/features/admin/auth/server";
import { canManageRecordingLegalHold, canReviewRecordings } from "@/features/admin/reporters/recordings/recording.model";
import { RecordingReview } from "@/features/admin/reporters/recordings/recording-review";
import { getRecording } from "@/features/admin/reporters/recordings/recording.service";

export default async function RecordingReviewDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  await connection();
  const admin = await requireAdminUser();
  if (!canReviewRecordings(admin.role)) redirect("/admin/forbidden");
  const detail = await getRecording(admin, (await params).id);
  if (!detail) notFound();
  return (
    <div className="space-y-5">
      <Link className="inline-flex rounded-sm text-sm font-medium text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/admin/reporters/recordings">
        Back to recording review
      </Link>
      <RecordingReview
        canManageLegalHold={canManageRecordingLegalHold(admin.role)}
        categories={detail.categories}
        previewUrl={detail.previewUrl}
        recording={detail.recording}
        thumbnails={detail.thumbnails}
      />
    </div>
  );
}
