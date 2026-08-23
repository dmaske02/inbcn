"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  publishRecordingAction,
  rejectRecordingAction,
  setRecordingLegalHoldAction,
  type RecordingActionState,
} from "./recording.actions";
import type {
  RecordingCategoryOption,
  RecordingDetail,
  RecordingThumbnailOption,
} from "./recording.model";

const initialState: RecordingActionState = { status: "idle" };
const fieldClass = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2";

function date(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function StateMessage({ state, pending }: Readonly<{ state: RecordingActionState; pending: boolean }>) {
  return (
    <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role="status">
      {pending ? "Saving…" : state.message ?? ""}
    </p>
  );
}

export function RecordingReview({
  recording,
  previewUrl,
  categories,
  thumbnails,
  canManageLegalHold,
}: Readonly<{
  recording: RecordingDetail;
  previewUrl: string | null;
  categories: readonly RecordingCategoryOption[];
  thumbnails: readonly RecordingThumbnailOption[];
  canManageLegalHold: boolean;
}>) {
  const [publishState, publishAction, publishPending] = useActionState(
    publishRecordingAction.bind(null, recording.id), initialState,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectRecordingAction.bind(null, recording.id), initialState,
  );
  const [holdState, holdAction, holdPending] = useActionState(
    setRecordingLegalHoldAction.bind(null, recording.id), initialState,
  );
  const canPublish = recording.recordingStatus === "completed" && recording.replayStatus === "private";
  const canReject = recording.replayStatus === "private";

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-border bg-card p-5 lg:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{recording.requestTitle}</h1>
          <span className="rounded-sm border border-border px-2 py-1 text-xs font-semibold capitalize">{recording.recordingStatus}</span>
          <span className="rounded-sm border border-border px-2 py-1 text-xs font-semibold capitalize">{recording.replayStatus}</span>
        </div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Purpose</dt><dd>{recording.requestPurpose}</dd></div>
          <div><dt className="text-muted-foreground">Locality</dt><dd>{recording.requestLocality}</dd></div>
          <div><dt className="text-muted-foreground">Recording window</dt><dd>{date(recording.recordingStartedAt)} – {date(recording.recordingEndedAt)}</dd></div>
          <div><dt className="text-muted-foreground">Duration</dt><dd>{recording.durationSeconds === null ? "Unavailable" : `${recording.durationSeconds.toFixed(1)} seconds`}</dd></div>
          <div><dt className="text-muted-foreground">File size</dt><dd>{recording.bytes === null ? "Unavailable" : new Intl.NumberFormat("en-IN", { style: "unit", unit: "megabyte", maximumFractionDigits: 1 }).format(recording.bytes / 1_000_000)}</dd></div>
          <div><dt className="text-muted-foreground">Retention</dt><dd>{recording.deletionDueAt ? `Eligible after ${date(recording.deletionDueAt)}` : "No scheduled deletion"}</dd></div>
        </dl>
        {recording.rejectionReason ? <p className="mt-5 text-sm"><span className="font-medium">Private rejection reason:</span> {recording.rejectionReason}</p> : null}
        {recording.legalHoldReason ? (
          <p className="mt-3 text-sm">
            <span className="font-medium">Latest private legal-hold reason:</span> {recording.legalHoldReason}
            {recording.legalHoldChangedAt ? ` (${date(recording.legalHoldChangedAt)})` : ""}
          </p>
        ) : null}
      </section>

      {previewUrl ? (
        <section aria-labelledby="recording-preview-heading" className="rounded-md border border-border p-5 lg:p-6">
          <h2 className="text-lg font-semibold" id="recording-preview-heading">Private preview</h2>
          <p className="mt-1 text-sm text-muted-foreground">This authenticated link expires after 60 seconds and is not retained.</p>
          <video aria-label={`Private preview of ${recording.requestTitle}`} className="mt-4 aspect-video w-full rounded-md bg-black" controls preload="metadata" src={previewUrl} />
        </section>
      ) : null}

      {canPublish ? (
        <section className="grid gap-6 rounded-md border border-border p-5 lg:grid-cols-2 lg:p-6">
          <form action={publishAction} className="space-y-4">
            <h2 className="text-lg font-semibold">Publish replay</h2>
            <label className="block text-sm font-medium" htmlFor="recording-title">Title
              <input className={fieldClass} defaultValue={recording.requestTitle} id="recording-title" maxLength={240} minLength={1} name="title" required />
            </label>
            <label className="block text-sm font-medium" htmlFor="recording-description">Description
              <textarea className={fieldClass} id="recording-description" maxLength={4000} minLength={1} name="description" required rows={5} />
            </label>
            <label className="block text-sm font-medium" htmlFor="recording-category">Category
              <select className={fieldClass} defaultValue="" id="recording-category" name="categoryId" required>
                <option disabled value="">Select a category</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium" htmlFor="recording-thumbnail">Thumbnail
              <select className={fieldClass} defaultValue="" id="recording-thumbnail" name="thumbnailMediaId" required>
                <option disabled value="">Select an image</option>
                {thumbnails.map((thumbnail) => <option key={thumbnail.id} value={thumbnail.id}>{thumbnail.title ?? thumbnail.altText}</option>)}
              </select>
            </label>
            {categories.length === 0 || thumbnails.length === 0 ? <p className="text-sm text-destructive">An active category and eligible image are required before publication.</p> : null}
            <Button disabled={publishPending || categories.length === 0 || thumbnails.length === 0} type="submit">Publish recording</Button>
            <StateMessage pending={publishPending} state={publishState} />
          </form>

          <form action={rejectAction} className="space-y-4">
            <h2 className="text-lg font-semibold">Reject replay</h2>
            <p className="text-sm text-muted-foreground">The private reason is visible only to authorized newsroom staff.</p>
            <label className="block text-sm font-medium" htmlFor="recording-rejection-reason">Rejection reason
              <textarea className={fieldClass} id="recording-rejection-reason" maxLength={2000} minLength={1} name="reason" required rows={5} />
            </label>
            <Button disabled={rejectPending} type="submit" variant="destructive">Reject recording</Button>
            <StateMessage pending={rejectPending} state={rejectState} />
          </form>
        </section>
      ) : canReject ? (
        <section className="rounded-md border border-border p-5 lg:p-6">
          <form action={rejectAction} className="max-w-2xl space-y-4">
            <h2 className="text-lg font-semibold">Reject failed recording</h2>
            <label className="block text-sm font-medium" htmlFor="failed-recording-rejection-reason">Private reason
              <textarea className={fieldClass} id="failed-recording-rejection-reason" maxLength={2000} minLength={1} name="reason" required rows={4} />
            </label>
            <Button disabled={rejectPending} type="submit" variant="destructive">Reject recording</Button>
            <StateMessage pending={rejectPending} state={rejectState} />
          </form>
        </section>
      ) : null}

      {canManageLegalHold ? (
        <section className="rounded-md border border-border p-5 lg:p-6">
          <form action={holdAction} className="max-w-2xl space-y-4">
            <h2 className="text-lg font-semibold">Legal hold</h2>
            <p className="text-sm text-muted-foreground">Legal hold blocks retention deletion. It does not publish the replay.</p>
            <input name="enabled" type="hidden" value={recording.legalHold ? "false" : "true"} />
            <label className="block text-sm font-medium" htmlFor="recording-hold-reason">Reason for {recording.legalHold ? "releasing" : "enabling"} legal hold
              <textarea className={fieldClass} id="recording-hold-reason" maxLength={2000} minLength={1} name="reason" required rows={4} />
            </label>
            <Button disabled={holdPending} type="submit" variant="outline">{recording.legalHold ? "Release legal hold" : "Enable legal hold"}</Button>
            <StateMessage pending={holdPending} state={holdState} />
          </form>
        </section>
      ) : null}
    </div>
  );
}
