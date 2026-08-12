import Link from "next/link";
import { Plus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { requireAdminUser } from "@/features/admin/auth/server";
import { StoryList } from "@/features/admin/stories/story-list";
import { getStoryListView, type StoryListParams } from "@/features/admin/stories/story.service";

export default async function StoriesPage({ searchParams }: { searchParams: Promise<StoryListParams & { error?: string; changed?: string }> }) {
  const admin = await requireAdminUser();
  const params = await searchParams;
  const view = await getStoryListView(admin, params);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Editorial CMS</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Stories</h1>
          <p className="mt-2 text-sm text-muted-foreground">Create, review, schedule, publish, and archive newsroom stories.</p>
        </div>
        {view.canCreate ? (
          <Link className={buttonVariants()} href="/admin/stories/new"><Plus aria-hidden="true" />New Story</Link>
        ) : null}
      </header>
      {params.error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">The requested action could not be completed.</p> : null}
      {params.changed ? <p role="status" className="rounded-md border border-verified/30 bg-verified/5 p-3 text-sm text-verified">Story changes were applied successfully.</p> : null}
      <StoryList view={view} />
    </div>
  );
}
