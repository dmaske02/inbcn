import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { env } from "@/config/env";
import type { AdminRole } from "@/features/admin/auth/authorization.model";
import { buildPublicStoryUrl } from "./public-story-url";
import { StoryForm } from "./story-form";
import { ReporterRevisionPanel } from "./reporter-revision-panel";
import type { getStoryEditorView } from "./story.service";

type StoryEditorView = Awaited<ReturnType<typeof getStoryEditorView>>;

export function StoryEditor({ adminRole, view, notices = {} }: { adminRole: AdminRole; view: StoryEditorView; notices?: { saved?: string; changed?: string; error?: string } }) {
  const publicStoryLocale = view.references.languages.find((item) => item.id === view.story?.languageId)?.code ?? "en";
  const publicStoryUrl = view.story?.status === "published" && env.server.websiteUrl
    ? buildPublicStoryUrl(env.server.websiteUrl, publicStoryLocale, view.story.slug)
    : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" href="/admin/stories"><ArrowLeft className="size-4" aria-hidden="true" />Back to stories</Link>
          <h1 className="text-3xl font-semibold tracking-tight">{view.story?.isReporterStory ? "Review reporter submission" : view.story ? "Edit story" : "New story"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{view.story?.isReporterStory ? "Compare immutable submitted evidence with the canonical story without rewriting reporter content." : view.story ? "Update content and move the story through its permitted workflow." : "Create a staff article draft."}</p>
        </div>
        {publicStoryUrl ? <Link className={buttonVariants({variant:"outline"})} href={publicStoryUrl} target="_blank">View public URL</Link> : null}
      </header>
      {notices.saved || notices.changed ? <p role="status" className="rounded-md border border-verified/30 bg-verified/5 p-3 text-sm text-verified">Story changes were saved successfully.</p> : null}
      {notices.error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{notices.error === "conflict" ? "Story was changed by another editor. Reload before saving." : notices.error === "invalid-reason" ? "Enter a revision reason of 1 to 1000 characters without control characters." : "The requested workflow action could not be completed."}</p> : null}
      {view.reporterReview && view.story ? <ReporterRevisionPanel commands={view.commands} references={view.references} review={view.reporterReview} story={view.story} /> : <StoryForm adminRole={adminRole} view={view} />}
    </div>
  );
}
