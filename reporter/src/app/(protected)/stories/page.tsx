import Link from "next/link";

import { requireReporterSession } from "@/features/auth/server";
import { getReporterStories } from "@/features/submissions/submission.service";

function date(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })
    .format(new Date(value));
}

export default async function ReporterStoriesPage() {
  const actor = await requireReporterSession();
  if (actor.state !== "reporter") {
    return (
      <section className="rounded-lg border border-border bg-background p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Stories</h1>
        <p className="mt-2 text-sm text-muted-foreground">Story tools become available after reporter approval.</p>
      </section>
    );
  }
  const stories = await getReporterStories(actor.userId);
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your stories</h1>
          <p className="mt-2 text-sm text-muted-foreground">Drafts, review decisions, and published reports.</p>
        </div>
        <Link className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background" href="/stories/new">New story</Link>
      </header>
      {stories.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">No stories yet.</p>
      ) : (
        <ul className="space-y-3">
          {stories.map((story) => (
            <li className="rounded-lg border border-border bg-background p-5 shadow-sm" key={story.id}>
              <Link className="font-semibold underline-offset-4 hover:underline" href={`/stories/${story.id}`}>{story.title}</Link>
              <p className="mt-1 text-sm text-muted-foreground">
                {story.reporterState.replaceAll("_", " ")} · Updated {date(story.updatedAt)}
              </p>
              {story.reviewReason ? <p className="mt-2 text-sm">Editor note: {story.reviewReason}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
