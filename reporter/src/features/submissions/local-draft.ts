export const LOCAL_DRAFT_VERSION = 1;
export const NEW_REPORTER_DRAFT_ID = "new";
const MAX_LOCAL_DRAFT_BYTES = 110_000;
const MAX_BODY_CHARACTERS = 100_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const LANGUAGES = new Set(["en", "hi", "mr"]);

export type LocalDraftMedia = Readonly<{ id: string; title: string; type: "image" | "video" }>;
export type LocalDraftFields = Readonly<{
  title: string;
  summary: string;
  body: string;
  languageCode: "" | "en" | "hi" | "mr";
  languageId: string;
  categoryId: string;
  eventOccurredAt: string;
  media: readonly LocalDraftMedia[];
  featuredMediaId: string | null;
}>;
export type LocalDraft = Readonly<{
  version: typeof LOCAL_DRAFT_VERSION;
  userId: string;
  storyId: string;
  updatedAt: string;
  fields: LocalDraftFields;
}>;

type SafeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Timer = Readonly<{ setTimeout(callback: () => void, milliseconds: number): number; clearTimeout(id: number): void }>;

export function clearRecoveryBeforeRefresh(clearRecovery: () => boolean, refresh: () => void): boolean {
  if (!clearRecovery()) return false;
  refresh();
  return true;
}

export function draftStorageKey(userId: string, storyId: string): string {
  return `inbcn:reporter-draft:${userId}:${storyId}`;
}

function text(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.length <= maximum ? value : null;
}

function parsedTime(value: unknown): string | null {
  if (value === "") return "";
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

function parsedFields(value: unknown): LocalDraftFields | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  const title = text(fields.title, 240);
  const summary = text(fields.summary, 1_000);
  const body = text(fields.body, MAX_BODY_CHARACTERS);
  const languageCode = fields.languageCode;
  const languageId = text(fields.languageId, 36);
  const categoryId = text(fields.categoryId, 36);
  const eventOccurredAt = parsedTime(fields.eventOccurredAt);
  const featuredMediaId = fields.featuredMediaId === null ? null : text(fields.featuredMediaId, 36);
  if (title === null || summary === null || body === null || languageCode !== "" && !LANGUAGES.has(languageCode as string)
    || languageId === null || languageId !== "" && !UUID.test(languageId) || categoryId === null || categoryId !== "" && !UUID.test(categoryId)
    || eventOccurredAt === null || featuredMediaId === null && fields.featuredMediaId !== null
    || featuredMediaId && !UUID.test(featuredMediaId) || !Array.isArray(fields.media) || fields.media.length > 50) return null;
  const media = fields.media.map((item): LocalDraftMedia | null => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    const id = text(record.id, 36);
    const mediaTitle = text(record.title, 200);
    return id && UUID.test(id) && mediaTitle !== null && (record.type === "image" || record.type === "video")
      ? { id, title: mediaTitle, type: record.type }
      : null;
  });
  if (media.some((item) => item === null)) return null;
  const canonicalMedia = media as LocalDraftMedia[];
  if (new Set(canonicalMedia.map((item) => item.id)).size !== canonicalMedia.length
    || featuredMediaId && !canonicalMedia.some((item) => item.id === featuredMediaId && item.type === "image")) return null;
  return { title, summary, body, languageCode: languageCode as LocalDraftFields["languageCode"], languageId, categoryId, eventOccurredAt, media: canonicalMedia, featuredMediaId };
}

function parseLocalDraft(value: unknown): LocalDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const draft = value as Record<string, unknown>;
  const userId = text(draft.userId, 36);
  const storyId = text(draft.storyId, 36);
  const updatedAt = parsedTime(draft.updatedAt);
  const fields = parsedFields(draft.fields);
  if (draft.version !== LOCAL_DRAFT_VERSION || !userId || !UUID.test(userId)
    || !storyId || (storyId !== NEW_REPORTER_DRAFT_ID && !UUID.test(storyId)) || !updatedAt || !fields) return null;
  return { version: LOCAL_DRAFT_VERSION, userId, storyId, updatedAt, fields };
}

export function loadLocalDraft(storage: SafeStorage, userId: string, storyId: string): LocalDraft | null {
  try {
    const raw = storage.getItem(draftStorageKey(userId, storyId));
    if (!raw || raw.length > MAX_LOCAL_DRAFT_BYTES) return null;
    const draft = parseLocalDraft(JSON.parse(raw));
    return draft?.userId === userId && draft.storyId === storyId ? draft : null;
  } catch {
    return null;
  }
}

