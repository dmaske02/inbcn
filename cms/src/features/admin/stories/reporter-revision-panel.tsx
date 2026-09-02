"use client";

import Image from "next/image";
import { Images, Video } from "lucide-react";
import { useActionState, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { CmsStoryDto, CmsStoryReferenceDto } from "@/features/news/server";
import { correctReporterStoryAction, reviewReporterStoryAction, type ReporterReviewActionState } from "./story.actions";
import type { ReporterStoryReview, StoryCommand } from "./story.model";

const initialState: ReporterReviewActionState = { status: "idle" };
const inputClass = "min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const labels: Partial<Record<StoryCommand, string>> = {
  request_changes: "Request changes",
  approve: "Approve",
  reject: "Reject",
  publish: "Publish now",
  schedule: "Schedule publication",
  archive: "Remove from public view",
};

function format(value: string | null): string {
  return value ? new Date(value).toLocaleString("en-IN") : "Not set";
}

function ReviewActionForm({
  command,
  storyId,
  revisionId,
}: Readonly<{ command: StoryCommand; storyId: string; revisionId: string }>) {
  const action = reviewReporterStoryAction.bind(null, storyId, revisionId, command);
  const [state, formAction, pending] = useActionState(action, initialState);
  const needsReason = command === "request_changes" || command === "reject";
  return (
    <form action={formAction} className="space-y-3 rounded-md border border-border p-4">
      <h3 className="font-medium">{labels[command]}</h3>
      {needsReason ? (
        <label className="grid gap-2 text-sm">
          <span>Required editorial reason</span>
          <textarea className={inputClass} maxLength={2000} name="reason" required rows={3} />
        </label>
      ) : <input name="reason" type="hidden" value="" />}
      {command === "schedule" ? (
        <label className="grid gap-2 text-sm">
          <span>Future publication time</span>
          <input className={inputClass} name="scheduledAt" required type="datetime-local" />
        </label>
      ) : <input name="scheduledAt" type="hidden" value="" />}
      <Button disabled={pending} type="submit" variant={command === "reject" ? "destructive" : "outline"}>
        {pending ? "Working…" : labels[command]}
      </Button>
      <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role="status">{state.message ?? ""}</p>
    </form>
  );
}

function EditorialCorrectionForm({
  references,
  review,
  story,
}: Readonly<{
  references: CmsStoryReferenceDto;
  review: ReporterStoryReview;
  story: CmsStoryDto;
}>) {
  const canonical = review.canonical_story;
  const action = correctReporterStoryAction.bind(null, canonical.id, review.latest_revision.id);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [languageId, setLanguageId] = useState(story.languageId);
  const categories = references.categories.filter((category) => category.languageId === languageId);
  const images = review.submitted_media.filter((media) => media.type === "image");
  return (
    <form action={formAction} className="grid gap-4 lg:grid-cols-2">
      <input name="expectedUpdatedAt" type="hidden" value={story.updatedAt} />
      <label className="grid gap-2 text-sm"><span>Headline</span><input className={inputClass} defaultValue={story.title} maxLength={240} name="title" required /></label>
      <label className="grid gap-2 text-sm"><span>Slug</span><input className={inputClass} defaultValue={story.slug} name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label>
      <label className="grid gap-2 text-sm lg:col-span-2"><span>Summary</span><textarea className={inputClass} defaultValue={story.summary} maxLength={1000} name="summary" required rows={3} /></label>
      <label className="grid gap-2 text-sm lg:col-span-2"><span>Body</span><textarea className={inputClass} defaultValue={story.content} maxLength={100_000} name="content" required rows={10} /></label>
      <label className="grid gap-2 text-sm"><span>Language</span><select className={inputClass} name="languageId" onChange={(event) => setLanguageId(event.target.value)} value={languageId}>{references.languages.map((language) => <option key={language.id} value={language.id}>{language.name}</option>)}</select></label>
      <label className="grid gap-2 text-sm"><span>Category</span><select className={inputClass} defaultValue={languageId === story.languageId ? story.categoryId : categories[0]?.id} key={languageId} name="categoryId" required>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label className="grid gap-2 text-sm"><span>Featured submitted image</span><select className={inputClass} defaultValue={story.featuredMediaId ?? ""} name="featuredMediaId"><option value="">None</option>{images.map((media) => <option key={media.id} value={media.id}>{media.title}</option>)}</select></label>
      <label className="grid gap-2 text-sm"><span>SEO keywords</span><input className={inputClass} defaultValue={story.seoKeywords.join(", ")} maxLength={1000} name="tags" /></label>
      <label className="grid gap-2 text-sm"><span>SEO title</span><input className={inputClass} defaultValue={story.seoTitle ?? ""} maxLength={240} name="seoTitle" /></label>
      <label className="grid gap-2 text-sm"><span>SEO description</span><textarea className={inputClass} defaultValue={story.seoDescription ?? ""} maxLength={1000} name="seoDescription" rows={3} /></label>
      <label className="grid gap-2 text-sm lg:col-span-2"><span>Required correction reason</span><textarea className={inputClass} maxLength={2000} name="reason" required rows={3} /></label>
      <div className="lg:col-span-2"><Button disabled={pending} type="submit">{pending ? "Saving correction…" : "Save editorial correction"}</Button><p aria-live="polite" className={state.status === "error" ? "mt-2 text-sm text-destructive" : "mt-2 text-sm text-muted-foreground"} role="status">{state.message ?? ""}</p></div>
    </form>
  );
}

