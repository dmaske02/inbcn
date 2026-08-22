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

const fieldClass = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

function localDateTime(value: string): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const item = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${item.year}-${item.month}-${item.day}T${item.hour}:${item.minute}`;
}

function LocationFields() {
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-semibold sm:col-span-2">Current capture evidence</legend>
      <label className="text-sm font-medium">Locality<input className={fieldClass} maxLength={200} name="locality" required /></label>
      <label className="text-sm font-medium">Captured at (India time)<input className={fieldClass} name="capturedAt" required type="datetime-local" /></label>
      <label className="text-sm font-medium">Latitude<input className={fieldClass} max="90" min="-90" name="latitude" required step="any" type="number" /></label>
      <label className="text-sm font-medium">Longitude<input className={fieldClass} max="180" min="-180" name="longitude" required step="any" type="number" /></label>
      <label className="text-sm font-medium">Accuracy in metres<input className={fieldClass} max="10000" min="0.01" name="accuracy" required step="any" type="number" /></label>
    </fieldset>
  );
}

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

      {editable ? (
        <SubmissionForm action={saveReporterDraftAction.bind(null, id)} className="space-y-4 rounded-lg border border-border bg-background p-5 shadow-sm sm:p-6">
          {editor.media.map((media) => <input key={media.id} name="mediaIds" type="hidden" value={media.id} />)}
          <label className="block text-sm font-medium">Headline<input className={fieldClass} defaultValue={editor.story.title} maxLength={240} name="title" required /></label>
          <label className="block text-sm font-medium">Summary<textarea className={fieldClass} defaultValue={editor.story.summary} maxLength={1000} name="summary" required rows={3} /></label>
          <label className="block text-sm font-medium">Body<textarea className={fieldClass} defaultValue={editor.story.body} name="body" required rows={10} /></label>
          <label className="block text-sm font-medium">Language
            <select className={fieldClass} defaultValue={`${editor.story.languageId}:${editor.references.languages.find((language) => language.id === editor.story.languageId)?.code ?? ""}`} name="language" required>
              {editor.references.languages.map((language) => <option key={language.id} value={`${language.id}:${language.code}`}>{language.nativeName}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">Category
            <select className={fieldClass} defaultValue={editor.story.categoryId} name="categoryId" required>
              {editor.references.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">Event time (India time)<input className={fieldClass} defaultValue={localDateTime(editor.story.eventOccurredAt)} name="eventOccurredAt" required type="datetime-local" /></label>
          {editor.media.length > 0 ? (
            <label className="block text-sm font-medium">Featured media
              <select className={fieldClass} defaultValue={editor.story.featuredMediaId ?? ""} name="featuredMediaId">
                <option value="">None</option>
                {editor.media.map((media) => <option key={media.id} value={media.id}>{media.title}</option>)}
              </select>
            </label>
          ) : null}
          <SubmissionButton className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60">Save draft</SubmissionButton>
        </SubmissionForm>
      ) : (
        <section className="rounded-lg border border-border bg-background p-5 text-sm shadow-sm">
          <p>{editor.story.summary}</p>
          <div className="mt-4 whitespace-pre-wrap">{editor.story.body}</div>
        </section>
      )}

      {editable && editor.membership.canSubmit ? (
        <section className="space-y-4 rounded-lg border border-border bg-background p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold">Submit current draft</h2>
          <p className="text-sm text-muted-foreground">Capture must be no more than 30 minutes old. The database checks location and attached media again atomically.</p>
          <SubmissionForm action={submitReporterStoryAction.bind(null, id)} className="space-y-4">
            <LocationFields />
            <SubmissionButton className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60">Submit for review</SubmissionButton>
          </SubmissionForm>
          {editor.membership.canDirectPublish ? (
            <SubmissionForm action={directPublishReporterStoryAction.bind(null, id)} className="space-y-4 border-t border-border pt-4">
              <LocationFields />
              <SubmissionButton className="rounded-md border border-border px-4 py-2 text-sm font-medium disabled:opacity-60">Publish directly</SubmissionButton>
            </SubmissionForm>
          ) : null}
        </section>
      ) : null}

      {editor.location ? (
        <p className="text-sm text-muted-foreground">Latest private capture: {editor.location.locality}, accuracy {editor.location.accuracy} m.</p>
      ) : null}
      {withdrawable ? (
        <SubmissionForm action={withdrawReporterStoryAction.bind(null, id)}>
          <SubmissionButton className="text-sm font-medium text-destructive underline underline-offset-4 disabled:opacity-60">Withdraw story</SubmissionButton>
        </SubmissionForm>
      ) : null}
    </div>
  );
}
