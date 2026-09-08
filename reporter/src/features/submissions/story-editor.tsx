"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { SubmissionActionState } from "./submission.actions.ts";
import {
  clearRecoveryBeforeRefresh,
  createDraftPersistence,
  createDraftSaveTracker,
  loadLocalDraft,
  loadDraftLocality,
  saveDraftLocality,
  shouldOfferLocalDraft,
  type LocalDraft,
  type LocalDraftFields,
} from "./local-draft.ts";
import { captureCurrentLocation, shouldRequestAutomaticLocation } from "./location-capture.ts";
import { MediaUploader } from "./media-uploader.tsx";
import { canTransitionReporterStory, validateReporterStoryInput, validateSubmissionEvidence, type CapturedLocation } from "./submission.model.ts";

import { createStoryAutosave } from "./story-autosave.ts";

type Action = (state: SubmissionActionState, formData: FormData) => Promise<SubmissionActionState>;

type Media = Readonly<{ id: string; title: string; type: "image" | "video" }>;
type References = Readonly<{
  languages: readonly Readonly<{ id: string; code: "en" | "hi" | "mr"; nativeName: string }>[];
  categories: readonly Readonly<{ id: string; languageId: string; name: string }>[];
}>;

const initialState: SubmissionActionState = { status: "idle" };
const fieldClass = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";
const buttonClass = "min-h-11 rounded-md px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-60";

