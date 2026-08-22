export const LOCAL_DRAFT_VERSION = 1;
const MAX_LOCAL_DRAFT_BYTES = 20_000;
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

export function draftStorageKey(userId: string, storyId: string): string {
  return `inbcn:reporter-draft:${userId}:${storyId}`;
}

function text(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.length <= maximum ? value : null;
}

function parsedTime(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

function parsedFields(value: unknown): LocalDraftFields | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  const title = text(fields.title, 240);
  const summary = text(fields.summary, 1_000);
  const body = text(fields.body, 15_000);
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
  if (draft.version !== LOCAL_DRAFT_VERSION || !userId || !UUID.test(userId) || !storyId || !UUID.test(storyId) || !updatedAt || !fields) return null;
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

export function clearLocalDraft(storage: SafeStorage, userId: string, storyId: string): void {
  try {
    storage.removeItem(draftStorageKey(userId, storyId));
  } catch {
    // Local recovery must never block the editor.
  }
}

export function chooseLocalDraft(local: LocalDraft | null, serverUpdatedAt: string): "restore" | "server" {
  return local && Date.parse(local.updatedAt) > Date.parse(serverUpdatedAt) ? "restore" : "server";
}

export function createDraftPersistence(storage: SafeStorage, timer: Timer = window): Readonly<{
  schedule(draft: LocalDraft): void;
  flush(): void;
  clear(userId: string, storyId: string): void;
}> {
  let pending: LocalDraft | null = null;
  let timeout: number | null = null;
  const flush = () => {
    if (timeout !== null) timer.clearTimeout(timeout);
    timeout = null;
    if (pending) saveLocalDraft(storage, pending);
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
      clearLocalDraft(storage, userId, storyId);
    },
  };
}
