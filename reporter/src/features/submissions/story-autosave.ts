type Snapshot = Readonly<{
  status: "idle" | "pending" | "saving" | "saved" | "error";
  dirty: boolean;
  persisted: boolean;
}>;
type Timer = Readonly<{
  setTimeout(callback: () => void, milliseconds: number): ReturnType<typeof setTimeout>;
  clearTimeout(id: ReturnType<typeof setTimeout>): void;
}>;

/** One writer for draft saves and media completion, using the editor's reserved ID. */
export function createStoryAutosave<T>(options: Readonly<{
  initial: T;
  persisted: boolean;
  canSave(value: T): boolean;
  save(value: T): Promise<Readonly<{ status: string }>>;
  timer?: Timer;
}>) {
  const timer = options.timer ?? globalThis;
  let latest = options.initial;
  let generation = 0;
  let savedGeneration = 0;
  let stopped = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let tail: Promise<unknown> = Promise.resolve();
  let snapshot: Snapshot = { status: options.persisted ? "saved" : "idle", dirty: false, persisted: options.persisted };
  const savedListeners = new Set<(value: T, current: boolean) => void>();
  const listeners = new Set<() => void>();
  const publish = (update: Partial<Snapshot>) => {
    snapshot = { ...snapshot, ...update };
    listeners.forEach(listener => listener());
  };
  const exclusive = <R,>(operation: () => Promise<R>): Promise<R> => {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  };
  const cancelTimer = () => {
    if (timeout !== undefined) timer.clearTimeout(timeout);
    timeout = undefined;
  };
  const flush = () => {
    cancelTimer();
    return exclusive(async () => {
      // Read after acquiring the lock: an upload may have appended canonical IDs.
      if (stopped || generation === savedGeneration || !options.canSave(latest)) return;
      const value = latest;
      const attemptGeneration = generation;
      publish({ status: "saving" });
      let success = false;
      try { success = (await options.save(value)).status === "success"; } catch { /* Keep the local snapshot for retry. */ }
      if (!success) { publish({ status: "error", dirty: true }); return; }
      savedGeneration = attemptGeneration;
      const current = generation === attemptGeneration;
      publish({ status: current ? "saved" : "pending", persisted: true, dirty: !current });
      savedListeners.forEach(listener => listener(value, current));
    });
  };
  return {
    getSnapshot: () => snapshot,
    subscribeSaved(listener: (value: T, current: boolean) => void) { savedListeners.add(listener); return () => { savedListeners.delete(listener); }; },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    edit(value: T) {
      if (stopped) return;
      latest = value;
      generation++;
      publish({ dirty: true, status: snapshot.status === "saving" ? "saving" : "pending" });
      cancelTimer();
      timeout = timer.setTimeout(() => { void flush(); }, 750);
    },
    flush,
    withDraft<R>(operation: () => Promise<R>): Promise<R> {
      return exclusive(async () => {
        if (stopped || !snapshot.persisted) throw new Error("The draft must be saved first.");
        return operation();
      });
    },
    cancelTimer,
    stop() { stopped = true; cancelTimer(); },
  };
}
