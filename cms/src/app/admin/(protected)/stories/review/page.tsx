import { requireAdminUser } from "@/features/admin/auth/server";
import { StoryReviewQueue } from "@/features/admin/stories/story-review-queue";
import { getStoryReviewQueueView, type StoryListParams } from "@/features/admin/stories/story.service";

export default async function StoryReviewPage({ searchParams }: { searchParams: Promise<StoryListParams> }) {
  const admin = await requireAdminUser();
  const view = await getStoryReviewQueueView(admin, await searchParams);
  return <div className="space-y-6"><header><p className="text-sm font-medium text-muted-foreground">Editorial CMS</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Review queue</h1><p className="mt-2 text-sm text-muted-foreground">Stories awaiting editorial review, ordered by submission time.</p></header><StoryReviewQueue view={view} /></div>;
}
