"use client";

import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { SubmissionActionState } from "./submission.actions.ts";
import {
  createDraftPersistence,
  createDraftSaveTracker,
  loadLocalDraft,
  migrateLocalDraft,
  shouldOfferLocalDraft,
  type LocalDraft,
  type LocalDraftFields,
} from "./local-draft.ts";
import { captureCurrentLocation } from "./location-capture.ts";
import { MediaUploader } from "./media-uploader.tsx";
import { isFreshCapture, type CapturedLocation } from "./submission.model.ts";

type Action = (state: SubmissionActionState, formData: FormData) => Promise<SubmissionActionState>;
type EditorActionState = SubmissionActionState & Readonly<{ draftSaveAttempt?: number; draftSaveGeneration?: number }>;
type Media = Readonly<{ id: string; title: string; type: "image" | "video" }>;
type References = Readonly<{
  languages: readonly Readonly<{ id: string; code: "en" | "hi" | "mr"; nativeName: string }>[];
  categories: readonly Readonly<{ id: string; languageId: string; name: string }>[];
}>;

const initialState: EditorActionState = { status: "idle" };
const fieldClass = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";
const buttonClass = "min-h-11 rounded-md px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-60";

function indiaDateTime(value: string): string {
  if (!value.includes("T") || !(value.endsWith("Z") || /[+-]\d{2}:\d{2}$/u.test(value))) return value;
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(value));
  const date = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${date.year}-${date.month}-${date.day}T${date.hour}:${date.minute}`;
}

function editorFields(story: Readonly<{
  title: string; summary: string; body: string; languageId: string; categoryId: string; eventOccurredAt: string; featuredMediaId: string | null;
}>, languages: References["languages"], media: readonly Media[]): LocalDraftFields {
  return {
    title: story.title,
    summary: story.summary,
    body: story.body,
    languageCode: languages.find((language) => language.id === story.languageId)?.code ?? "",
    languageId: story.languageId,
    categoryId: story.categoryId,
    eventOccurredAt: indiaDateTime(story.eventOccurredAt),
    media,
    featuredMediaId: story.featuredMediaId,
  };
}

function localDraft(userId: string, storyId: string, fields: LocalDraftFields): LocalDraft {
  return { version: 1, userId, storyId, updatedAt: new Date().toISOString(), fields };
}

function actionMessage(state: SubmissionActionState | null): React.ReactNode {
  if (!state?.message) return null;
  return <><p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role={state.status === "error" ? "alert" : undefined}>{state.message}</p>{state.fieldErrors ? <ul className="list-disc pl-5 text-sm text-destructive">{Object.entries(state.fieldErrors).flatMap(([field, messages]) => messages.map((message) => <li key={`${field}:${message}`}>{message}</li>))}</ul> : null}</>;
}

export function StoryEditor({
  userId,
  storyId,
  story,
  media,
  references,
  editable,
  isPersisted,
  canSubmit,
  canDirectPublish,
  saveAction,
  submitAction,
  directAction,
  storageStoryId = storyId,
}: Readonly<{
  userId: string;
  storyId: string;
  story: Readonly<{ title: string; summary: string; body: string; languageId: string; categoryId: string; eventOccurredAt: string; featuredMediaId: string | null; updatedAt: string }>;
  media: readonly Media[];
  references: References;
  editable: boolean;
  isPersisted: boolean;
  canSubmit: boolean;
  canDirectPublish: boolean;
  saveAction: Action;
  submitAction?: Action;
  directAction?: Action;
  storageStoryId?: string;
}>) {
  const router = useRouter();
  const [fields, setFields] = useState<LocalDraftFields>(() => editorFields(story, references.languages, media));
  const [restore, setRestore] = useState<LocalDraft | null>(null);
  const [location, setLocation] = useState<CapturedLocation | null>(null);
  const [locality, setLocality] = useState("");
  const [locationMessage, setLocationMessage] = useState("Capture current location before submitting. This is private evidence, not public story content.");
  const [capturing, setCapturing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [storageMessage, setStorageMessage] = useState("");
  const [transitionState, setTransitionState] = useState<SubmissionActionState | null>(null);
  const [transitionPending, startTransition] = useTransition();
  const persistence = useRef<ReturnType<typeof createDraftPersistence> | null>(null);
  const saveTracker = useRef(createDraftSaveTracker());
  const saveAttemptInput = useRef<HTMLInputElement>(null);
  const saveGenerationInput = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [saveState, saveFormAction, saving] = useActionState(async (previous: EditorActionState, formData: FormData) => {
    const result = await saveAction(previous, formData);
    return {
      ...result,
      draftSaveAttempt: Number(formData.get("draftSaveAttempt")),
      draftSaveGeneration: Number(formData.get("draftSaveGeneration")),
    };
  }, initialState);

  useEffect(() => {
    persistence.current = createDraftPersistence(window.localStorage, window, () => setStorageMessage("This browser could not save local recovery. Your current edits are still open."));
    const saved = loadLocalDraft(window.localStorage, userId, storageStoryId);
    const restoreTimer = window.setTimeout(() => {
      if (shouldOfferLocalDraft(saved, isPersisted, story.updatedAt)) setRestore(saved);
    }, 0);
    return () => {
      window.clearTimeout(restoreTimer);
      persistence.current?.flush();
    };
  }, [isPersisted, storageStoryId, story.updatedAt, userId]);

  const reportStorageFailure = useCallback((message: string) => {
    window.setTimeout(() => setStorageMessage(message), 0);
  }, []);

  const clearRecovery = useCallback((): boolean => {
    const cleared = persistence.current?.clear(userId, storageStoryId) ?? false;
    if (!cleared) reportStorageFailure("This browser could not safely clear local recovery. Keep this page open and save again.");
    return cleared;
  }, [reportStorageFailure, storageStoryId, userId]);

  useEffect(() => {
    if (!Number.isSafeInteger(saveState.draftSaveAttempt) || !Number.isSafeInteger(saveState.draftSaveGeneration)) return;
    const acknowledgement = saveTracker.current.acknowledge({
      attempt: saveState.draftSaveAttempt ?? 0,
      generation: saveState.draftSaveGeneration ?? 0,
      status: saveState.status,
    });
    if (saveState.status !== "success" || !saveState.storyId) return;
    if (saveState.redirectToEditor) {
      if (acknowledgement.clear) {
        if (!clearRecovery()) return;
      } else if (acknowledgement.stale) {
        const migrated = migrateLocalDraft(window.localStorage, userId, storageStoryId, saveState.storyId, fields, saveState.updatedAt);
        if (!migrated) {
          reportStorageFailure("This browser could not safely move newer local recovery. Keep this page open and save again.");
          return;
        }
        if (!clearRecovery()) return;
      }
      router.replace(`/stories/${saveState.storyId}`);
      return;
    }
    if (!acknowledgement.clear) return;
    if (!clearRecovery()) return;
    const savedGeneration = saveState.draftSaveGeneration ?? 0;
    const cleanTimer = window.setTimeout(() => {
      if (saveTracker.current.isCurrentGeneration(savedGeneration)) setDirty(false);
    }, 0);
    return () => window.clearTimeout(cleanTimer);
  }, [clearRecovery, fields, reportStorageFailure, router, saveState, storageStoryId, userId]);

  useEffect(() => {
    if (transitionState?.status === "success") clearRecovery();
  }, [clearRecovery, transitionState?.status]);

  function updateFields(update: (current: LocalDraftFields) => LocalDraftFields) {
    saveTracker.current.edit();
    setDirty(true);
    setFields((current) => {
      const next = update(current);
      persistence.current?.schedule(localDraft(userId, storageStoryId, next));
      return next;
    });
  }

  function restoreDraft() {
    if (!restore) return;
    setFields({ ...restore.fields, eventOccurredAt: indiaDateTime(restore.fields.eventOccurredAt) });
    saveTracker.current.edit();
    setDirty(true);
    persistence.current?.schedule(restore);
    setRestore(null);
  }

  function discardDraft() {
    if (clearRecovery()) setRestore(null);
  }

  async function captureLocation() {
    setCapturing(true);
    try {
      const captured = await captureCurrentLocation();
      setLocation(captured);
      setLocationMessage("Current location captured. Confirm the detailed locality before continuing.");
    } catch (error) {
      setLocation(null);
      setLocationMessage(error instanceof Error ? error.message : "Current location could not be captured. Try again.");
    } finally {
      setCapturing(false);
    }
  }

  function transition(action: Action | undefined) {
    if (dirty || !action || !form.current || !location || !isFreshCapture(location.capturedAt, new Date()) || !locality.trim()) return;
    setTransitionState(null);
    const formData = new FormData(form.current);
    startTransition(async () => setTransitionState(await action(initialState, formData)));
  }

  function prepareSave() {
    const token = saveTracker.current.beginSave();
    if (saveAttemptInput.current) saveAttemptInput.current.value = String(token.attempt);
    if (saveGenerationInput.current) saveGenerationInput.current.value = String(token.generation);
  }

  const categories = references.categories.filter((category) => category.languageId === fields.languageId);
  const canTransition = Boolean(!dirty && location && isFreshCapture(location.capturedAt, new Date()) && locality.trim());
  const featuredMedia = fields.media.filter((item) => item.type === "image");
  const isSaving = saving || transitionPending;

  if (!editable) return null;
  return (
    <form action={saveFormAction} className="space-y-5 rounded-lg border border-border bg-background p-5 shadow-sm sm:p-6" onBlur={() => persistence.current?.flush()} onSubmit={prepareSave} ref={form}>
      <input name="draftSaveAttempt" ref={saveAttemptInput} type="hidden" />
      <input name="draftSaveGeneration" ref={saveGenerationInput} type="hidden" />
      <input name="latitude" type="hidden" value={location?.latitude ?? ""} />
      <input name="longitude" type="hidden" value={location?.longitude ?? ""} />
      <input name="accuracy" type="hidden" value={location?.accuracy ?? ""} />
      <input name="capturedAt" type="hidden" value={location?.capturedAt ?? ""} />
      {fields.media.map((item) => <input key={item.id} name="mediaIds" type="hidden" value={item.id} />)}
      {restore ? (
        <section aria-labelledby="restore-draft-heading" className="rounded-md border border-border p-3">
          <h2 id="restore-draft-heading" className="font-medium">A newer local draft is available</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose whether to restore it or keep the saved server draft.</p>
          <div className="mt-3 flex gap-2"><button className={`${buttonClass} bg-foreground text-background`} onClick={restoreDraft} type="button">Restore local draft</button><button className={`${buttonClass} border border-border`} onClick={discardDraft} type="button">Discard local draft</button></div>
        </section>
      ) : null}
      <label className="block text-sm font-medium">Headline<input className={fieldClass} maxLength={240} name="title" onChange={(event) => updateFields((current) => ({ ...current, title: event.target.value }))} required value={fields.title} /></label>
      <label className="block text-sm font-medium">Summary<textarea className={fieldClass} maxLength={1000} name="summary" onChange={(event) => updateFields((current) => ({ ...current, summary: event.target.value }))} required rows={3} value={fields.summary} /></label>
      <label className="block text-sm font-medium">Body<textarea className={fieldClass} maxLength={100_000} name="body" onChange={(event) => updateFields((current) => ({ ...current, body: event.target.value }))} required rows={10} value={fields.body} /></label>
      <label className="block text-sm font-medium">Language<select className={fieldClass} name="language" onChange={(event) => {
        const [languageId] = event.target.value.split(":", 1);
        const language = references.languages.find((item) => item.id === languageId);
        updateFields((current) => ({ ...current, languageId: language?.id ?? "", languageCode: language?.code ?? "", categoryId: "" }));
      }} required value={fields.languageId ? `${fields.languageId}:${fields.languageCode}` : ""}>{isPersisted ? null : <option value="">Choose a language</option>}{references.languages.map((language) => <option key={language.id} value={`${language.id}:${language.code}`}>{language.nativeName}</option>)}</select></label>
      <label className="block text-sm font-medium">Category<select className={fieldClass} name="categoryId" onChange={(event) => updateFields((current) => ({ ...current, categoryId: event.target.value }))} required value={fields.categoryId}><option value="">Choose a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label className="block text-sm font-medium">Event time (India time)<input className={fieldClass} name="eventOccurredAt" onChange={(event) => updateFields((current) => ({ ...current, eventOccurredAt: event.target.value }))} required type="datetime-local" value={fields.eventOccurredAt} /></label>
      {isPersisted && editable ? <MediaUploader storyId={storyId} onUploaded={(item) => updateFields((current) => current.media.some((mediaItem) => mediaItem.id === item.id) ? current : { ...current, media: [...current.media, item] })} /> : <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">Save this first draft before adding media.</p>}
      {fields.media.length ? <section aria-labelledby="attached-media-heading"><h2 id="attached-media-heading" className="font-medium">Attached media</h2><ol className="mt-2 space-y-2">{fields.media.map((item, index) => <li key={item.id} className="flex items-center gap-2 rounded-md border border-border p-2"><span className="min-w-0 flex-1 truncate">{item.title}</span><button aria-label={`Move media up: ${item.title}`} className={buttonClass} disabled={index === 0 || isSaving} onClick={() => updateFields((current) => ({ ...current, media: current.media.map((mediaItem, position) => position === index ? current.media[index - 1] : position === index - 1 ? current.media[index] : mediaItem) }))} type="button">Move media up</button><button aria-label={`Move media down: ${item.title}`} className={buttonClass} disabled={index === fields.media.length - 1 || isSaving} onClick={() => updateFields((current) => ({ ...current, media: current.media.map((mediaItem, position) => position === index ? current.media[index + 1] : position === index + 1 ? current.media[index] : mediaItem) }))} type="button">Move media down</button><button aria-label={`Remove media: ${item.title}`} className={buttonClass} disabled={isSaving} onClick={() => updateFields((current) => ({ ...current, media: current.media.filter((mediaItem) => mediaItem.id !== item.id), featuredMediaId: current.featuredMediaId === item.id ? null : current.featuredMediaId }))} type="button">Remove media</button></li>)}</ol></section> : null}
      {featuredMedia.length ? <label className="block text-sm font-medium">Featured image<select className={fieldClass} name="featuredMediaId" onChange={(event) => updateFields((current) => ({ ...current, featuredMediaId: event.target.value || null }))} value={fields.featuredMediaId ?? ""}><option value="">None</option>{featuredMedia.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label> : <input name="featuredMediaId" type="hidden" value="" />}
      <button className={`${buttonClass} bg-foreground text-background`} disabled={isSaving} type="submit">{saving ? "Saving…" : "Save draft"}</button>
      {actionMessage(saveState)}
      {storageMessage ? <p aria-live="polite" className="text-sm text-destructive" role="alert">{storageMessage}</p> : null}
      {canSubmit ? <section aria-labelledby="private-evidence-heading" className="space-y-3 border-t border-border pt-5"><h2 id="private-evidence-heading" className="text-lg font-semibold">Private current-location evidence</h2><p className="text-sm text-muted-foreground">Your exact coordinates, accuracy, and capture time are private evidence for the newsroom and never appear in the story.</p><button className={`${buttonClass} border border-border`} disabled={capturing || transitionPending} onClick={() => void captureLocation()} type="button">{capturing ? "Capturing location…" : "Capture current location"}</button><p aria-live="polite" className="text-sm" role={location ? "status" : undefined}>{locationMessage}</p>{location ? <p className="rounded-md border border-border p-3 text-sm">Private capture: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)} · accuracy {Math.round(location.accuracy)} m · {new Date(location.capturedAt).toLocaleString()}</p> : null}<label className="block text-sm font-medium">Detailed locality confirmation<input aria-required="true" className={fieldClass} maxLength={200} name="locality" onChange={(event) => setLocality(event.target.value)} value={locality} /></label><div className="flex flex-wrap gap-2"><button className={`${buttonClass} bg-foreground text-background`} disabled={!canTransition || transitionPending} onClick={() => transition(submitAction)} type="button">{transitionPending ? "Working…" : "Submit for review"}</button>{canDirectPublish ? <button className={`${buttonClass} border border-border`} disabled={!canTransition || transitionPending} onClick={() => transition(directAction)} type="button">Publish directly</button> : null}</div>{actionMessage(transitionState)}</section> : null}
    </form>
  );
}
