import Link from "next/link";

import { Pagination } from "@/components/common/pagination";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { bulkStoryAction } from "./story.actions";
import type { StoryListView } from "./story.service";

const statusLabels: Record<string, string> = {
  draft: "Draft", pending_review: "Pending review", approved: "Approved", scheduled: "Scheduled",
  published: "Published", rejected: "Rejected", archived: "Archived",
};

function listHref(view: StoryListView, page: number) {
  const query = new URLSearchParams({ ...view.filters, page: String(page) });
  for (const [key, value] of [...query.entries()]) if (!value) query.delete(key);
  return `/admin/stories?${query}`;
}

export function StoryList({ view }: { view: StoryListView }) {
  return (
    <div className="space-y-4">
      <Card padding="none"><CardContent>
        <form className="grid gap-3 md:grid-cols-3 xl:grid-cols-6" method="get">
          <label className="xl:col-span-2"><span className="sr-only">Search stories</span><input className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm" defaultValue={view.filters.search} name="search" placeholder="Search headline or slug" /></label>
          <label><span className="sr-only">Status</span><select className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm" defaultValue={view.filters.status} name="status"><option value="">All statuses</option>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label><span className="sr-only">Language</span><select className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm" defaultValue={view.filters.language} name="language"><option value="">All languages</option>{view.references.languages.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span className="sr-only">Category</span><select className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm" defaultValue={view.filters.category} name="category"><option value="">All categories</option>{view.references.categories.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span className="sr-only">Sort</span><select className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm" defaultValue={view.filters.sort} name="sort"><option value="updated_desc">Recently updated</option><option value="updated_asc">Oldest updated</option><option value="published_desc">Recently published</option><option value="title_asc">Headline A–Z</option></select></label>
          <div className="flex gap-2 xl:col-span-6"><Button size="sm" type="submit">Apply filters</Button><Link className={buttonVariants({variant:"outline",size:"sm"})} href="/admin/stories">Reset</Link></div>
        </form>
      </CardContent></Card>

      {view.items.length === 0 ? (
        <Card padding="none"><CardContent className="py-14 text-center"><h2 className="font-semibold">No stories found</h2><p className="mt-2 text-sm text-muted-foreground">Create a story or adjust the current filters.</p></CardContent></Card>
      ) : (
        <form action={bulkStoryAction} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-2 text-sm text-muted-foreground">{view.total} stories</span>
            {view.canBulkPublish ? <Button name="command" value="publish" size="sm" variant="outline" type="submit">Publish selected</Button> : null}
            {view.canBulkArchive ? <Button name="command" value="archive" size="sm" variant="outline" type="submit">Archive selected</Button> : null}
            {view.canBulkDelete ? <Button name="command" value="delete" size="sm" variant="destructive" type="submit">Delete selected</Button> : null}
          </div>
          <div className="overflow-x-auto rounded-md border border-border bg-background">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="p-3"><span className="sr-only">Select</span></th><th className="p-3">Headline</th><th className="p-3">Language</th><th className="p-3">Category</th><th className="p-3">Status</th><th className="p-3">Author</th><th className="p-3">Updated</th><th className="p-3">Published</th><th className="p-3">Actions</th></tr></thead>
              <tbody className="divide-y divide-border">{view.items.map((story)=><tr key={story.id} className="align-top hover:bg-muted/30"><td className="p-3"><input aria-label={`Select ${story.title}`} name="storyIds" type="checkbox" value={story.id} className="size-4" /></td><td className="max-w-xs p-3"><Link className="font-medium hover:underline" href={`/admin/stories/${story.id}`}>{story.title}</Link><p className="mt-1 truncate text-xs text-muted-foreground">/{story.slug}</p></td><td className="p-3">{story.languageName}</td><td className="p-3">{story.categoryName}</td><td className="p-3"><Badge variant="outline">{statusLabels[story.status]}</Badge></td><td className="p-3">{story.authorName}</td><td className="whitespace-nowrap p-3">{new Date(story.updatedAt).toLocaleDateString("en-IN")}</td><td className="whitespace-nowrap p-3">{story.publishedAt ? new Date(story.publishedAt).toLocaleDateString("en-IN") : "—"}</td><td className="p-3"><Link className={buttonVariants({variant:"outline",size:"sm"})} href={`/admin/stories/${story.id}`}>Open</Link></td></tr>)}</tbody>
            </table>
          </div>
        </form>
      )}
      <Pagination currentPage={view.page} totalPages={view.totalPages} previousHref={view.page > 1 ? listHref(view, view.page - 1) : undefined} nextHref={view.page < view.totalPages ? listHref(view, view.page + 1) : undefined} />
    </div>
  );
}
