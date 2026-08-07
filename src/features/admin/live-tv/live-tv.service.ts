import "server-only";

import type { AdminIdentity } from "../auth/authorization.model.ts";
import {
  createLiveChannel,
  deleteLiveChannel,
  getCmsLiveChannels,
  getLiveChannel,
  getLiveTvCmsReferences,
  updateLiveChannel,
} from "../../live-tv/server/live-tv.repository.ts";
import { toLiveStreamDto } from "../../live-tv/server/live-tv.dto.ts";
import { createLiveTvOperations, LiveTvManagementError } from "./live-tv.operations.ts";
import {
  canManageLiveTv,
  canRemoveLiveTv,
  providerUrlFromRecord,
  type LiveTvFormInput,
} from "./live-tv.model.ts";

function allowedHlsHosts(): string[] {
  return (process.env.LIVE_TV_HLS_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLocaleLowerCase("en"))
    .filter(Boolean);
}

const operations = () => createLiveTvOperations(
  {
    create: createLiveChannel,
    update: updateLiveChannel,
    remove: deleteLiveChannel,
  },
  { allowedHlsHosts: allowedHlsHosts() },
);

function requireManager(admin: AdminIdentity): void {
  if (!canManageLiveTv(admin.role)) {
    throw new LiveTvManagementError("FORBIDDEN", "Your role cannot manage Live TV.");
  }
}

function languageCode(
  references: Awaited<ReturnType<typeof getLiveTvCmsReferences>>,
  languageId: string,
): string {
  const locale = references.languages.find((item) => item.id === languageId)?.code;
  if (!locale) throw new LiveTvManagementError("VALIDATION", "Select an active language.");
  return locale;
}

export async function getLiveTvEditorView(admin: AdminIdentity, selectedId?: string) {
  requireManager(admin);
  const [rows, references] = await Promise.all([getCmsLiveChannels(), getLiveTvCmsReferences()]);
  const items = rows.map((row) => {
    const stream = toLiveStreamDto(row);
    const relation = Array.isArray(row.language) ? row.language[0] : row.language;
    return {
      ...stream,
      languageCode: relation?.code ?? "en",
      languageName: relation?.name ?? "Unknown language",
      providerUrl: providerUrlFromRecord(stream),
    };
  });
  const selected = selectedId ? items.find((item) => item.id === selectedId) : null;
  if (selectedId && !selected) throw new LiveTvManagementError("NOT_FOUND", "Live TV configuration not found.");
  return {
    items,
    selected,
    references,
    canDelete: canRemoveLiveTv(admin.role),
    allowedHlsHosts: allowedHlsHosts(),
  } as const;
}

export async function createManagedLiveTv(admin: AdminIdentity, input: LiveTvFormInput) {
  requireManager(admin);
  const references = await getLiveTvCmsReferences();
  const row = await operations().create(admin, input) as { id: string };
  return { id: row.id, locales: [languageCode(references, String(input.languageId))] };
}

export async function updateManagedLiveTv(admin: AdminIdentity, id: string, input: LiveTvFormInput) {
  requireManager(admin);
  const [references, current] = await Promise.all([getLiveTvCmsReferences(), getLiveChannel(id)]);
  if (!current) throw new LiveTvManagementError("NOT_FOUND", "Live TV configuration not found.");
  await operations().update(admin, id, input);
  return {
    id,
    locales: [...new Set([
      languageCode(references, current.language_id),
      languageCode(references, String(input.languageId)),
    ])],
  };
}

export async function removeManagedLiveTv(admin: AdminIdentity, id: string) {
  requireManager(admin);
  const [references, current] = await Promise.all([getLiveTvCmsReferences(), getLiveChannel(id)]);
  if (!current) throw new LiveTvManagementError("NOT_FOUND", "Live TV configuration not found.");
  await operations().remove(admin, id);
  return { locales: [languageCode(references, current.language_id)] };
}

export { LiveTvManagementError };
