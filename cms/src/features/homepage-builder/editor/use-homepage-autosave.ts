"use client";

import * as React from "react";
import type { HomepageSectionDto } from "../homepage-builder.types.ts";
import type {
  EditorActionResult,
  HomepageEditorDraft,
  HomepageEditorEvent,
  HomepageEditorState,
} from "./homepage-editor.types.ts";

type TimerHandle = unknown;

export type HomepageAutosaveTask<Result = unknown> = Readonly<{
  sectionId: string;
  revision: number;
  run(sequence: number): Promise<Result>;
  onStart(sequence: number): void;
  onResult(result: Result, sequence: number): void;
  onError(error: unknown, sequence: number): void;
}>;

type SchedulerOptions = Readonly<{
  delay: number;
  setTimer(callback: () => void, delay: number): TimerHandle;
  clearTimer(handle: TimerHandle): void;
}>;

type PendingTask<Result> = {
  handle: TimerHandle;
  sequence: number;
  task: HomepageAutosaveTask<Result>;
};

export function createHomepageAutosaveScheduler<Result = unknown>(options: SchedulerOptions) {
  const pending = new Map<string, PendingTask<Result>>();
  const attemptedRevision = new Map<string, number>();
  const nextSequence = new Map<string, number>();
  const activeSequence = new Map<string, number>();
  const inFlight = new Set<string>();

  function schedule(task: HomepageAutosaveTask<Result>) {
    const existing = pending.get(task.sectionId);
    if (existing?.task.revision === task.revision) {
      existing.task = task;
      return;
    }
    if (attemptedRevision.get(task.sectionId) === task.revision) return;
    if (existing) options.clearTimer(existing.handle);

    const sequence = (nextSequence.get(task.sectionId) ?? 0) + 1;
    nextSequence.set(task.sectionId, sequence);
    attemptedRevision.set(task.sectionId, task.revision);
    const record: PendingTask<Result> = {
      handle: undefined,
      sequence,
      task,
    };
    record.handle = options.setTimer(() => {
      pending.delete(task.sectionId);
      if (inFlight.has(task.sectionId)) {
        attemptedRevision.delete(task.sectionId);
        return;
      }
      inFlight.add(task.sectionId);
      activeSequence.set(task.sectionId, sequence);
      record.task.onStart(sequence);
      void record.task.run(sequence).then((result) => {
        if (activeSequence.get(task.sectionId) === sequence) record.task.onResult(result, sequence);
      }).catch((error: unknown) => {
        if (activeSequence.get(task.sectionId) === sequence) record.task.onError(error, sequence);
      }).finally(() => {
        if (activeSequence.get(task.sectionId) === sequence) activeSequence.delete(task.sectionId);
        inFlight.delete(task.sectionId);
      });
    }, options.delay);
    pending.set(task.sectionId, record);
  }

  function cancelPending(sectionId: string) {
    const record = pending.get(sectionId);
    if (record) {
      options.clearTimer(record.handle);
      pending.delete(sectionId);
      if (attemptedRevision.get(sectionId) === record.task.revision) attemptedRevision.delete(sectionId);
    }
  }

  function cancel(sectionId: string) {
    cancelPending(sectionId);
    const sequence = (nextSequence.get(sectionId) ?? 0) + 1;
    nextSequence.set(sectionId, sequence);
    activeSequence.set(sectionId, sequence);
  }

  function cancelAll() {
    const sectionIds = new Set([...pending.keys(), ...inFlight]);
    for (const sectionId of sectionIds) cancel(sectionId);
  }

  function retry(task: HomepageAutosaveTask<Result>) {
    attemptedRevision.delete(task.sectionId);
    schedule(task);
  }

  return { schedule, retry, cancelPending, cancel, cancelAll } as const;
}

type SaveAction = (input: unknown) => Promise<EditorActionResult<HomepageSectionDto>>;

type UseHomepageAutosaveOptions = Readonly<{
  locale: string;
  state: HomepageEditorState;
  dispatch: React.Dispatch<HomepageEditorEvent>;
  save: SaveAction;
}>;

function visualValues(draft: HomepageEditorDraft) {
  return Object.fromEntries(
    Object.entries(draft).filter(([key]) => key !== "id" && key !== "blockId"),
  );
}

export function useHomepageAutosave({ locale, state, dispatch, save }: UseHomepageAutosaveOptions) {
  const tasksRef = React.useRef(new Map<string, HomepageAutosaveTask<EditorActionResult<HomepageSectionDto>>>());
  const [savedAtById, setSavedAtById] = React.useState<Readonly<Record<string, Date>>>({});
  const [scheduler] = React.useState(() => createHomepageAutosaveScheduler<EditorActionResult<HomepageSectionDto>>({
      delay: 1000,
      setTimer: (callback, delay) => window.setTimeout(callback, delay),
      clearTimer: (handle) => window.clearTimeout(handle as number),
    }));

  React.useEffect(() => {
    const dirtyIds = new Set(state.dirtySectionIds);
    for (const sectionId of tasksRef.current.keys()) {
      if (!dirtyIds.has(sectionId)) {
        scheduler.cancelPending(sectionId);
        tasksRef.current.delete(sectionId);
      }
    }

    for (const sectionId of state.dirtySectionIds) {
      const draft = state.draftsBySectionId[sectionId];
      const base = state.baseSections.find((section) => section.id === sectionId);
      const revision = state.draftRevisionById[sectionId] ?? 0;
      if (!draft || !base || Object.keys(state.validationById[sectionId] ?? {}).length > 0) {
        scheduler.cancelPending(sectionId);
        tasksRef.current.delete(sectionId);
        continue;
      }

      const task: HomepageAutosaveTask<EditorActionResult<HomepageSectionDto>> = {
        sectionId,
        revision,
        onStart: (requestSequence) => dispatch({ type: "save-started", sectionId, requestSequence, draftRevision: revision }),
        run: () => save({ locale, id: sectionId, expectedUpdatedAt: base.updatedAt, section: visualValues(draft) }),
        onResult: (result, requestSequence) => {
          if (result.ok) {
            dispatch({ type: "save-succeeded", sectionId, requestSequence, savedDraftRevision: revision, section: result.data });
            setSavedAtById((current) => ({ ...current, [sectionId]: new Date() }));
          } else {
            dispatch({ type: "save-failed", sectionId, requestSequence, code: result.code, message: result.message });
          }
        },
        onError: (_error, requestSequence) => dispatch({
          type: "save-failed",
          sectionId,
          requestSequence,
          code: "PERSISTENCE",
          message: "The section could not be saved. Try again.",
        }),
      };
      tasksRef.current.set(sectionId, task);
      scheduler.schedule(task);
    }
  }, [dispatch, locale, save, scheduler, state]);

  React.useEffect(() => () => scheduler.cancelAll(), [scheduler]);

  const retry = React.useCallback((sectionId: string) => {
    const task = tasksRef.current.get(sectionId);
    if (task) scheduler.retry(task);
  }, [scheduler]);

  return { retry, savedAtById } as const;
}