function editorFields(story: Readonly<{
  title: string; summary: string; body: string; languageId: string; categoryId: string; featuredMediaId: string | null;
}>, languages: References["languages"], media: readonly Media[]): LocalDraftFields {
  return {
    title: story.title,
    summary: story.summary,
    body: story.body,
    languageCode: languages.find((language) => language.id === story.languageId)?.code ?? "",
    languageId: story.languageId,
    categoryId: story.categoryId,
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
  withdrawAction,
  initialLocation = null,
  storageStoryId = storyId,
  initialLocality = "",
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
  withdrawAction?: Action;
  initialLocation?: CapturedLocation | null;
  storageStoryId?: string;
  initialLocality?: string;
}>) {
  const router = useRouter();
  const [fields, setFields] = useState<LocalDraftFields>(() => editorFields(story, references.languages, media));
  const [recoveryBaseline] = useState(() => ({ isPersisted, updatedAt: story.updatedAt }));
  const [restore, setRestore] = useState<LocalDraft | null>(null);
  const [location, setLocation] = useState<CapturedLocation | null>(initialLocation);
  const [locality, setLocality] = useState(initialLocality);
  const [locationMessage, setLocationMessage] = useState("");
  const [locationStatus, setLocationStatus] = useState<"idle" | "capturing" | "success" | "error">(
    initialLocation ? "success" : "idle",
  );
  const [mediaUploadPending, setMediaUploadPending] = useState(false);
  const [storageMessage, setStorageMessage] = useState("");
  const [transitionState, setTransitionState] = useState<SubmissionActionState | null>(null);
  const [cleanupRequired, setCleanupRequired] = useState(false);
  const [transitionPending, startTransition] = useTransition();
  const persistence = useRef<ReturnType<typeof createDraftPersistence> | null>(null);
  const saveTracker = useRef(createDraftSaveTracker());
  const transitionInFlight = useRef(false);
  const transitionSucceeded = useRef(false);
  const locationAttemptStarted = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const fieldsRef = useRef(fields);
  const mediaPendingRef = useRef(false);
  const [autosave] = useState(() => {
    let eventOccurredAt = story.eventOccurredAt;
    return createStoryAutosave({
      initial: fields,
      persisted: isPersisted,
      canSave: (value) => validateReporterStoryInput({ ...value, mediaIds: value.media.map(item => item.id), eventOccurredAt: story.eventOccurredAt }, new Date()).ok,
      save: async (value) => {
        const data = new FormData();
        data.set("title", value.title);
        data.set("summary", value.summary);
        data.set("body", value.body);
        data.set("language", `${value.languageId}:${value.languageCode}`);
        data.set("categoryId", value.categoryId);
        data.set("eventOccurredAt", eventOccurredAt);
        data.set("featuredMediaId", value.featuredMediaId ?? "");
        value.media.forEach(item => data.append("mediaIds", item.id));
        const result = await saveAction(initialState, data);
        if (result.status === "success" && result.storyId !== storyId) return { status: "error" };
        if (result.status === "success" && result.eventOccurredAt) eventOccurredAt = result.eventOccurredAt;
        return result;
      },
    });
  });
  useEffect(() => autosave.subscribeSaved((_value, current) => {
    if (current && persistence.current && !persistence.current.clear(userId, storageStoryId)) {
      setStorageMessage("This browser could not clear local recovery. Your story is saved.");
    }
    // Preserve this mounted editor, including selected File objects and newer edits.
    if (window.location.pathname === "/stories/new") window.history.replaceState(null, "", `/stories/${storyId}`);
  }), [autosave, storageStoryId, storyId, userId]);
  const saveStatus = useSyncExternalStore(autosave.subscribe, autosave.getSnapshot, autosave.getSnapshot);
  const dirty = saveStatus.dirty;
  const saving = saveStatus.status === "saving";

  useEffect(() => () => autosave.cancelTimer(), [autosave]);

  useEffect(() => {
    persistence.current = createDraftPersistence(window.localStorage, window, () => setStorageMessage("This browser could not save local recovery. Your current edits are still open."));
    const saved = loadLocalDraft(window.localStorage, userId, storageStoryId);
    const restoreTimer = window.setTimeout(() => {
      if (shouldOfferLocalDraft(saved, recoveryBaseline.isPersisted, recoveryBaseline.updatedAt)) setRestore(saved);
      const savedLocality = loadDraftLocality(window.localStorage, userId, storageStoryId);
      if (savedLocality !== null) setLocality(savedLocality);
    }, 0);
    return () => {
      window.clearTimeout(restoreTimer);
      persistence.current?.flush();
    };
  }, [recoveryBaseline, storageStoryId, userId]);

  const reportStorageFailure = useCallback((message: string) => {
    window.setTimeout(() => setStorageMessage(message), 0);
  }, []);

  const clearRecovery = useCallback((): boolean => {
    const cleared = (persistence.current?.clear(userId, storageStoryId) ?? false)
      && (!transitionSucceeded.current || saveDraftLocality(window.localStorage, userId, storageStoryId, ""));
    if (!cleared) reportStorageFailure("This browser could not safely clear local recovery. Keep this page open and save again.");
    return cleared;
  }, [reportStorageFailure, storageStoryId, userId]);

  function updateFields(update: (current: LocalDraftFields) => LocalDraftFields) {
    if (transitionInFlight.current || transitionSucceeded.current) return;
    saveTracker.current.edit();
    const next = update(fieldsRef.current);
    fieldsRef.current = next;
    setFields(next);
    persistence.current?.schedule(localDraft(userId, storageStoryId, next));
    autosave.edit(next);
  }

  function restoreDraft() {
    if (!restore) return;
    updateFields(() => restore.fields);
    setRestore(null);
  }

  const setUploadPending = useCallback((pending: boolean) => {
    mediaPendingRef.current = pending;
    setMediaUploadPending(pending);
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      persistence.current?.flush();
      if (autosave.getSnapshot().dirty || mediaPendingRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [autosave]);

  function discardDraft() {
    if (clearRecovery()) setRestore(null);
  }

  const captureLocation = useCallback(async () => {
    locationAttemptStarted.current = true;
    setLocationStatus("capturing");
    setLocationMessage("");
    try {
      const captured = await captureCurrentLocation();
      setLocation(captured);
      setLocationStatus("success");
      setLocationMessage("");
    } catch (error) {
      setLocation(null);
      setLocationStatus("error");
      setLocationMessage(error instanceof Error ? error.message : "Current location could not be captured. Try again.");
    }
  }, []);

  useEffect(() => {
    if (!shouldRequestAutomaticLocation({
      canSubmit,
      attemptStarted: locationAttemptStarted.current,
      location,
      now: new Date(),
    })) return;
    locationAttemptStarted.current = true;
    void captureLocation();
  }, [canSubmit, captureLocation, location]);

  function transition(action: Action | undefined, withdraw = false) {
    const status = autosave.getSnapshot();
    const transitionReady = withdraw ? status.persisted && !mediaPendingRef.current : status.persisted && !status.dirty && status.status === "saved"
      && canTransitionReporterStory({ dirty: status.dirty, mediaUploadPending: mediaPendingRef.current, location, locality, now: new Date() })
      && validateSubmissionEvidence({ location, locality }, new Date()).ok
      && validateReporterStoryInput({ ...fieldsRef.current, mediaIds: fieldsRef.current.media.map(item => item.id), eventOccurredAt: story.eventOccurredAt }, new Date()).ok;
    if ((!withdraw && (restore || !canSubmit)) || transitionSucceeded.current || transitionInFlight.current || !transitionReady || !action || !form.current) return;
    transitionInFlight.current = true;
    setTransitionState(null);
    const formData = new FormData(form.current);
    const transitionGeneration = saveTracker.current.snapshot();
    startTransition(async () => {
      try {
        const result = await autosave.withDraft(() => action(initialState, formData));
        if (result.status === "success") {
          transitionSucceeded.current = true;
          autosave.stop();
          setTransitionState(result);
          if (saveTracker.current.isCurrentGeneration(transitionGeneration)) {
            if (!clearRecoveryBeforeRefresh(clearRecovery, () => router.refresh())) setCleanupRequired(true);
          }
          else reportStorageFailure("Newer edits remain in local recovery. Reopen the draft before leaving this page.");
          return;
        }
        setTransitionState(result);
      } catch {
        setTransitionState({ status: "error", message: "The story could not be updated. Your local recovery is still available." });
      } finally { transitionInFlight.current = false; }
    });
  }

  function retryTransitionCleanup() {
    if (clearRecoveryBeforeRefresh(clearRecovery, () => router.refresh())) setCleanupRequired(false);
  }

  const categories = references.categories.filter((category) => category.languageId === fields.languageId);
  const canTransition = !restore && saveStatus.persisted && saveStatus.status === "saved"
    && canTransitionReporterStory({ dirty, mediaUploadPending, location, locality, now: new Date() })
    && validateReporterStoryInput({ ...fields, mediaIds: fields.media.map(item => item.id), eventOccurredAt: story.eventOccurredAt }, new Date()).ok
    && validateSubmissionEvidence({ location, locality }, new Date()).ok;
  const featuredMedia = fields.media.filter((item) => item.type === "image");
  const isSaving = saving || transitionPending;
  const transitionLocked = transitionPending || transitionState?.status === "success";

  if (!editable) return null;
  return (
    <form className="space-y-5 rounded-lg border border-border bg-background p-5 shadow-sm sm:p-6" onBlur={() => persistence.current?.flush()} onSubmit={(event) => event.preventDefault()} ref={form}>
      <fieldset className="min-w-0 space-y-5" disabled={transitionLocked}>
      <input name="latitude" type="hidden" value={location?.latitude ?? ""} />
      <input name="longitude" type="hidden" value={location?.longitude ?? ""} />
      <input name="accuracy" type="hidden" value={location?.accuracy ?? ""} />
      <input name="capturedAt" type="hidden" value={location?.capturedAt ?? ""} />
      <input name="eventOccurredAt" type="hidden" value={story.eventOccurredAt} />
      {fields.media.map((item) => <input key={item.id} name="mediaIds" type="hidden" value={item.id} />)}
      {restore ? (
        <section aria-labelledby="restore-draft-heading" className="rounded-md border border-border p-3">
          <h2 id="restore-draft-heading" className="font-medium">A newer local draft is available</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose whether to restore it or keep the saved server draft.</p>
          <div className="mt-3 flex gap-2"><button className={`${buttonClass} bg-foreground text-background`} onClick={restoreDraft} type="button">Restore local draft</button><button className={`${buttonClass} border border-border`} onClick={discardDraft} type="button">Discard local draft</button></div>
        </section>
      ) : null}
      <h2 className="font-medium">Story details</h2>
      <label className="block text-sm font-medium">Headline<input className={fieldClass} maxLength={240} name="title" onChange={(event) => updateFields((current) => ({ ...current, title: event.target.value }))} required value={fields.title} /></label>
      <label className="block text-sm font-medium">Summary<textarea className={fieldClass} maxLength={1000} name="summary" onChange={(event) => updateFields((current) => ({ ...current, summary: event.target.value }))} required rows={3} value={fields.summary} /></label>
      <label className="block text-sm font-medium">Body<textarea className={fieldClass} maxLength={100_000} name="body" onChange={(event) => updateFields((current) => ({ ...current, body: event.target.value }))} required rows={10} value={fields.body} /></label>
      <label className="block text-sm font-medium">Language<select className={fieldClass} name="language" onChange={(event) => {
        const [languageId] = event.target.value.split(":", 1);
        const language = references.languages.find((item) => item.id === languageId);
        updateFields((current) => ({ ...current, languageId: language?.id ?? "", languageCode: language?.code ?? "", categoryId: "" }));
      }} required value={fields.languageId ? `${fields.languageId}:${fields.languageCode}` : ""}>{isPersisted ? null : <option value="">Choose a language</option>}{references.languages.map((language) => <option key={language.id} value={`${language.id}:${language.code}`}>{language.nativeName}</option>)}</select></label>
      <label className="block text-sm font-medium">Category<select className={fieldClass} name="categoryId" onChange={(event) => updateFields((current) => ({ ...current, categoryId: event.target.value }))} required value={fields.categoryId}><option value="">Choose a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <MediaUploader storyId={storyId} ready={saveStatus.persisted} withDraft={autosave.withDraft} onPendingChange={setUploadPending} onUploaded={(item) => updateFields((current) => current.media.some((mediaItem) => mediaItem.id === item.id) ? current : { ...current, media: [...current.media, item] })} />
      {fields.media.length ? <section aria-labelledby="attached-media-heading"><h2 id="attached-media-heading" className="font-medium">Attached media</h2><ol className="mt-2 space-y-2">{fields.media.map((item, index) => <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2"><span className="w-full min-w-0 break-words sm:w-auto sm:flex-1">{item.title}</span><button aria-label={`Move media up: ${item.title}`} className={buttonClass} disabled={index === 0 || isSaving} onClick={() => updateFields((current) => ({ ...current, media: current.media.map((mediaItem, position) => position === index ? current.media[index - 1] : position === index - 1 ? current.media[index] : mediaItem) }))} type="button">Move media up</button><button aria-label={`Move media down: ${item.title}`} className={buttonClass} disabled={index === fields.media.length - 1 || isSaving} onClick={() => updateFields((current) => ({ ...current, media: current.media.map((mediaItem, position) => position === index ? current.media[index + 1] : position === index + 1 ? current.media[index] : mediaItem) }))} type="button">Move media down</button><button aria-label={`Remove media: ${item.title}`} className={buttonClass} disabled={isSaving} onClick={() => updateFields((current) => ({ ...current, media: current.media.filter((mediaItem) => mediaItem.id !== item.id), featuredMediaId: current.featuredMediaId === item.id ? null : current.featuredMediaId }))} type="button">Remove media</button></li>)}</ol></section> : null}
      {featuredMedia.length ? <label className="block text-sm font-medium">Featured image<select className={fieldClass} name="featuredMediaId" onChange={(event) => updateFields((current) => ({ ...current, featuredMediaId: event.target.value || null }))} value={fields.featuredMediaId ?? ""}><option value="">None</option>{featuredMedia.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label> : <input name="featuredMediaId" type="hidden" value="" />}
      {mediaUploadPending ? <p aria-live="polite" className="text-sm text-muted-foreground" role="status">Uploads must finish, or failed files must be retried or removed, before submitting.</p> : null}
      <div aria-live="polite" role="status" className="text-sm text-muted-foreground">
        {saveStatus.status === "error" ? <><span>Could not save your changes.</span> <button className={`${buttonClass} underline`} onClick={() => void autosave.flush()} type="button">Retry</button></>
          : saving ? "Saving…"
          : saveStatus.status === "saved" ? "Saved automatically"
          : saveStatus.dirty && validateReporterStoryInput({ ...fields, mediaIds: fields.media.map(item => item.id), eventOccurredAt: story.eventOccurredAt }, new Date()).ok ? "Changes waiting to save…"
          : "Complete the required story details to save automatically."}
      </div>
      {storageMessage ? <p aria-live="polite" className="text-sm text-destructive" role="alert">{storageMessage}</p> : null}
      {canSubmit ? <section className="space-y-3 border-t border-border pt-5">{locationStatus === "error" ? <><p aria-live="polite" className="text-sm text-destructive" role="alert">{locationMessage}</p><button className={`${buttonClass} border border-border`} disabled={transitionPending} onClick={() => void captureLocation()} type="button">Retry location</button></> : null}<label className="block text-sm font-medium">Detailed locality confirmation<input aria-required="true" className={fieldClass} maxLength={200} name="locality" onChange={(event) => {
        const value = event.target.value;
        setLocality(value);
        if (!saveDraftLocality(window.localStorage, userId, storageStoryId, value)) setStorageMessage("This browser could not save your locality. Keep this page open until you submit.");
      }} value={locality} /></label><div className="flex flex-wrap gap-2"><button className={`${buttonClass} bg-foreground text-background`} disabled={!canTransition || transitionPending} onClick={() => transition(submitAction)} type="button">{transitionPending ? "Working…" : "Submit for review"}</button>{canDirectPublish ? <button className={`${buttonClass} border border-border`} disabled={!canTransition || transitionPending} onClick={() => transition(directAction)} type="button">Publish directly</button> : null}</div></section> : null}
      {actionMessage(transitionState)}
      {withdrawAction && saveStatus.persisted ? <button className={`${buttonClass} text-destructive underline underline-offset-4`} disabled={mediaUploadPending || transitionPending} onClick={() => transition(withdrawAction, true)} type="button">Withdraw story</button> : null}
      </fieldset>
      {cleanupRequired ? <section aria-live="polite" className="space-y-2 rounded-md border border-border p-3" role="status"><p className="text-sm">The story was updated, but local recovery cleanup failed. Editing remains locked.</p><button className={`${buttonClass} border border-border`} onClick={retryTransitionCleanup} type="button">Retry cleanup and refresh</button></section> : null}
    </form>
  );
}
