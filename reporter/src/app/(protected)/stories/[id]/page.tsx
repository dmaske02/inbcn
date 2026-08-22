import { notFound } from "next/navigation";
import { z } from "zod";

import { requireReporterSession } from "@/features/auth/server";
import {
  directPublishReporterStoryAction,
  saveReporterDraftAction,
  submitReporterStoryAction,
  withdrawReporterStoryAction,
} from "@/features/submissions/submission.actions";
import { SubmissionButton, SubmissionForm } from "@/features/submissions/submission-form";
import { getReporterStoryEditor } from "@/features/submissions/submission.service";
import { StoryEditor } from "@/features/submissions/story-editor";

export default async function ReporterStoryPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const actor = await requireReporterSession();
  if (actor.state !== "reporter") notFound();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const editor = await getReporterStoryEditor(actor.userId, id);
  if (!editor) notFound();
  const editable = editor.story.reporterState === "draft" || editor.story.reporterState === "changes_requested";
  const withdrawable = editor.story.status === "draft" || editor.story.status === "pending_review";
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-muted-foreground">{editor.story.reporterState.replaceAll("_", " ")}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{editor.story.title}</h1>
        {editor.latestRevision?.reason ? <p className="mt-2 rounded-md border border-border p-3 text-sm">Editor note: {editor.latestRevision.reason}</p> : null}
      </header>
      {editable ? <StoryEditor
        editable={editable}
        isPersisted
        canDirectPublish={editor.membership.canDirectPublish}
        canSubmit={editor.membership.canSubmit}
        directAction={directPublishReporterStoryAction.bind(null, id)}
        media={editor.media.map((item) => ({ id: item.id, title: item.title, type: item.type === "image" ? "image" : "video" }))}
        references={editor.references}
        saveAction={saveReporterDraftAction.bind(null, { storyId: id, redirectToEditor: false })}
        story={editor.story}
        storyId={id}
        submitAction={submitReporterStoryAction.bind(null, id)}
        userId={actor.userId}
      /> : <section className="rounded-lg border border-border bg-background p-5 text-sm shadow-sm"><p>{editor.story.summary}</p><div className="mt-4 whitespace-pre-wrap">{editor.story.body}</div></section>}
      {editor.location ? <p className="text-sm text-muted-foreground">Latest private capture: {editor.location.locality}, accuracy {editor.location.accuracy} m.</p> : null}
      {withdrawable ? <SubmissionForm action={withdrawReporterStoryAction.bind(null, id)}><SubmissionButton className="min-h-11 text-sm font-medium text-destructive underline underline-offset-4 disabled:opacity-60">Withdraw story</SubmissionButton></SubmissionForm> : null}
    </div>
  );
}