export function ReporterRevisionPanel({
  commands,
  references,
  review,
  story,
}: Readonly<{ commands: readonly StoryCommand[]; references: CmsStoryReferenceDto; review: ReporterStoryReview; story: CmsStoryDto }>) {
  const revision = review.latest_revision;
  const snapshot = revision.snapshot;
  const canonical = review.canonical_story;
  const reporter = review.reporter;
  const reviewCommands = commands.filter((command) => command in labels);
  const exactLocationAvailable = review.private_location !== null
    && review.private_location.latitude !== null
    && review.private_location.longitude !== null
    && review.private_location.accuracy_meters !== null
    && review.private_location.captured_at !== null;

  return (
    <div className="space-y-5">
      <Card padding="none">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div><h2 className="text-lg font-semibold">Immutable submitted revision #{revision.number}</h2><p className="text-sm text-muted-foreground">Submitted {format(revision.submitted_at)}. This evidence cannot be rewritten from CMS.</p></div>
          <Badge variant="outline">{revision.outcome.replaceAll("_", " ")}</Badge>
        </CardHeader>
        <CardContent className="space-y-5">
          {revision.reason ? <p className="rounded-md border border-border bg-muted/40 p-3 text-sm"><span className="font-medium">Latest outcome reason:</span> {revision.reason}</p> : null}
          <div className="grid gap-5 lg:grid-cols-2">
            <article className="space-y-3 rounded-md border border-border p-4">
              <h3 className="font-semibold">Submitted snapshot</h3>
              <dl className="grid gap-2 text-sm"><div><dt className="text-muted-foreground">Headline</dt><dd>{snapshot.title}</dd></div><div><dt className="text-muted-foreground">Slug</dt><dd>/{snapshot.slug}</dd></div><div><dt className="text-muted-foreground">Language / category IDs</dt><dd className="break-all">{snapshot.language_id} / {snapshot.category_id}</dd></div><div><dt className="text-muted-foreground">Event time</dt><dd>{format(snapshot.event_occurred_at)}</dd></div><div><dt className="text-muted-foreground">Featured / media IDs</dt><dd className="break-all">{snapshot.featured_media_id ?? "None"} / {snapshot.media_ids.join(", ") || "None"}</dd></div></dl>
              <div><h4 className="text-sm font-medium">Summary</h4><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{snapshot.summary}</p></div>
              <div><h4 className="text-sm font-medium">Body</h4><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{snapshot.content}</p></div>
            </article>
            <article className="space-y-3 rounded-md border border-border p-4">
              <h3 className="font-semibold">Current canonical story</h3>
              <dl className="grid gap-2 text-sm"><div><dt className="text-muted-foreground">Status</dt><dd>{canonical.status.replaceAll("_", " ")}</dd></div><div><dt className="text-muted-foreground">Headline</dt><dd>{canonical.title}</dd></div><div><dt className="text-muted-foreground">Slug</dt><dd>/{canonical.slug}</dd></div><div><dt className="text-muted-foreground">Language / category IDs</dt><dd className="break-all">{canonical.language_id} / {canonical.category_id}</dd></div><div><dt className="text-muted-foreground">Event time</dt><dd>{format(canonical.event_occurred_at)}</dd></div><div><dt className="text-muted-foreground">Approved / scheduled / published</dt><dd>{format(canonical.approved_at)} / {format(canonical.scheduled_at)} / {format(canonical.published_at)}</dd></div></dl>
              <div><h4 className="text-sm font-medium">Summary</h4><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{canonical.summary}</p></div>
              <div><h4 className="text-sm font-medium">Body</h4><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{canonical.content}</p></div>
            </article>
          </div>
        </CardContent>
      </Card>

      <Card padding="none" className="border-signal/50 border-l-4 bg-signal/5">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <Images aria-hidden="true" className="size-5 text-signal" />
            <h2 className="text-xl font-semibold">Submitted media · {review.submitted_media.length} {review.submitted_media.length === 1 ? "file" : "files"}</h2>
          </div>
          <p className="text-sm text-muted-foreground">Canonical media attached to this immutable submitted revision.</p>
        </CardHeader>
        <CardContent>
          {review.submitted_media.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {review.submitted_media.map((media, index) => (
                <li className="min-w-0 overflow-hidden rounded-md border border-border bg-background text-sm" key={media.id}>
                  <div className="relative aspect-video overflow-hidden border-b border-border bg-muted/40">
                    {media.type === "image" ? (
                      <Image
                        alt={media.alt_text || `Submitted media ${index + 1}: ${media.original_filename}`}
                        fill
                        className="object-contain"
                        sizes="(max-width: 639px) 100vw, (max-width: 1279px) 50vw, 33vw"
                        src={media.secure_url}
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                        <Video aria-hidden="true" className="size-8" />
                        <span className="font-medium">Video file</span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">Media {index + 1}</h3>
                      {media.id === snapshot.featured_media_id ? <Badge variant="signal">Featured</Badge> : null}
                    </div>
                    <dl className="space-y-1 text-muted-foreground">
                      <div><dt className="sr-only">Filename</dt><dd className="break-words font-medium text-foreground">{media.original_filename}</dd></div>
                      <div><dt className="sr-only">Media type</dt><dd className="capitalize">{media.type}</dd></div>
                      {media.width !== null && media.height !== null ? <div><dt className="sr-only">Dimensions</dt><dd>{media.width} × {media.height}</dd></div> : null}
                      {media.duration_seconds !== null ? <div><dt className="sr-only">Duration</dt><dd>{media.duration_seconds}s</dd></div> : null}
                    </dl>
                    <a className="inline-flex min-h-11 items-center text-primary underline underline-offset-4" href={media.secure_url} rel="noreferrer" target="_blank">Open submitted media</a>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-md border border-dashed border-border bg-background/70 p-5">
              <h3 className="font-semibold">No media submitted</h3>
              <p className="mt-1 text-sm text-muted-foreground">This revision does not contain any canonical media.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card padding="none">
        <CardHeader><h2 className="text-lg font-semibold">Verified reporter</h2></CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-[10rem_minmax(0,1fr)]">
          <div className="relative aspect-square overflow-hidden rounded-md border border-border bg-muted"><Image alt={`Approved public portrait of ${reporter.legal_name}`} className="object-cover" fill sizes="160px" src={reporter.portrait_url} /></div>
          <div className="space-y-3"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{reporter.legal_name}</h3><Badge variant={reporter.is_active && !reporter.is_suspended ? "verified" : "outline"}>{reporter.public_status}</Badge></div><p className="text-sm text-muted-foreground">/{reporter.public_slug} · {reporter.home_city}, {reporter.home_district}, {reporter.home_state}</p>{reporter.bio ? <p className="text-sm">{reporter.bio}</p> : null}<p className="text-sm">Beats: {reporter.beats.join(", ") || "None supplied"}</p><p className="text-sm">Membership expires {format(reporter.membership_expires_at)}; grace ends {format(reporter.membership_grace_ends_at)}.</p><p className="text-sm">Direct publication: raw {reporter.direct_publish_raw ? "enabled" : "disabled"}, effective {reporter.direct_publish_effective ? "yes" : "no"}. Live: raw {reporter.live_broadcast_raw ? "enabled" : "disabled"}, effective {reporter.live_broadcast_effective ? "yes" : "no"}.</p></div>
        </CardContent>
      </Card>

      <Card padding="none" className="border-signal/50">
        <CardHeader><h2 className="text-lg font-semibold">Private newsroom evidence</h2><p className="text-sm text-muted-foreground">Exact coordinates must never be copied into public story fields, URLs, logs, or audit metadata.</p></CardHeader>
        <CardContent>
          {review.private_location ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {exactLocationAvailable ? <>
                <div><dt className="text-muted-foreground">Exact latitude / longitude</dt><dd>{review.private_location.latitude}, {review.private_location.longitude}</dd></div>
                <div><dt className="text-muted-foreground">Accuracy</dt><dd>{review.private_location.accuracy_meters} metres</dd></div>
                <div><dt className="text-muted-foreground">Captured</dt><dd>{format(review.private_location.captured_at)}</dd></div>
              </> : <div><dt className="text-muted-foreground">Exact evidence</dt><dd>Expired or unavailable</dd></div>}
              <div><dt className="text-muted-foreground">Locality</dt><dd>{review.private_location.locality}</dd></div>
            </dl>
          ) : <p className="text-sm text-muted-foreground">Private location evidence is unavailable.</p>}
        </CardContent>
      </Card>

      {["pending_review", "approved", "scheduled", "published"].includes(canonical.status) ? <Card padding="none"><CardHeader><h2 className="text-lg font-semibold">Editorial correction</h2><p className="text-sm text-muted-foreground">Correct the canonical newsroom version with a required audit reason. Immutable reporter-submitted revisions remain unchanged.</p></CardHeader><CardContent><EditorialCorrectionForm references={references} review={review} story={story} /></CardContent></Card> : null}

      {reviewCommands.length ? <Card padding="none"><CardHeader><h2 className="text-lg font-semibold">Review actions</h2><p className="text-sm text-muted-foreground">Actions apply to revision #{revision.number}. Refresh if another editor has already acted.</p></CardHeader><CardContent className="grid gap-4 lg:grid-cols-2">{reviewCommands.map((command) => <ReviewActionForm command={command} key={command} revisionId={revision.id} storyId={canonical.id} />)}</CardContent></Card> : null}

      <Card padding="none"><CardHeader><h2 className="text-lg font-semibold">Story-only audit history</h2></CardHeader><CardContent>{review.story_audit.length ? <ol className="space-y-2 text-sm">{review.story_audit.map((event, index) => <li key={`${event.action}:${event.created_at}:${index}`}>{event.action} · {event.actor_name ?? "System"} · <time dateTime={event.created_at}>{format(event.created_at)}</time></li>)}</ol> : <p className="text-sm text-muted-foreground">No story audit events are available.</p>}</CardContent></Card>
    </div>
  );
}
