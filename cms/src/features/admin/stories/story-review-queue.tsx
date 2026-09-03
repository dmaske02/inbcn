import { Video } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";

import { Pagination } from "@/components/common/pagination";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatReviewQueueSubmissionTime,
  groupStoriesBySubmissionDate,
} from "./story-review-queue-date-groups";
import type { StoryReviewQueueView } from "./story.service";

function queueHref(view: StoryReviewQueueView, page: number) {
  const query = new URLSearchParams({
    search: view.filters.search,
    language: view.filters.language,
    category: view.filters.category,
    page: String(page),
  });
  for (const [key, value] of [...query.entries()])
    if (!value) query.delete(key);
  return `/admin/stories/review?${query}`;
}

export function StoryReviewQueue({ view }: { view: StoryReviewQueueView }) {
  const groups = groupStoriesBySubmissionDate(view.items);

  return (
    <div className="space-y-4">
      <Card padding="none">
        <CardContent>
          <form className="grid gap-3 md:grid-cols-4" method="get">
            <label className="md:col-span-2">
              <span className="sr-only">Search Stories</span>
              <input
                className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={view.filters.search}
                name="search"
                placeholder="Search headline or slug"
              />
            </label>
            <label>
              <span className="sr-only">Locale</span>
              <select
                className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={view.filters.language}
                name="language"
              >
                <option value="">All locales</option>
                {view.references.languages.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Category</span>
              <select
                className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={view.filters.category}
                name="category"
              >
                <option value="">All categories</option>
                {view.references.categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2 md:col-span-4">
              <Button size="sm" type="submit">
                Apply filters
              </Button>
              <Link
                className={buttonVariants({ variant: "outline", size: "sm" })}
                href="/admin/stories/review"
              >
                Reset
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
      {view.items.length === 0 ? (
        <Card padding="none">
          <CardContent className="py-14 text-center">
            <h2 className="font-semibold">
              No Stories are waiting for review.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              New submissions will appear here, newest first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-background">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Featured media</th>
                <th className="p-3">Headline</th>
                <th className="p-3">Category</th>
                <th className="p-3">Locale</th>
                <th className="p-3">Author</th>
                <th className="p-3">Submitted</th>
                <th className="p-3">Status</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {groups.map((group) => (
                <Fragment key={group.key}>
                  <tr className="border-y border-border bg-muted/60">
                    <td className="px-3 py-4" colSpan={8}>
                      <h2 className="font-semibold">{group.heading}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {group.countLabel}
                      </p>
                    </td>
                  </tr>
                  {group.items.map((story) => (
                    <tr
                      className="align-middle hover:bg-muted/30"
                      key={story.id}
                    >
                      <td className="p-3">
                        {story.featuredMedia?.type === "image" ? (
                          <Image
                            alt={story.featuredMedia.altText || story.title}
                            className="h-12 w-20 rounded object-cover"
                            height={48}
                            src={story.featuredMedia.secureUrl}
                            width={80}
                          />
                        ) : story.featuredMedia ? (
                          <div className="flex h-12 w-20 flex-col items-center justify-center rounded bg-muted/60 text-xs text-muted-foreground">
                            <Video aria-hidden="true" className="size-4" />
                            <span>
                              {story.featuredMedia.type === "video" ? "Video" : "Media"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="max-w-sm p-3">
                        <Link
                          className="font-medium hover:underline"
                          href={`/admin/stories/${story.id}`}
                        >
                          {story.title}
                        </Link>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {story.summary}
                        </p>
                      </td>
                      <td className="p-3">{story.categoryName}</td>
                      <td className="p-3">{story.languageName}</td>
                      <td className="p-3">{story.authorName}</td>
                      <td className="whitespace-nowrap p-3">
                        {formatReviewQueueSubmissionTime(story.submittedAt)}
                      </td>
                      <td className="p-3">
                        <Badge variant="signal">Pending Review</Badge>
                      </td>
                      <td className="p-3">
                        <Link
                          className={buttonVariants({
                            variant: "outline",
                            size: "sm",
                          })}
                          href={`/admin/stories/${story.id}`}
                        >
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        currentPage={view.page}
        totalPages={view.totalPages}
        previousHref={
          view.page > 1 ? queueHref(view, view.page - 1) : undefined
        }
        nextHref={
          view.page < view.totalPages
            ? queueHref(view, view.page + 1)
            : undefined
        }
      />
    </div>
  );
}