export function saveLocalDraft(storage: SafeStorage, value: unknown): boolean {
  const draft = parseLocalDraft(value);
  if (!draft) return false;
  try {
    const serialized = JSON.stringify(draft);
    if (serialized.length > MAX_LOCAL_DRAFT_BYTES) return false;
    storage.setItem(draftStorageKey(draft.userId, draft.storyId), serialized);
    return true;
  } catch {
    return false;
  }
}

export function clearLocalDraft(storage: SafeStorage, userId: string, storyId: string): boolean {
  try {
    storage.removeItem(draftStorageKey(userId, storyId));
    return storage.getItem(draftStorageKey(userId, storyId)) === null;
  } catch {
    return false;
  }
}

export function chooseLocalDraft(local: LocalDraft | null, serverUpdatedAt: string): "restore" | "server" {
  return local && Date.parse(local.updatedAt) > Date.parse(serverUpdatedAt) ? "restore" : "server";
}

export function shouldOfferLocalDraft(
  local: LocalDraft | null,
  isPersisted: boolean,
  serverUpdatedAt: string,
): boolean {
  return !isPersisted ? local !== null : chooseLocalDraft(local, serverUpdatedAt) === "restore";
}

export function migrateLocalDraft(
  storage: SafeStorage,
  userId: string,
  fromStoryId: string,
  toStoryId: string,
  fields: LocalDraftFields,
  serverUpdatedAt?: string,
  clientNow?: string,
): boolean {
  if (fromStoryId === toStoryId) return false;
  const target = loadLocalDraft(storage, userId, toStoryId);
  const serverMilliseconds = Date.parse(serverUpdatedAt ?? "");
  const clientMilliseconds = Date.parse(clientNow ?? "");
  const updatedAt = new Date(Math.max(
    Number.isFinite(clientMilliseconds) ? clientMilliseconds : Date.now(),
    Number.isFinite(serverMilliseconds) ? serverMilliseconds + 1 : 0,
  )).toISOString();
  if (target && Date.parse(target.updatedAt) >= Date.parse(updatedAt)) {
    return clearLocalDraft(storage, userId, fromStoryId);
  }
  const candidate: LocalDraft = {
    version: LOCAL_DRAFT_VERSION,
    userId,
    storyId: toStoryId,
    updatedAt,
    fields,
  };
  if (!saveLocalDraft(storage, candidate)) return false;
  const copied = loadLocalDraft(storage, userId, toStoryId);
  if (!copied || copied.updatedAt !== candidate.updatedAt) return false;
  return clearLocalDraft(storage, userId, fromStoryId);
}

export function createDraftPersistence(
  storage: SafeStorage,
  timer: Timer = window,
  onFailure: () => void = () => {},
): Readonly<{
  schedule(draft: LocalDraft): void;
  flush(): void;
  clear(userId: string, storyId: string): boolean;
}> {
  let pending: LocalDraft | null = null;
  let timeout: number | null = null;
  const flush = () => {
    if (timeout !== null) timer.clearTimeout(timeout);
    timeout = null;
    if (pending && !saveLocalDraft(storage, pending)) onFailure();
    pending = null;
  };
  return {
    schedule(draft) {
      pending = draft;
      if (timeout !== null) timer.clearTimeout(timeout);
      timeout = timer.setTimeout(flush, 750);
    },
    flush,
    clear(userId, storyId) {
      pending = null;
      if (timeout !== null) timer.clearTimeout(timeout);
      timeout = null;
      return clearLocalDraft(storage, userId, storyId);
    },
  };
}

export function createDraftSaveTracker() {
  let generation = 0;
  let attempt = 0;
  let acknowledged = 0;
  return {
    edit() { generation += 1; },
    snapshot() { return generation; },
    beginSave() { return { attempt: ++attempt, generation }; },
    isCurrentGeneration(candidate: number) { return candidate === generation; },
    acknowledge(result: Readonly<{ attempt: number; generation: number; status: "success" | "error" | "idle" }>) {
      if (result.attempt <= acknowledged) return { clear: false, stale: false };
      acknowledged = result.attempt;
      const stale = result.status === "success" && result.generation !== generation;
      return { clear: result.status === "success" && !stale, stale };
    },
  } as const;
}
