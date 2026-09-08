import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { requireReporterSession } from "@/features/auth/server";
import { saveReporterDraftAction, submitReporterStoryAction, directPublishReporterStoryAction, withdrawReporterStoryAction } from "@/features/submissions/submission.actions";
import { createNewReporterDraftTarget, resolveNewReporterDraftTarget } from "@/features/submissions/submission.model";
import { getReporterStoryReferences } from "@/features/submissions/submission.repository";
import { StoryEditor } from "@/features/submissions/story-editor";

import { getCurrentMembership } from "@/features/membership/membership.repository";
import { getReporterStoryEditor } from "@/features/submissions/submission.service";

export default async function NewReporterStoryPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ draft?: string | string[] }> }>) {
  const actor = await requireReporterSession();
  if (actor.state !== "reporter") {
    return <p className="text-sm text-muted-foreground">Story tools become available after reporter approval.</p>;
  }
  const resolved = resolveNewReporterDraftTarget((await searchParams).draft, randomUUID);
  const draftTarget = createNewReporterDraftTarget(() => resolved.storyId);
  if (!resolved.fromSearchParam || resolved.needsCanonicalRedirect) redirect(`/stories/new?draft=${draftTarget.storyId}`);
  const existing = await getReporterStoryEditor(actor.userId, draftTarget.storyId);
  if (existing && existing.story.reporterState !== "draft" && existing.story.reporterState !== "changes_requested") redirect(`/stories/${draftTarget.storyId}`);
  const [references, membership] = await Promise.all([getReporterStoryReferences(), getCurrentMembership(actor.userId)]);
  const canSubmit = membership.status === "active" || membership.status === "grace_period";
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">New story</h1>
        <p className="mt-2 text-sm text-muted-foreground">Write your story and choose photos or videos. Your draft saves automatically when the required details are complete.</p>
      </header>
      <StoryEditor
        editable
        isPersisted={Boolean(existing)}
        canDirectPublish={membership.status === "active" && membership.canPublishDirectly}
        canSubmit={canSubmit}
        media={existing?.media.map(item => ({ id: item.id, title: item.title, type: item.type === "image" ? "image" : "video" })) ?? []}
        references={references}
        saveAction={saveReporterDraftAction.bind(null, { ...draftTarget, redirectToEditor: false })}
        story={existing?.story ?? { title: "", summary: "", body: "", languageId: "", categoryId: "", eventOccurredAt: "", featuredMediaId: null, updatedAt: new Date().toISOString() }}
        storyId={draftTarget.storyId}
        withdrawAction={withdrawReporterStoryAction.bind(null, draftTarget.storyId)}
        submitAction={submitReporterStoryAction.bind(null, draftTarget.storyId)}
        directAction={directPublishReporterStoryAction.bind(null, draftTarget.storyId)}
        initialLocation={existing?.location ?? null}
        initialLocality={existing?.location?.locality ?? ""}
        userId={actor.userId}
      />
    </div>
  );
}
