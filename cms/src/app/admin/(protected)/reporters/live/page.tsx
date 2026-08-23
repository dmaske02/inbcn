import { redirect } from "next/navigation";

import { requireAdminUser } from "@/features/admin/auth/server";
import { LiveReviewList } from "@/features/admin/reporters/live/live-review-list";
import { canViewLiveRequests } from "@/features/admin/reporters/live/live-review.model";
import { getLiveReviewRequests } from "@/features/admin/reporters/live/live-review.service";

export default async function LiveReviewPage() {
  const admin = await requireAdminUser();
  if (!canViewLiveRequests(admin.role)) redirect("/admin/forbidden");
  const requests = await getLiveReviewRequests(admin);
  return <div className="space-y-6"><header><p className="text-sm font-medium text-muted-foreground">Editorial workspace</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Live requests</h1><p className="mt-2 text-sm text-muted-foreground">Review proposed reporter live broadcasts. Only administrators can make workflow decisions.</p></header><LiveReviewList requests={requests} /></div>;
}
