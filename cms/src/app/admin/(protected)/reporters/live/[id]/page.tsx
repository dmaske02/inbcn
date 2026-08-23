import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireAdminUser } from "@/features/admin/auth/server";
import { LiveReviewDetail } from "@/features/admin/reporters/live/live-review-detail";
import { canDecideLiveRequest, canViewLiveRequests } from "@/features/admin/reporters/live/live-review.model";
import { getLiveReviewRequest } from "@/features/admin/reporters/live/live-review.service";

export default async function LiveReviewDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const admin = await requireAdminUser();
  if (!canViewLiveRequests(admin.role)) redirect("/admin/forbidden");
  const request = await getLiveReviewRequest(admin, (await params).id);
  if (!request) notFound();
  return <div className="space-y-5"><Link className="inline-flex rounded-sm text-sm font-medium text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/admin/reporters/live">Back to live requests</Link><LiveReviewDetail canDecide={canDecideLiveRequest(admin.role)} request={request} /></div>;
}
